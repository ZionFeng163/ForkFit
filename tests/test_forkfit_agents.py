import json
import unittest

from forkfit import ForkFitLangGraphWorkflow, Meal, MealPack, UserProfile
from forkfit.constraints import ConstraintGuard, ConstraintNormalizer
from forkfit.models import ConstraintEvidence, ConstraintSpec, RecipePatch, RecipePatchOperation, ToolEvidence
from forkfit.recipe_agent import PatchApplier, PatchValidationError, recipe_patch_from_dict


class FakeSubstitutionTool:
    def lookup(self, ingredient, exclude_allergens=None):
        if "花生" in ingredient:
            return [{"substitute": "芝麻酱", "ratio": "1:1", "approved": True, "source_entry": "test"}]
        return []


class FakeLLM:
    model = "qwen3.7-max-2026-05-20"

    def __init__(self):
        self.calls = []

    def complete_json(self, *, agent, user, **kwargs):
        self.calls.append(agent)
        request = json.loads(user)
        if agent == "culinary_critic":
            return {"status": "pass", "issues": []}
        candidates = request["approved_candidates"]
        operations = []
        for meal_id, ingredients in candidates.items():
            for ingredient, choices in ingredients.items():
                choice = choices[0]
                operations.append({
                    "op": "replace_ingredient", "meal_id": meal_id,
                    "target": ingredient, "value": choice["substitute"],
                    "reason": "去除冲突食材", "evidence_refs": [choice["evidence_id"]],
                })
                source = next(item for item in request["meal_pack"]["meals"] if item["id"] == meal_id)
                operations.extend([
                    {"op": "set_name", "meal_id": meal_id, "target": "name", "value": source["name"].replace("花生", "芝麻"), "reason": "同步菜名"},
                    {"op": "update_tags", "meal_id": meal_id, "target": "tags", "value": [tag.replace("花生", "芝麻") for tag in source["tags"]], "reason": "同步标签"},
                    {"op": "replace_steps", "meal_id": meal_id, "target": "steps", "value": [step.replace("花生酱", "芝麻酱") for step in source["steps"]], "reason": "同步步骤"},
                ])
        return {"operations": operations, "summary": "已按要求调整", "description": ""}


def meal_pack():
    return MealPack("p1", "晚餐", "家常", [Meal(
        "m1", "周一", "花生拌面", ["面条", "花生酱"], ["灶台"], 20,
        tags=["花生"], steps=["加入花生酱拌匀"],
    )])


class WorkflowV2Tests(unittest.TestCase):
    def test_clean_recipe_uses_no_model_call(self):
        llm = FakeLLM()
        result = ForkFitLangGraphWorkflow(llm, FakeSubstitutionTool()).run(
            UserProfile(1), meal_pack(), locale="zh"
        )
        self.assertTrue(result.success)
        self.assertEqual(llm.calls, [])

    def test_allergy_uses_approved_candidate(self):
        llm = FakeLLM()
        result = ForkFitLangGraphWorkflow(llm, FakeSubstitutionTool()).run(
            UserProfile(1, allergies=["花生"]), meal_pack(), locale="zh"
        )
        self.assertTrue(result.success)
        self.assertEqual(llm.calls, ["adaptation", "culinary_critic"])
        self.assertIn("芝麻酱", result.adapter_output.forked_meal_pack.meals[0].ingredients)
        self.assertTrue(result.evidence[0].approved)

    def test_missing_trusted_candidate_requests_input(self):
        result = ForkFitLangGraphWorkflow(FakeLLM(), FakeSubstitutionTool()).run(
            UserProfile(1, allergies=["面条"]), meal_pack(), locale="zh"
        )
        self.assertFalse(result.success)
        self.assertTrue(result.adapter_output.unresolved_items)

    def test_ambiguous_high_risk_text_requests_input(self):
        spec = ConstraintNormalizer().normalize(UserProfile(1), "我好像对坚果过敏")
        self.assertIsNotNone(spec.clarification)

    def test_natural_chinese_time_request_is_normalized(self):
        spec = ConstraintNormalizer().normalize(UserProfile(1), "我今晚只有20分钟，想少放盐")
        self.assertEqual(spec.max_cook_time_minutes, 20)

    def test_impossible_time_preserves_dish_identity(self):
        source = meal_pack()
        source.meals[0].name = "牛肉派"
        source.meals[0].cook_time_minutes = 60
        llm = FakeLLM()
        result = ForkFitLangGraphWorkflow(llm, FakeSubstitutionTool()).run(
            UserProfile(1, max_cook_time_minutes=20), source, locale="zh",
            request_text="控制在20分钟内",
        )
        self.assertFalse(result.success)
        self.assertEqual(llm.calls, [])
        self.assertEqual(result.adapter_output.unresolved_items[0].type, "identity_risk")

    def test_empty_equipment_means_unspecified(self):
        spec = ConstraintSpec([], 1, 30)
        self.assertEqual(ConstraintGuard().review(meal_pack(), spec).status, "pass")

    def test_ingredient_patch_requires_evidence(self):
        patch = RecipePatch(operations=[RecipePatchOperation(
            "replace_ingredient", "m1", "花生酱", "芝麻酱", "test"
        )], summary="test")
        with self.assertRaises(PatchValidationError):
            PatchApplier().apply(meal_pack(), patch)

    def test_ingredient_patch_accepts_approved_evidence(self):
        evidence = ToolEvidence("e1", "kb", "test", "花生酱 -> 芝麻酱", 1.0, approved=True)
        patch = RecipePatch(
            operations=[RecipePatchOperation(
                "replace_ingredient", "m1", "花生酱", "芝麻酱", "test", ["e1"]
            )], summary="test", evidence=[evidence],
        )
        updated, _ = PatchApplier().apply(meal_pack(), patch)
        self.assertIn("芝麻酱", updated.meals[0].ingredients)

    def test_string_clarification_does_not_crash_patch_parser(self):
        patch = recipe_patch_from_dict({
            "operations": [],
            "unresolved_items": ["请确认是否可以改成另一道快手菜。"],
        }, [])
        self.assertEqual(patch.unresolved_items[0].type, "model_clarification")

    def test_duplicate_quantity_variants_are_rejected(self):
        source = meal_pack()
        source.meals[0].ingredients = ["900克 牛肉", "200克 瘦牛肉片", "米饭"]
        issues = ForkFitLangGraphWorkflow._duplicate_ingredient_issues(source)
        self.assertEqual(issues[0].code, "duplicate_ingredient")


if __name__ == "__main__":
    unittest.main()
