import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from forkfit.models import AdapterOutput, AgentReview, ConstraintSpec, Meal, MealPack, QualityReport, RecipePatch, RecipePatchOperation, RunTrace, UserProfile
from forkfit.recipe_agent_v3 import PatchApplier, PatchValidationError
from forkfit.stores.posts import _matches_category
from forkfit.workers.meal_plan_runner import _change_preview
from forkfit.langgraph_workflow_v3 import ForkFitLangGraphWorkflow
from test_meal_plan_conversation import _plan
from test_agent_workflow_v3 import FakeLLM, FakeTool


class BrowserAuditRegressions(unittest.TestCase):
    def test_equipment_exclusion_is_not_a_dietary_restriction(self):
        from forkfit.constraints import ConstraintNormalizer
        for text in ("不要用烤箱", "不要使用烤箱", "不用烤箱", "不要烤箱"):
            with self.subTest(text=text):
                spec = ConstraintNormalizer().normalize(UserProfile(1), text)
                self.assertEqual([(i.kind, i.value) for i in spec.items], [("excluded_equipment", "烤箱")])

    def test_review_retries_encoded_equipment_instead_of_blocking_every_utensil(self):
        from forkfit.recipe_review_agent import RecipeReviewAgent
        from forkfit.constraints import ConstraintGuard
        llm = Mock()
        llm.complete_json.side_effect = [
            {"constraints": {"items": [{"kind": "equipment", "value": "exclude_oven"}]}, "review": {"status": "pass", "findings": []}},
            {"constraints": {"items": [{"kind": "excluded_equipment", "value": "烤箱"}]}, "review": {"status": "pass", "findings": []}},
        ]
        meal = MealPack("p", "家常", "晚餐", [Meal("m", "晚餐", "炒菜", ["豆腐"], ["炒锅"], 20, steps=["炒熟豆腐"])])
        spec, _ = RecipeReviewAgent(llm).understand_and_review(UserProfile(1), "不要用烤箱", meal, locale="zh")
        self.assertEqual(llm.complete_json.call_count, 2)
        self.assertNotIn("exclude_oven", [i.value for i in spec.items])
        self.assertEqual(ConstraintGuard().review(meal, spec, "zh").status, "pass")
        meal.meals[0].equipment = ["烤箱"]
        self.assertEqual(ConstraintGuard().review(meal, spec, "zh").status, "block")

    def test_patch_list_contract_supports_clearing_tags_but_not_steps(self):
        original = MealPack("p", "家常", "晚餐", [Meal("m", "晚餐", "炒菜", ["豆腐"], ["炒锅"], 20, tags=["烤制"], steps=["炒熟豆腐"] )])
        applier = PatchApplier()
        updated, _ = applier.apply(original, RecipePatch([RecipePatchOperation("update_tags", "m", "", [], "去掉过期标签")], "更新标签"))
        self.assertEqual(updated.meals[0].tags, [])
        self.assertEqual(original.meals[0].tags, ["烤制"])
        for operation, value in (("update_tags", "清炒"), ("replace_steps", []), ("replace_steps", "炒熟")):
            with self.subTest(operation=operation, value=value):
                with self.assertRaisesRegex(PatchValidationError, f"{operation}.value must be an array"):
                    applier.apply(original, RecipePatch([RecipePatchOperation(operation, "m", "", value, "调整")], "调整"))
        for value in (True, 1.5, "20", 0, 361):
            with self.subTest(value=value):
                with self.assertRaisesRegex(PatchValidationError, "set_cook_time.value"):
                    applier.apply(original, RecipePatch([RecipePatchOperation("set_cook_time", "m", "", value, "调整")], "调整"))

    def test_invalid_tags_receive_specific_repair_and_never_become_a_user_question(self):
        original = MealPack("p", "家常", "晚餐", [Meal("m", "晚餐", "炒菜", ["豆腐"], ["炒锅"], 20, steps=["炒熟豆腐"])])
        for repairs_successfully in (True, False):
            with self.subTest(repairs_successfully=repairs_successfully):
                workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
                workflow.reviewer = Mock()
                workflow.reviewer.understand_and_review.return_value = (ConstraintSpec([], 1, 30), AgentReview("reviewer", "pass", []))
                workflow.reviewer.review_adjusted.return_value = QualityReport("pass", [])
                workflow.adapter = Mock()
                workflow.adapter.generate.side_effect = [
                    (RecipePatch([RecipePatchOperation("update_tags", "m", "", "清炒", "调整")], "调整"), {}),
                    (RecipePatch([RecipePatchOperation("update_tags", "m", "", ["清炒"] if repairs_successfully else "清炒", "修复")], "修复"), {}),
                ]
                if repairs_successfully:
                    result = workflow.run(UserProfile(1), original, locale="zh", require_change=True)
                    self.assertTrue(result.success)
                    self.assertEqual(result.adapter_output.forked_meal_pack.meals[0].tags, ["清炒"])
                else:
                    with self.assertRaisesRegex(ValueError, "格式校验失败.*请重试"):
                        workflow.run(UserProfile(1), original, locale="zh", require_change=True)
                    workflow.reviewer.review_adjusted.assert_not_called()
                self.assertEqual(workflow.adapter.generate.call_count, 2)
                issue = workflow.adapter.generate.call_args.kwargs["repair_issues"][0]
                self.assertIn("update_tags.value must be an array", issue.repair_instruction)
                self.assertEqual(original.meals[0].tags, [])

    def test_vegetables_do_not_make_meat_recipes_vegetarian(self):
        for ingredients in (["三文鱼", "蔬菜"], ["鸡肉", "花椰菜"], ["duck", "potato"], ["豆腐", "蚝油"]):
            meal = Meal("m", "晚餐", "蔬菜便当", ingredients, ["锅"], 20, tags=["素食"], steps=["炒熟"])
            post = SimpleNamespace(title=meal.name, theme="健康", description="多吃蔬菜", recipe=meal)
            self.assertFalse(_matches_category(post, "素食"))

    def test_explicit_vegetarian_recipe_passes_without_substring_false_positive(self):
        meal = Meal("m", "晚餐", "chamomile tofu", ["tofu", "chamomile"], ["pot"], 20, tags=["vegetarian"], steps=["Cook"])
        self.assertTrue(_matches_category(SimpleNamespace(title=meal.name, theme="", description="", recipe=meal), "素食"))

    def test_diff_describes_ingredient_and_steps_not_a_fake_recipe_swap(self):
        before = _plan().result
        after = before.model_copy(deep=True)
        meal = after.days[1].dishes[0].meal
        meal.ingredients.remove("葱 适量")
        meal.steps = ["处理鱼，煎熟后焖煮。"]
        changes = _change_preview(before, after)
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["day_index"], 2)
        self.assertEqual(changes[0]["before"], changes[0]["after"])
        self.assertEqual(changes[0]["changed_fields"], ["移除：葱 适量", "制作步骤已更新"])

    def test_stale_main_ingredient_name_is_blocked_even_if_reviewer_passes(self):
        workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
        workflow.reviewer = Mock()
        workflow.reviewer.review_adjusted.return_value = QualityReport("pass", [])
        original = MealPack("p", "番茄牛肉", "家常", [Meal("m", "晚餐", "番茄牛肉", ["牛肉", "番茄"], ["炒锅"], 20, steps=["煮熟牛肉和番茄。"])])
        modified = original.clone()
        modified.meals[0].ingredients = ["豆腐", "番茄"]
        modified.meals[0].steps = ["煮熟豆腐和番茄。"]
        state = {"meal_pack": original, "adapter_output": AdapterOutput(modified, [], [], "调整"), "constraint_spec": ConstraintSpec([], 1, 30), "locale": "zh", "trace": RunTrace()}
        result = workflow._review_output(state)
        self.assertEqual(result["quality_report"].status, "block")
        self.assertIn("stale_recipe_name", [issue.code for issue in result["quality_report"].issues])


if __name__ == "__main__":
    unittest.main()
