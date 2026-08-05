from __future__ import annotations

import unittest
from datetime import datetime, timezone

from forkfit.meal_plan_conversation import MealPlanConversationWorkflow
from forkfit.meal_planner import MealPlanResult, PlannedDay
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
    def test_local_replace_recipe_applies_and_revalidates(self) -> None:
        plan = _plan()
        workflow = MealPlanConversationWorkflow(llm=FakePatchLLM())

        outcome = workflow.process(plan, "第二天换一道更快的")

        self.assertEqual(outcome.status, "applied")
        self.assertEqual(outcome.intent.kind, "replace_recipe")
        self.assertEqual(outcome.result.days[1].meal.name, "香菇鸡肉炒饭")
        self.assertEqual(outcome.result.days[1].meal.cook_time_minutes, 22)

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
