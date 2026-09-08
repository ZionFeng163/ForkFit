import unittest
import json

from forkfit.langgraph_workflow_v3 import ForkFitLangGraphWorkflow
from forkfit.llm import ToolAgentResult
from forkfit.models import Meal, MealPack, UserProfile


def pass_review(user):
    request = json.loads(user)
    return {"status": "pass", "issues": [], "checks": [
        {"requirement_id": requirement, "meal_id": meal["id"], "verdict": "satisfied",
         "reason": "Test fixture", "evidence": [{"field": "ingredients", "index": 0}]}
        for requirement in request["requirements"] for meal in request["adjusted"]["meals"]
    ]}


class FakeTool:
    def __init__(self): self.calls = []
    def lookup(self, ingredient, exclude_allergens=None, **kwargs):
        self.calls.append((ingredient, exclude_allergens, kwargs))
        return [{"substitute": "葵花籽酱", "ratio": "1:1", "taste_profile": "香浓", "category": "seed paste"}]


class FakeLLM:
    model = "deepseek-v4-flash-0731"
    def __init__(self): self.agents = []
    def complete_json(self, *, agent, user, **kwargs):
        self.agents.append(agent)
        if agent == "recipe_reviewer" and "constraints" in user and "review" in user:
            return {"constraints": {"items": [{"kind": "allergy", "value": "花生", "hard": True}], "people_count": 1, "max_cook_time_minutes": 20},
                    "review": {"status": "block", "findings": [{"type": "allergy", "severity": "high", "affected_items": ["m1"], "affected_ingredients": ["花生酱"], "message": "含花生", "required_action": "替换花生酱"}]}}
        if agent == "recipe_reviewer": return pass_review(user)
        raise AssertionError(agent)
    def complete_with_tools(self, *, tools, trace=None, **kwargs):
        self.agents.append("recipe_adapter")
        arguments = {"ingredient": "花生酱", "excluded_allergens": ["花生"], "desired_taste": "香浓", "desired_texture": "顺滑", "cooking_use": "拌面", "top_k": 3}
        result = tools[0].handler(arguments)
        return ToolAgentResult({"operations": [
            {"op": "replace_ingredient", "meal_id": "m1", "target": "花生酱", "value": "葵花籽酱", "reason": "避开花生"},
            {"op": "set_name", "meal_id": "m1", "target": "花生拌面", "value": "葵花籽酱拌面", "reason": "同步菜名"},
            {"op": "replace_steps", "meal_id": "m1", "target": "", "value": ["加入葵花籽酱拌匀"], "reason": "同步步骤"}], "summary": "已替换冲突食材"},
            [{"tool": "search_substitutions", "arguments": arguments, "result": result}])


def pack():
    return MealPack("p1", "晚餐", "家常", [Meal("m1", "周一", "花生拌面", ["面条", "花生酱"], ["灶台"], 20, steps=["加入花生酱拌匀"])])


