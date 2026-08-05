from __future__ import annotations

import json
import unittest

from forkfit.meal_planner import CandidatePlan, MealPlanWorkflow
from forkfit.constraints import ConstraintNormalizer
from forkfit.models import UserProfile


class PlannerLLM:
    model = "test-model"

    def __init__(self) -> None:
        self.calls: list[str] = []

    def complete_json(self, *, agent: str, **_kwargs):
        self.calls.append(agent)
        if agent.startswith("meal_planner_"):
            return _candidate(days=3 if "team" in self.mode else 2)
        if agent in {"nutrition_reviewer", "pantry_reviewer"}:
            return {
                "summary": "结构可执行",
                "scores": [
                    {
                        "candidate_index": index,
                        "score": 90 - index,
                        "strengths": ["搭配有变化"],
                        "issues": [],
                    }
                    for index in range(3)
                ],
            }
        if agent == "menu_editor":
            return {"winner_index": 0, "decision_summary": "兼顾变化和备菜复用。"}
        raise AssertionError(f"Unexpected agent: {agent}")

    mode = "guided"


class RepairRetryLLM(PlannerLLM):
    def complete_json(self, *, agent: str, **_kwargs):
        self.calls.append(agent)
        if agent.startswith("meal_planner_"):
            payload = _candidate(days=2)
            payload["days"][1]["meal"]["steps"].append("加入生抽和盐调味。")
            return payload
        if agent == "meal_plan_repair":
            raise json.JSONDecodeError("truncated", "{", 1)
        if agent == "meal_plan_repair_format_retry":
            replacement = _candidate(days=2)["days"][1]
            replacement["meal"]["ingredients"].extend(["生抽 1 茶匙", "盐 少许"])
            replacement["meal"]["steps"].append("加入生抽和盐调味。")
            return {
                "replacement_days": [replacement],
                "shopping_list": None,
                "prep_notes": None,
                "title": None,
                "summary": None,
            }
        raise AssertionError(f"Unexpected agent: {agent}")


class MealPlanWorkflowTests(unittest.TestCase):
    def test_two_day_request_uses_one_planner(self) -> None:
        llm = PlannerLLM()
        llm.mode = "guided"
        workflow = MealPlanWorkflow(llm=llm)

        result = workflow.run(_request(days=2, selected=[]))

        self.assertEqual(result.mode, "guided")
        self.assertEqual(len(result.days), 2)
        self.assertEqual(
            [call for call in llm.calls if call.startswith("meal_planner_")],
            ["meal_planner_home_balance"],
        )
        self.assertNotIn("nutrition_reviewer", llm.calls)
        self.assertNotIn("menu_editor", llm.calls)

    def test_three_day_request_runs_bounded_agent_team(self) -> None:
        llm = PlannerLLM()
        llm.mode = "team"
        workflow = MealPlanWorkflow(llm=llm)

        result = workflow.run(_request(days=3, selected=[_selected_recipe()]))

        self.assertEqual(result.mode, "team")
        self.assertEqual(len(result.days), 3)
        self.assertEqual(
            len([call for call in llm.calls if call.startswith("meal_planner_")]),
            3,
        )
        self.assertIn("nutrition_reviewer", llm.calls)
        self.assertIn("pantry_reviewer", llm.calls)
        self.assertIn("menu_editor", llm.calls)
        self.assertEqual(result.days[0].source_post_id, "post-1")
        self.assertFalse(
            hasattr(result.days[0].meal, "estimated_cost"),
            "Price must not be part of the planning domain.",
        )

    def test_natural_language_constraints_affect_complexity_route(self) -> None:
        workflow = MealPlanWorkflow(llm=PlannerLLM())
        profile = UserProfile(people_count=1)
        mode = workflow.classify_request(
            2, [], "不要花生，而且没有烤箱", profile
        )

        self.assertEqual(mode, "team")

    def test_validator_rejects_ingredients_used_only_in_steps(self) -> None:
        workflow = MealPlanWorkflow(llm=PlannerLLM())
        payload = _candidate(days=2)
        payload["days"][1]["meal"]["steps"].append("加入生抽和盐调味。")
        issues = workflow._validate_candidate(
            CandidatePlan.model_validate(payload),
            2,
            [],
            ConstraintNormalizer().normalize(UserProfile(people_count=1), ""),
            "zh",
        )

        self.assertTrue(any("配料表未列出" in issue for issue in issues))

    def test_repair_retries_malformed_json_with_a_small_patch(self) -> None:
        llm = RepairRetryLLM()
        result = MealPlanWorkflow(llm=llm).run(_request(days=2, selected=[]))

        self.assertEqual(result.days[1].meal.ingredients[-2:], ["生抽 1 茶匙", "盐 少许"])
        self.assertEqual(
            [
                call
                for call in llm.calls
                if call.startswith("meal_plan_repair")
            ],
            ["meal_plan_repair", "meal_plan_repair_format_retry"],
        )


def _request(days: int, selected: list[dict]) -> dict:
    return {
        "days": days,
        "request_text": "家常、蔬菜多一点",
        "selected_recipes": selected,
        "locale": "zh",
        "user_profile": {
            "people_count": 2,
            "likes": [],
            "dislikes": [],
            "allergies": [],
            "diet_rules": [],
            "equipment": [],
            "max_cook_time_minutes": 45,
            "soft_preferences": [],
        },
    }


def _selected_recipe() -> dict:
    return {
        "post_id": "post-1",
        "title": "番茄炒蛋",
        "image_url": "/recipes/tomato.jpg",
        "description": "家常菜",
        "recipe": _meal(1, "番茄炒蛋"),
    }


def _candidate(days: int) -> dict:
    planned_days = []
    for index in range(1, days + 1):
        planned_days.append(
            {
                "day_index": index,
                "label": f"第 {index} 天",
                "source_post_id": "post-1" if index == 1 and days == 3 else None,
                "meal": _meal(index, "番茄炒蛋" if index == 1 else f"时蔬豆腐 {index}"),
                "reason": "适合当天的时间安排",
            }
        )
    return {
        "title": "三日家常菜单" if days == 3 else "两日家常菜单",
        "summary": "口味有变化，食材可以适度复用。",
        "days": planned_days,
        "shopping_list": [
            {"name": "番茄", "amount": "2 个", "used_on": [1]},
            {"name": "豆腐", "amount": "2 盒", "used_on": list(range(2, days + 1))},
        ],
        "prep_notes": ["叶菜洗净沥干后冷藏。"],
    }


def _meal(index: int, name: str) -> dict:
    return {
        "id": f"day-{index}",
        "day": f"第 {index} 天",
        "name": name,
        "ingredients": ["番茄 2 个", "鸡蛋 2 个"] if index == 1 else ["豆腐 1 盒", "青菜 200 克"],
        "equipment": ["炒锅"],
        "cook_time_minutes": 20,
        "tags": ["家常"],
        "notes": "",
        "steps": ["食材洗净切好。", "炒熟并调味。"],
        "difficulty": "easy",
    }


if __name__ == "__main__":
    unittest.main()
