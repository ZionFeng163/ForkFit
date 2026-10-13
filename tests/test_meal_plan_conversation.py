from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from forkfit.meal_plan_conversation import MealPlanConversationWorkflow
from forkfit.meal_planner import MealPlanResult, PlannedDay, MealPlanNeedsInput
from forkfit.models import Meal
from forkfit.stores.meal_plans import MealPlanRecord


class FakePatchLLM:
    model = "test-patch-model"

    def complete_json(self, **_kwargs):
        return {
            "operations": [
                {
                    "op": "replace_recipe",
                    "meal_id": "recipe-2",
                    "target": "菜谱",
                    "value": {
                        "id": "recipe-2",
                        "day": "第 2 天",
                        "name": "香菇鸡肉炒饭",
                        "ingredients": ["鸡肉 200 克", "米饭 300 克", "香菇 100 克"],
                        "equipment": ["炒锅"],
                        "cook_time_minutes": 22,
                        "tags": ["家常", "快手"],
                        "notes": "少盐即可。",
                        "steps": ["切好食材。", "炒熟鸡肉和香菇，再加入米饭。"],
                        "difficulty": "easy",
                    },
                    "reason": "按要求换成更快的鸡肉菜。",
                }
            ],
            "summary": "第 2 天换成快手鸡肉菜。",
            "message": "已把第 2 天换成香菇鸡肉炒饭，用时约 22 分钟。",
        }


