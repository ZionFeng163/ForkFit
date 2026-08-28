from __future__ import annotations

import json
import unittest

from langgraph.graph import END, START, StateGraph

from forkfit.constraints import ConstraintNormalizer
from forkfit.langgraph_workflow import ForkFitGraphState
from forkfit.meal_planner import (
    AGENT_REGISTRY,
    CandidatePlan,
    MealPlanNeedsInput,
    MealPlanWorkflow,
)
from forkfit.models import AdapterOutput, AgentFinding, UserProfile


class PlannerLLM:
    model = "test-model"

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.inputs: dict[str, list[dict]] = {}

    def complete_json(self, *, agent: str, **kwargs):
        self.calls.append(agent)
        try:
            self.inputs.setdefault(agent, []).append(json.loads(kwargs["user"]))
        except (KeyError, TypeError, json.JSONDecodeError):
            pass
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


class SelectedRecipeWorkflow:
    """Small compiled subgraph used to assert parent-graph routing."""

    def __init__(self, outcome: str = "pass") -> None:
        self.outcome = outcome
        self.calls = 0
        graph = StateGraph(ForkFitGraphState)
        graph.add_node("adapt", self._adapt)
        graph.add_edge(START, "adapt")
        graph.add_edge("adapt", END)
        self.graph = graph.compile()

    def _adapt(self, state: ForkFitGraphState) -> ForkFitGraphState:
        self.calls += 1
        meal_pack = state["meal_pack"].clone()
        if self.outcome == "repair":
            meal_pack.meals[0].ingredients = ["无乳糖牛奶 200 毫升"]
        unresolved = []
        if self.outcome == "fail":
            unresolved = [
                AgentFinding(
                    type="allergen_conflict",
                    severity="high",
                    affected_items=[meal_pack.meals[0].id],
                    message="缺少可确认的无过敏原替代方案。",
                )
            ]
        return {
            "success": not unresolved,
            "adapter_output": AdapterOutput(
                forked_meal_pack=meal_pack,
                change_log=[],
                unresolved_items=unresolved,
                summary="测试用单菜适配结果",
            ),
        }


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


@unittest.skip("legacy meal-plan-v2 expectations")
class MealPlanWorkflowTests(unittest.TestCase):
    def test_no_selected_recipe_skips_recipe_subgraph(self) -> None:
        llm = PlannerLLM()
        recipe_workflow = SelectedRecipeWorkflow()

        MealPlanWorkflow(llm=llm, recipe_workflow=recipe_workflow).run(
            _request(days=2, selected=[])
        )

        self.assertEqual(recipe_workflow.calls, 0)

    def test_adapted_selected_recipe_is_passed_to_planner_with_post_id(self) -> None:
        llm = PlannerLLM()
        llm.mode = "team"
        recipe_workflow = SelectedRecipeWorkflow(outcome="repair")
        selected = _selected_recipe()
        selected["recipe"]["id"] = "community-recipe-7"

        MealPlanWorkflow(llm=llm, recipe_workflow=recipe_workflow).run(
            _request(days=3, selected=[selected])
        )

        planner_input = llm.inputs["meal_planner_home_balance"][0]
        adapted = planner_input["selected_recipes"][0]
        self.assertEqual(recipe_workflow.calls, 1)
        self.assertEqual(adapted["post_id"], "post-1")
        self.assertEqual(adapted["recipe"]["id"], "community-recipe-7")
        self.assertEqual(adapted["recipe"]["ingredients"], ["无乳糖牛奶 200 毫升"])

    def test_unresolved_selected_recipe_stops_before_planning(self) -> None:
        llm = PlannerLLM()
        recipe_workflow = SelectedRecipeWorkflow(outcome="fail")

        with self.assertRaises(MealPlanNeedsInput) as raised:
            MealPlanWorkflow(llm=llm, recipe_workflow=recipe_workflow).run(
                _request(days=2, selected=[_selected_recipe()])
            )

        self.assertEqual(recipe_workflow.calls, 1)
        self.assertIn("缺少可确认", raised.exception.issues[0])
        self.assertFalse(any(call.startswith("meal_planner_") for call in llm.calls))

    def test_multiple_selected_recipes_keep_order_and_identity_after_adaptation(self) -> None:
        recipe_workflow = SelectedRecipeWorkflow(outcome="repair")
        workflow = MealPlanWorkflow(
            llm=PlannerLLM(), recipe_workflow=recipe_workflow
        )
        first = _selected_recipe()
        first["recipe"]["id"] = "recipe-a"
        second = _selected_recipe()
        second["post_id"] = "post-2"
        second["recipe"]["id"] = "recipe-b"
        second["recipe"]["name"] = "香菇豆腐"

        prepared = workflow._prepare(
            {"request_payload": _request(3, [first, second])}
        )
        adapted = recipe_workflow.graph.invoke(prepared)
        synced = workflow._sync_selected({**prepared, **adapted})

        self.assertEqual(
            [item["post_id"] for item in synced["selected"]],
            ["post-1", "post-2"],
        )
        self.assertEqual(
            [item["recipe"]["id"] for item in synced["selected"]],
            ["recipe-a", "recipe-b"],
        )
        self.assertEqual(
            [item["recipe"]["name"] for item in synced["selected"]],
            ["番茄炒蛋", "香菇豆腐"],
        )

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