class AgentWorkflowV3Tests(unittest.TestCase):
    def test_requested_edit_with_no_changes_repairs_once_then_stops(self):
        from unittest.mock import Mock
        from forkfit.models import ConstraintSpec, AgentReview, RecipePatch
        workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
        workflow.reviewer = Mock()
        workflow.reviewer.understand_and_review.return_value = (ConstraintSpec([], 1, 30), AgentReview("reviewer", "pass", []))
        workflow.adapter = Mock()
        workflow.adapter.generate.return_value = (RecipePatch([], "", ""), {})
        result = workflow.run(UserProfile(1), pack(), locale="zh", request_text="少放盐", require_change=True)
        self.assertFalse(result.success)
        self.assertEqual(workflow.adapter.generate.call_count, 2)
        self.assertEqual(result.trace.repair_count, 1)
        workflow.reviewer.review_adjusted.assert_not_called()

    def test_hard_constraint_verdict_cannot_be_downgraded_by_unrelated_issue(self):
        from unittest.mock import Mock
        from forkfit.models import ConstraintSpec, ConstraintEvidence
        from forkfit.recipe_review_agent import RecipeReviewAgent
        for verdict in ("violated", "uncertain"):
            def response(*, user, **kwargs):
                result = pass_review(user)
                for check in result["checks"]:
                    if check["requirement_id"] == "constraint_0":
                        check["verdict"] = verdict
                result.update(status="warn", issues=[{"code": "cosmetic", "severity": "low", "meal_id": "m1",
                    "requirement_id": "integrity", "message": "装盘一般", "repair_instruction": "调整装盘"}])
                return result
            llm = Mock()
            llm.complete_json.side_effect = response
            spec = ConstraintSpec([ConstraintEvidence("equipment", "电饭煲", True, "profile")], 1, 30)
            report = RecipeReviewAgent(llm).review_adjusted(pack(), pack(), spec, locale="zh")
            self.assertEqual(report.status, "block")
            self.assertTrue(any(issue.severity == "high" for issue in report.issues))

    def test_review_rejects_missing_checks_and_invented_evidence(self):
        from unittest.mock import Mock
        from forkfit.models import ConstraintSpec
        from forkfit.recipe_review_agent import RecipeReviewAgent
        for missing in (True, False):
            def response(*, user, **kwargs):
                result = pass_review(user)
                if missing:
                    result["checks"].pop()
                else:
                    result["checks"][0]["evidence"][0]["index"] = 999
                return result
            llm = Mock()
            llm.complete_json.side_effect = response
            with self.assertRaisesRegex(ValueError, "failed validation"):
                RecipeReviewAgent(llm).review_adjusted(pack(), pack(), ConstraintSpec([], 1, 30), locale="zh")
            self.assertEqual(llm.complete_json.call_count, 2)

    def test_malformed_or_contradictory_review_cannot_pass(self):
        from unittest.mock import Mock
        from forkfit.models import ConstraintSpec
        from forkfit.recipe_review_agent import RecipeReviewAgent
        for payload in ({}, {"status": "pass"}, {"status": "block", "issues": []}):
            with self.subTest(payload=payload):
                llm = Mock()
                llm.complete_json.return_value = payload
                with self.assertRaisesRegex(ValueError, "failed validation"):
                    RecipeReviewAgent(llm).review_adjusted(pack(), pack(), ConstraintSpec([], 1, 30), locale="zh")
                self.assertEqual(llm.complete_json.call_count, 2)

    def test_unchanged_recipe_still_gets_final_review_with_raw_request(self):
        from unittest.mock import Mock
        from forkfit.constraints import ConstraintNormalizer
        from forkfit.models import AgentReview, QualityReport
        workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
        workflow.reviewer = Mock()
        workflow.reviewer.understand_and_review.return_value = (
            ConstraintNormalizer().normalize(UserProfile(1)), AgentReview("reviewer", "pass", [])
        )
        workflow.reviewer.review_adjusted.return_value = QualityReport("pass", [])
        result = workflow.run(UserProfile(1), pack(), locale="zh", request_text="做得家常一点")
        self.assertTrue(result.success)
        workflow.reviewer.review_adjusted.assert_called_once()
        self.assertEqual(workflow.reviewer.review_adjusted.call_args.kwargs["request_text"], "做得家常一点")

    def test_global_issue_is_not_limited_by_another_targeted_issue(self):
        from unittest.mock import Mock
        from forkfit.constraints import ConstraintNormalizer
        from forkfit.models import AgentFinding, RecipePatch, RunTrace
        workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
        workflow.adapter = Mock()
        workflow.adapter.generate.return_value = (RecipePatch([], "", ""), {})
        meals = pack()
        other = meals.meals[0].clone()
        other.id = "m2"
        meals.meals.append(other)
        workflow._adapt({"meal_pack": meals, "constraint_spec": ConstraintNormalizer().normalize(UserProfile(1)),
                         "locale": "zh", "trace": RunTrace(), "findings": [
                             AgentFinding("time", "high", [], "所有菜限时"),
                             AgentFinding("equipment", "high", ["m1"], "第一道菜厨具不符"),
                         ]})
        self.assertEqual({call.args[0].meals[0].id for call in workflow.adapter.generate.call_args_list}, {"m1", "m2"})

    def test_repair_targets_each_affected_recipe_with_its_own_issues(self):
        from unittest.mock import Mock
        from forkfit.constraints import ConstraintNormalizer
        from forkfit.models import AgentFinding, QualityIssue, RecipePatch, RunTrace
        workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
        workflow.adapter = Mock()
        workflow.adapter.generate.return_value = (RecipePatch([], "", ""), {})
        meals = pack()
        other = meals.meals[0].clone()
        other.id = "m2"
        meals.meals.append(other)
        state = {"meal_pack": meals, "constraint_spec": ConstraintNormalizer().normalize(UserProfile(1)),
                 "locale": "zh", "trace": RunTrace(),
                 "findings": [AgentFinding("allergy", "high", ["m1"], "原始冲突")],
                 "repair_issues": [QualityIssue("equipment", "high", "m2", "缺少烤箱步骤", "改用炒锅")]}
        result = workflow._repair(state)
        calls = {call.args[0].meals[0].id: call for call in workflow.adapter.generate.call_args_list}
        self.assertEqual(set(calls), {"m1", "m2"})
        self.assertEqual(calls["m1"].kwargs["repair_issues"], [])
        self.assertEqual(calls["m2"].kwargs["repair_issues"][0].meal_id, "m2")
        self.assertEqual(result["repair_count"], 1)

    def test_explicit_conversation_change_does_not_skip_adapter(self):
        from unittest.mock import Mock
        from forkfit.constraints import ConstraintNormalizer
        from forkfit.models import AgentReview, RunTrace
        workflow = ForkFitLangGraphWorkflow(FakeLLM(), FakeTool())
        workflow.reviewer = Mock()
        workflow.reviewer.understand_and_review.return_value = (
            ConstraintNormalizer().normalize(UserProfile(1)), AgentReview("reviewer", "pass", [])
        )
        state = {"meal_pack": pack(), "user_profile": UserProfile(1), "locale": "zh",
                 "trace": RunTrace(), "request_text": "少放盐", "require_change": True}
        result = workflow._review_input(state)
        self.assertEqual(workflow._after_input(result), "adapt")
        self.assertEqual(result["findings"][0].required_action, "少放盐")
        from forkfit.models import AgentFinding
        workflow.reviewer.understand_and_review.return_value = (
            ConstraintNormalizer().normalize(UserProfile(1)),
            AgentReview("reviewer", "warn", [AgentFinding("preference", "low", ["m1"], "其他建议")]),
        )
        result = workflow._review_input(state)
        self.assertTrue(any(f.required_action == "少放盐" for f in result["findings"]))

    def test_invalid_json_is_bounded_and_returns_unresolved_patch(self):
        from unittest.mock import Mock
        from forkfit.constraints import ConstraintNormalizer
        from forkfit.models import AgentFinding
        from forkfit.recipe_agent_v3 import AdaptationAgent

        for with_tool in (False, True):
            with self.subTest(with_tool=with_tool):
                llm = Mock()
                method = llm.complete_with_tools if with_tool else llm.complete_json
                method.side_effect = ValueError("Model response must be a JSON object.")
                agent = AdaptationAgent(llm, FakeTool() if with_tool else None)
                patch, _ = agent.generate(
                    pack(), ConstraintNormalizer().normalize(UserProfile(1)),
                    [AgentFinding("allergy", "high", ["m1"], "含花生")], locale="zh",
                )
                self.assertEqual(method.call_count, 2)
                self.assertTrue(patch.unresolved_items)
                self.assertEqual(patch.operations, [])

    def test_model_cannot_omit_or_weaken_explicit_request_constraints(self):
        from forkfit.constraints import ConstraintGuard
        from forkfit.recipe_review_agent import RecipeReviewAgent

        spec = RecipeReviewAgent._constraint_spec(
            {"items": [{"kind": "allergy", "value": "花生", "hard": False}],
             "max_cook_time_minutes": 120},
            UserProfile(1, allergies=["花生"], max_cook_time_minutes=30),
            "三天家常菜，不要香菜",
        )
        self.assertTrue(next(item for item in spec.items if item.kind == "allergy").hard)
        self.assertEqual(spec.max_cook_time_minutes, 30)
        review = ConstraintGuard().review(
            MealPack("p", "菜谱", "家常", [Meal("m", "", "炒青菜", ["青菜", "香菜"], [], 20)]),
            spec, "zh",
        )
        self.assertEqual(review.status, "block")
        self.assertEqual(review.findings[0].affected_ingredients, ["香菜"])

    def test_reviewer_understands_then_adapter_calls_only_tool_and_reviewer_rechecks(self):
        llm, tool = FakeLLM(), FakeTool()
        result = ForkFitLangGraphWorkflow(llm, tool).run(UserProfile(1), pack(), locale="zh", request_text="不吃花生，口感顺滑")
        self.assertTrue(result.success)
        self.assertEqual(llm.agents, ["recipe_reviewer", "recipe_adapter", "recipe_reviewer"])
        self.assertEqual(tool.calls[0][2]["desired_texture"], "顺滑")
        self.assertIn("葵花籽酱", result.adapter_output.forked_meal_pack.meals[0].ingredients)
        self.assertEqual(result.evidence, [])

    def test_safety_replacement_not_returned_by_tool_is_rejected_after_one_repair(self):
        class BadLLM(FakeLLM):
            def complete_with_tools(self, *, tools, **kwargs):
                arguments = {"ingredient": "花生酱", "excluded_allergens": ["花生"], "desired_taste": "", "desired_texture": "", "cooking_use": "", "top_k": 3}
                result = tools[0].handler(arguments)
                return ToolAgentResult({"operations": [{"op": "replace_ingredient", "meal_id": "m1", "target": "花生酱", "value": "模型凭空编造酱", "reason": "替换"}], "summary": "替换"}, [{"tool": "search_substitutions", "arguments": arguments, "result": result}])
        result = ForkFitLangGraphWorkflow(BadLLM(), FakeTool()).run(UserProfile(1), pack(), locale="zh", request_text="花生过敏")
        self.assertFalse(result.success)
        self.assertEqual(result.trace.repair_count, 1)

    def test_deterministic_guard_supplements_missed_explicit_allergy(self):
        class MissedReviewLLM(FakeLLM):
            def complete_json(self, *, agent, user, **kwargs):
                if agent == "recipe_reviewer" and "constraints" in user and "review" in user:
                    return {
                        "constraints": {"items": [{"kind": "allergy", "value": "花生", "hard": True}], "people_count": 1, "max_cook_time_minutes": 20},
                        "review": {"status": "pass", "findings": []},
                    }
                return super().complete_json(agent=agent, user=user, **kwargs)

        result = ForkFitLangGraphWorkflow(MissedReviewLLM(), FakeTool()).run(
            UserProfile(1, allergies=["花生"]), pack(), locale="zh"
        )
        self.assertTrue(result.success)
        self.assertEqual(result.reviews[0].findings[0].affected_ingredients, ["花生酱"])

    def test_equipment_adjustment_does_not_receive_substitution_tool(self):
        class EquipmentLLM:
            model = "test-model"

            def complete_json(self, *, agent, user, **_kwargs):
                if agent == "recipe_reviewer" and "constraints" in user and "review" in user:
                    return {
                        "constraints": {"items": [{"kind": "equipment", "value": "炒锅", "hard": True}], "people_count": 1, "max_cook_time_minutes": 30},
                        "review": {"status": "block", "findings": [{"type": "equipment", "severity": "high", "affected_items": ["m1"], "affected_ingredients": [], "message": "没有烤箱", "required_action": "改用炒锅"}]},
                    }
                if agent == "recipe_adapter":
                    return {"operations": [{"op": "replace_equipment", "meal_id": "m1", "target": "烤箱", "value": "炒锅", "reason": "使用现有厨具"}], "summary": "已改用炒锅"}
                if agent == "recipe_reviewer":
                    return pass_review(user)
                raise AssertionError(agent)

            def complete_with_tools(self, **_kwargs):
                raise AssertionError("equipment adjustment must not receive substitution tools")

        equipment_pack = MealPack("p2", "烤蔬菜", "家常", [
            Meal("m1", "周一", "烤花椰菜", ["花椰菜"], ["烤箱"], 25, steps=["放入烤箱烤熟"])
        ])
        result = ForkFitLangGraphWorkflow(EquipmentLLM(), FakeTool()).run(
            UserProfile(1, equipment=["炒锅"]), equipment_pack, locale="zh"
        )
        self.assertTrue(result.success)
        self.assertEqual(result.adapter_output.forked_meal_pack.meals[0].equipment, ["炒锅"])

    def test_ambiguous_safety_request_cannot_silently_pass(self):
        class AmbiguousLLM:
            model = "test-model"

            def complete_json(self, **_kwargs):
                return {
                    "constraints": {"items": [], "people_count": 1, "max_cook_time_minutes": 30, "clarification": None},
                    "review": {"status": "pass", "findings": []},
                }

            def complete_with_tools(self, **_kwargs):
                raise AssertionError("clarification must stop before adaptation")

        result = ForkFitLangGraphWorkflow(AmbiguousLLM(), FakeTool()).run(
            UserProfile(1), pack(), locale="zh",
            request_text="吃完这道菜会不舒服，但我不知道是哪种食材引起的",
        )
        self.assertFalse(result.success)
        self.assertEqual(result.final_review.findings[0].type, "ambiguous_safety_constraint")

    def test_identical_duplicate_patch_operation_is_applied_once(self):
        from forkfit.recipe_agent_v3 import patch_from_dict

        operation = {"op": "replace_equipment", "meal_id": "m1", "target": "烤箱", "value": "炒锅", "reason": "改用炒锅"}
        patch = patch_from_dict({"operations": [operation, operation], "summary": "去除重复操作"})
        self.assertEqual(len(patch.operations), 1)

    def test_invalid_patch_schema_is_regenerated_once(self):
        class RetryLLM:
            model = "test-model"

            def __init__(self):
                self.adapter_calls = 0

            def complete_json(self, *, agent, user, **_kwargs):
                if agent == "recipe_reviewer" and "constraints" in user and "review" in user:
                    return {
                        "constraints": {"items": [{"kind": "equipment", "value": "炒锅", "hard": True}], "people_count": 1, "max_cook_time_minutes": 30},
                        "review": {"status": "block", "findings": [{"type": "equipment", "severity": "high", "affected_items": ["m1"], "affected_ingredients": [], "message": "厨具冲突", "required_action": "改用炒锅"}]},
                    }
                if agent == "recipe_adapter":
                    self.adapter_calls += 1
                    if self.adapter_calls == 1:
                        return {"operations": [
                            {"op": "replace_equipment", "meal_id": "m1", "target": "烤箱", "value": "炒锅", "reason": "调整"},
                            {"op": "replace_equipment", "meal_id": "m1", "target": "烤箱", "value": "平底锅", "reason": "冲突值"},
                        ]}
                    return {"operations": [{"op": "replace_equipment", "meal_id": "m1", "target": "烤箱", "value": "炒锅", "reason": "调整"}], "summary": "已修正"}
                if agent == "recipe_reviewer":
                    return pass_review(user)
                raise AssertionError(agent)

            def complete_with_tools(self, **_kwargs):
                raise AssertionError("equipment task must not use tools")

        llm = RetryLLM()
        result = ForkFitLangGraphWorkflow(llm, FakeTool()).run(
            UserProfile(1, equipment=["炒锅"]),
            MealPack("p", "菜", "家常", [Meal("m1", "周一", "烤菜", ["花椰菜"], ["烤箱"], 20, steps=["烤熟"])]),
            locale="zh",
        )
        self.assertTrue(result.success)
        self.assertEqual(llm.adapter_calls, 2)

    def test_unlisted_step_seasoning_triggers_bounded_repair(self):
        class SeasoningLLM(FakeLLM):
            def __init__(self):
                super().__init__()
                self.adapter_calls = 0

            def complete_with_tools(self, *, tools, trace=None, **kwargs):
                self.adapter_calls += 1
                arguments = {"ingredient": "花生酱", "excluded_allergens": ["花生"], "desired_taste": "", "desired_texture": "", "cooking_use": "", "top_k": 3}
                result = tools[0].handler(arguments)
                operations = [
                    {"op": "replace_ingredient", "meal_id": "m1", "target": "花生酱", "value": "葵花籽酱", "reason": "避开花生"},
                    {"op": "set_name", "meal_id": "m1", "target": "花生拌面", "value": "葵花籽酱拌面", "reason": "同步菜名"},
                    {"op": "replace_steps", "meal_id": "m1", "target": "", "value": ["用灶台煮熟面条，加入葵花籽酱" + ("和生抽" if self.adapter_calls == 1 else "") + "拌匀"], "reason": "同步步骤"},
                ]
                return ToolAgentResult({"operations": operations, "summary": "已调整"}, [{"tool": "search_substitutions", "arguments": arguments, "result": result}])

        llm = SeasoningLLM()
        result = ForkFitLangGraphWorkflow(llm, FakeTool()).run(
            UserProfile(1, allergies=["花生"]), pack(), locale="zh"
        )
        self.assertTrue(result.success)
        self.assertEqual(result.trace.repair_count, 1)


if __name__ == "__main__": unittest.main()