class MealPlanConversationTests(unittest.TestCase):
    def test_local_adaptation_receives_assigned_day_without_mutating_source(self):
        from types import SimpleNamespace
        from forkfit.meal_plan_conversation_v3 import MealPlanConversationWorkflowV3
        plan = _plan()
        source = replace(plan.result.days[1].dishes[0].meal, day="午餐")
        with patch("forkfit.meal_plan_conversation_v3.ForkFitLangGraphWorkflow") as factory:
            def run(profile, pack, **kwargs):
                self.assertEqual(pack.meals[0].day, "第 2 天")
                self.assertIn("第二天少放盐", kwargs["request_text"])
                return SimpleNamespace(success=True, adapter_output=SimpleNamespace(forked_meal_pack=pack))
            factory.return_value.run.side_effect = run
            result = MealPlanConversationWorkflowV3(llm=Mock())._adapt_meal(plan, source, "第二天少放盐", 2)
        self.assertEqual(result.day, "第 2 天")
        self.assertEqual(source.day, "午餐")

    def test_method_and_ingredient_changes_are_not_recipe_replacements(self):
        plan = _plan()
        for text in ("第二天改成清炒", "第二天把鱼换成豆腐", "第二天把烤箱替换成炒锅"):
            with self.subTest(text=text):
                intent = MealPlanConversationWorkflow.parse_intent(text, plan)
                self.assertEqual(intent.kind, "modify_day")
                self.assertEqual(intent.day_index, 2)
        self.assertEqual(MealPlanConversationWorkflow.parse_intent("第二天换一道更快的", plan).kind, "replace_recipe")
        plan = replace(plan, request_payload={**plan.request_payload, "selected_recipes": [{"title": "凉拌豆腐", "recipe": {"name": "凉拌豆腐"}}]})
        self.assertEqual(MealPlanConversationWorkflow.parse_intent("第二天换成凉拌豆腐", plan).kind, "replace_recipe")

    def test_method_answer_keeps_previously_clarified_remaining_scope(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        context = "整份菜单不要用烤箱，保留已锁定的第一天。\n用户补充回答：只调整其他日期，第一天保持锁定。"
        intent = MealPlanConversationWorkflow.parse_intent(context + "\n用户补充回答：可以清炒", plan)
        self.assertEqual(intent.kind, "modify_day")
        self.assertEqual(intent.day_index, 2)
        changed_scope = MealPlanConversationWorkflow.parse_intent(context + "\n用户补充回答：整份菜单都少盐", plan)
        self.assertEqual(changed_scope.kind, "change_constraint")
        self.assertIsNone(changed_scope.day_index)

    def test_only_remaining_day_uses_local_adjustment_not_full_replan(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        dish = plan.result.days[1].dishes[0]
        plan = replace(plan, request_payload={**plan.request_payload, "selected_recipes": [{"post_id": item.source_post_id} for day in plan.result.days for item in day.dishes]})
        text = "整份菜单不要用烤箱，保留已锁定的第一天。\n用户补充回答：只调整其他日期，第一天保持锁定。"
        llm = Mock()
        llm.complete_json.return_value = {"text": "不用烤箱", "clarification": ""}
        workflow = MealPlanConversationWorkflow(llm=llm)
        changed = dish.meal.clone()
        changed.notes = "使用炒锅"
        with patch.object(workflow, "_adapt_meal", return_value=changed), patch.object(workflow, "_replan") as replan:
            outcome = workflow.process(plan, text)
        self.assertEqual(outcome.status, "applied")
        self.assertEqual(outcome.intent.day_index, 2)
        self.assertEqual(outcome.result.days[0], plan.result.days[0])
        self.assertEqual(outcome.effective_requirements["days"], {"2": "不用烤箱"})
        replan.assert_not_called()

    def test_remaining_days_keep_global_and_locked_requirements(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        plan.result.days.append(plan.result.days[1].model_copy(update={"day_index": 3}, deep=True))
        original = plan.request_payload.copy()
        llm = Mock()
        llm.complete_json.return_value = {"text": "不用烤箱", "clarification": ""}
        workflow = MealPlanConversationWorkflow(llm=llm)
        with patch.object(workflow, "_replan", return_value=plan.result) as replan:
            outcome = workflow.process(plan, "只调整其他日期，不要用烤箱", confirmed=True)
        state = replan.call_args.args[0].request_payload["effective_requirements"]
        self.assertEqual(state["global"], original["request_text"])
        self.assertEqual(state["days"], {"2": "不用烤箱", "3": "不用烤箱"})
        self.assertEqual(outcome.status, "applied")
        self.assertEqual(plan.request_payload, original)

    def test_requirement_conflict_becomes_chat_question_not_failed_task(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4")
        llm = Mock()
        llm.complete_json.return_value = {"text": "", "clarification": "要保留原做法还是改用炒锅？"}
        outcome = MealPlanConversationWorkflow(llm=llm).process(plan, "整份菜单不要用烤箱", confirmed=True)
        self.assertEqual(outcome.status, "needs_clarification")
        self.assertEqual(outcome.message, "要保留原做法还是改用炒锅？")
        self.assertIsNone(outcome.result)

    def test_global_request_with_preserved_lock_cannot_unlock_or_target_that_day(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        for suffix in ("保留已锁定的第一天", "第一天保持锁定", "不要解锁第一天"):
            for prefix in ("", "不要用烤箱\n用户补充回答："):
                with self.subTest(suffix=suffix, prefix=prefix):
                    llm = Mock()
                    outcome = MealPlanConversationWorkflow(llm=llm).process(plan, prefix + "整份菜单都不要用烤箱，" + suffix)
                    self.assertEqual(outcome.status, "needs_confirmation")
                    self.assertEqual(outcome.intent.kind, "change_constraint")
                    self.assertIsNone(outcome.intent.day_index)
                    self.assertIsNone(outcome.result)
                    self.assertEqual(plan.locked_days, [1])
                    llm.complete_json.assert_not_called()

    def test_vague_dissatisfaction_asks_before_replanning(self):
        for text in ("这份菜单感觉不太合适", "第一天感觉不太对", "想更有家的感觉"):
            llm = Mock()
            outcome = MealPlanConversationWorkflow(llm=llm).process(_plan(), text)
            self.assertEqual(outcome.status, "needs_clarification")
            self.assertIn("口味", outcome.message)
            llm.complete_json.assert_not_called()

    def test_unchanged_recipe_does_not_report_success(self):
        plan = _plan()
        dish = plan.result.days[1].dishes[0]
        plan = replace(plan, workflow_version="meal-plan-v4", request_payload={
            **plan.request_payload, "selected_recipes": [{"post_id": dish.source_post_id}],
            "effective_requirements": {"global": "", "days": {"2": "少放盐"}},
        })
        llm = Mock()
        llm.complete_json.return_value = {"text": "少放盐", "clarification": ""}
        workflow = MealPlanConversationWorkflow(llm=llm)
        with patch.object(workflow, "_adapt_meal", return_value=dish.meal):
            result = workflow.process(plan, "第二天少放盐")
        self.assertEqual(result.status, "needs_clarification")
        self.assertIsNone(result.result)

    def test_cancel_requirement_without_changing_recipe_is_saved(self):
        plan = _plan()
        dish = plan.result.days[1].dishes[0]
        plan = replace(plan, workflow_version="meal-plan-v4", request_payload={
            **plan.request_payload, "selected_recipes": [{"post_id": dish.source_post_id}],
            "effective_requirements": {"global": "少盐", "days": {"2": "不要鱼"}},
        })
        llm = Mock()
        llm.complete_json.return_value = {"text": "", "clarification": "", "mode": "relax_only"}
        workflow = MealPlanConversationWorkflow(llm=llm)
        with patch.object(workflow, "_adapt_meal", return_value=dish.meal):
            result = workflow.process(plan, "第二天可以吃鱼了")
        self.assertEqual(result.status, "applied")
        self.assertEqual(result.result, plan.result)
        self.assertEqual(result.effective_requirements, {"global": "少盐", "days": {"2": ""}})
        self.assertIn("未作修改", result.message)
        self.assertEqual(plan.request_payload["effective_requirements"]["days"]["2"], "不要鱼")

    def test_unlock_is_not_lock_and_does_not_call_model(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1, 2])
        for text in ("取消第一天锁定", "解锁第一天", "第一天不再锁定"):
            llm = Mock()
            result = MealPlanConversationWorkflow(llm=llm).process(plan, text)
            self.assertEqual(result.intent.kind, "unlock_day")
            self.assertEqual(result.locked_days, [2])
            self.assertEqual(result.result, plan.result)
            llm.complete_json.assert_not_called()

    def test_global_conflict_with_locked_day_stops_before_replanning(self):
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        workflow = MealPlanConversationWorkflow(llm=Mock())
        original = plan.result.model_dump()
        with patch.object(workflow, "_validate_locked_meal", side_effect=ValueError("与素食冲突")), patch("forkfit.meal_plan_conversation_v3.MealPlanWorkflow") as planner:
            with self.assertRaisesRegex(MealPlanNeedsInput, "解锁"):
                workflow._replan(plan, "所有天吃素")
            planner.assert_not_called()
        self.assertEqual(plan.result.model_dump(), original)

    def test_locked_review_allows_soft_warning_but_blocks_hard_conflict(self):
        from forkfit.models import ConstraintSpec, AgentReview, QualityReport
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        workflow = MealPlanConversationWorkflow(llm=Mock())
        engine = Mock()
        engine.reviewer.understand_and_review.return_value = (ConstraintSpec([], 1, 30), AgentReview("reviewer", "pass", []))
        engine.safety_guard.review.return_value = AgentReview("guard", "pass", [])
        engine.reviewer.review_adjusted.return_value = QualityReport("warn", [])
        meal = plan.result.days[0].dishes[0].meal
        original = meal.clone()
        with patch("forkfit.meal_plan_conversation_v3.ForkFitLangGraphWorkflow", return_value=engine):
            workflow._validate_locked_meal(plan, meal, 1)
            engine.reviewer.review_adjusted.return_value = QualityReport("block", [])
            with self.assertRaises(ValueError):
                workflow._validate_locked_meal(plan, meal, 1)
        engine.adapter.generate.assert_not_called()
        engine.run.assert_not_called()
        self.assertEqual(meal, original)

    def test_unspecified_day_does_not_silently_modify_first_day(self) -> None:
        for locked_days in ([], [1]):
            with self.subTest(locked_days=locked_days):
                plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=locked_days)
                original = plan.result.model_dump()
                llm = Mock()
                outcome = MealPlanConversationWorkflow(llm=llm).process(plan, "少放盐")
                self.assertEqual(outcome.status, "needs_clarification")
                self.assertIn("第几天", outcome.message)
                self.assertEqual(plan.result.model_dump(), original)
                llm.complete_json.assert_not_called()

    def test_locked_day_requires_confirmation_before_model_call(self) -> None:
        plan = replace(_plan(), workflow_version="meal-plan-v4", locked_days=[1])
        original = plan.result.model_dump()
        for text in ("第一天少放盐", "第一天换一道更快的", "第一天简单一点"):
            with self.subTest(text=text):
                llm = Mock()
                outcome = MealPlanConversationWorkflow(llm=llm).process(plan, text)
                self.assertEqual(outcome.status, "needs_confirmation")
                self.assertIn("第 1 天已锁定", outcome.message)
                self.assertNotIn("重排多天", outcome.message)
                self.assertEqual(plan.result.model_dump(), original)
                llm.complete_json.assert_not_called()

    def test_legacy_plan_requires_new_v3_plan_before_replanning(self) -> None:
        plan = _plan()
        workflow = MealPlanConversationWorkflow(llm=FakePatchLLM())

        with self.assertRaisesRegex(ValueError, "旧版菜单"):
            workflow.process(plan, "第二天换一道更快的")

    def test_multi_dish_day_requires_recipe_name(self) -> None:
        plan = _plan()
        data = plan.result.model_dump(mode="json")
        data["days"][0]["dishes"].append(data["days"][1]["dishes"][0])
        plan = replace(
            plan,
            workflow_version="meal-plan-v3",
            result=MealPlanResult.model_validate(data),
        )

        outcome = MealPlanConversationWorkflow(llm=FakePatchLLM()).process(
            plan, "第一天少放盐"
        )

        self.assertEqual(outcome.status, "needs_clarification")
        self.assertIn("哪一道菜", outcome.message)

    def test_ambiguous_request_needs_one_clarification(self) -> None:
        intent = MealPlanConversationWorkflow.parse_intent("感觉不太对", _plan())

        self.assertEqual(intent.kind, "clarification")
        self.assertIn("口味", intent.question)

    def test_global_change_requires_confirmation(self) -> None:
        intent = MealPlanConversationWorkflow.parse_intent("这几天蔬菜多一些", _plan())

        self.assertEqual(intent.kind, "rebalance_plan")
        self.assertTrue(intent.requires_confirmation)


def _plan() -> MealPlanRecord:
    result = MealPlanResult(
        title="三天家常菜单",
        summary="方便工作日执行。",
        mode="guided",
        days=[
            PlannedDay(
                day_index=1,
                label="第 1 天",
                meal=Meal(
                    id="recipe-1",
                    day="第 1 天",
                    name="番茄炒蛋",
                    ingredients=["番茄 2 个", "鸡蛋 3 个"],
                    equipment=["炒锅"],
                    cook_time_minutes=18,
                    steps=["切番茄。", "炒熟鸡蛋后加入番茄。"],
                ),
            ),
            PlannedDay(
                day_index=2,
                label="第 2 天",
                meal=Meal(
                    id="recipe-2",
                    day="第 2 天",
                    name="红烧鱼",
                    ingredients=["鱼 1 条", "葱 适量"],
                    equipment=["炒锅"],
                    cook_time_minutes=35,
                    steps=["处理鱼。", "煎熟后焖煮。"],
                ),
            ),
        ],
    )
    return MealPlanRecord(
        id="plan-test",
        user_id="user-test",
        status="succeeded",
        mode="guided",
        request_payload={
            "days": 2,
            "locale": "zh",
            "request_text": "两天家常菜，30 分钟内。",
            "user_profile": {
                "people_count": 2,
                "likes": [],
                "dislikes": [],
                "allergies": [],
                "diet_rules": [],
                "equipment": ["炒锅"],
                "max_cook_time_minutes": 30,
                "soft_preferences": [],
            },
            "selected_recipes": [],
        },
        result=result,
        error=None,
        current_stage="completed",
        progress=100,
        workflow_version="meal-plan-v1",
        attempt_count=1,
        created_at=datetime.now(timezone.utc),
        started_at=None,
        finished_at=datetime.now(timezone.utc),
        current_version_id="version-test",
        locked_days=[],
        last_change_summary="",
        pending_message_id=None,
        pending_change=None,
    )


if __name__ == "__main__":
    unittest.main()