class V3PlannerLLM:
    model = "test-model"

    def __init__(self) -> None:
        self.calls: list[str] = []

    def complete_json(self, *, agent: str, user: str, **_kwargs):
        self.calls.append(agent)
        payload = json.loads(user)
        if agent.startswith("meal_planner_"):
            pool = payload["recipe_pool"]
            days = payload["days"]
            planned = [
                {
                    "day_index": index + 1,
                    "label": f"第 {index + 1} 天",
                    "dishes": [
                        {"post_id": pool[index]["post_id"], "reason": "适合当天"}
                    ],
                    "reason": "组合均衡",
                }
                for index in range(days)
            ]
            for extra_index, item in enumerate(pool[days:]):
                target = extra_index % days
                if len(planned[target]["dishes"]) < 3:
                    planned[target]["dishes"].append(
                        {"post_id": item["post_id"], "reason": "补充搭配"}
                    )
            return {
                "title": "已有菜谱组合菜单",
                "summary": "全部菜品来自用户选入的候选池。",
                "days": planned,
                "prep_notes": ["提前清洗需要复用的蔬菜。"],
            }
        if agent == "comprehensive_plan_reviewer":
            return {
                "winner_index": 0,
                "status": "pass",
                "summary": "菜品来源、搭配和时间安排合理。",
                "issues": [],
            }
        raise AssertionError(f"Unexpected agent: {agent}")


def _selected_pool(count: int) -> list[dict]:
    values = []
    for index in range(count):
        item = _selected_recipe()
        item["post_id"] = f"post-{index + 1}"
        item["title"] = f"候选菜 {index + 1}"
        item["recipe"] = _meal(index + 1, f"候选菜 {index + 1}")
        item["recipe"]["id"] = f"recipe-{index + 1}"
        values.append(item)
    return values


class MealPlanWorkflowV3Tests(unittest.TestCase):
    def test_registry_contains_two_subgraphs_and_six_business_agents(self) -> None:
        self.assertEqual(len(AGENT_REGISTRY), 6)
        self.assertEqual(
            {item["subgraph"] for item in AGENT_REGISTRY.values()},
            {"recipe", "planning"},
        )

    def test_requires_at_least_one_selected_recipe_per_day(self) -> None:
        with self.assertRaises(MealPlanNeedsInput):
            MealPlanWorkflow(
                llm=V3PlannerLLM(), recipe_workflow=SelectedRecipeWorkflow()
            ).run(_request(3, _selected_pool(2)))

    def test_six_roles_and_multi_dish_days_use_only_selected_posts(self) -> None:
        llm = V3PlannerLLM()
        result = MealPlanWorkflow(
            llm=llm, recipe_workflow=SelectedRecipeWorkflow()
        ).run(_request(3, _selected_pool(5)))

        self.assertEqual(result.workflow_version, "meal-plan-v3")
        self.assertEqual(len(result.days), 3)
        self.assertEqual([len(day.dishes) for day in result.days], [2, 2, 1])
        used = [dish.source_post_id for day in result.days for dish in day.dishes]
        self.assertEqual(len(used), len(set(used)))
        self.assertTrue(set(used).issubset({f"post-{i}" for i in range(1, 6)}))
        self.assertEqual(len(result.agent_reports), 6)
        self.assertEqual(len([call for call in llm.calls if call.startswith("meal_planner_")]), 3)
        self.assertEqual(llm.calls.count("comprehensive_plan_reviewer"), 1)

    def test_recipe_subgraph_failure_stops_before_planners(self) -> None:
        llm = V3PlannerLLM()
        workflow = SelectedRecipeWorkflow(outcome="fail")
        with self.assertRaises(MealPlanNeedsInput):
            MealPlanWorkflow(llm=llm, recipe_workflow=workflow).run(
                _request(2, _selected_pool(2))
            )
        self.assertEqual(workflow.calls, 1)
        self.assertFalse(any(call.startswith("meal_planner_") for call in llm.calls))

    def test_legacy_single_meal_day_migrates_to_dishes(self) -> None:
        from forkfit.meal_planner import PlannedDay

        day = PlannedDay.model_validate(
            {
                "day_index": 1,
                "label": "第 1 天",
                "source_post_id": "post-old",
                "meal": _meal(1, "旧菜谱"),
                "reason": "旧版安排",
            }
        )
        self.assertEqual(len(day.dishes), 1)
        self.assertEqual(day.dishes[0].source_post_id, "post-old")

    def test_candidate_rejects_unknown_and_duplicate_post_ids(self) -> None:
        from forkfit.meal_planner import CandidatePlan

        candidate = CandidatePlan.model_validate(
            {
                "title": "错误候选",
                "summary": "包含未知和重复编号",
                "days": [
                    {"day_index": 1, "label": "第 1 天", "dishes": [{"post_id": "post-1"}]},
                    {"day_index": 2, "label": "第 2 天", "dishes": [{"post_id": "post-1"}, {"post_id": "outside"}]},
                ],
            }
        )
        issues = MealPlanWorkflow._validate_candidate(candidate, 2, _selected_pool(2))
        self.assertTrue(any("不在用户选入" in issue for issue in issues))
        self.assertTrue(any("不能跨天重复" in issue for issue in issues))


if __name__ == "__main__":
    unittest.main()
