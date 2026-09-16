import json
import unittest
from unittest.mock import Mock

from forkfit.meal_planner_v3 import MealPlanWorkflow, PlannedDay, MealPlanNeedsInput
from forkfit.serialization import user_profile_from_dict
from test_meal_planner import V3PlannerLLM, SelectedRecipeWorkflow, _request, _selected_pool


class PlanningReviewContractTests(unittest.TestCase):
    def state(self):
        request = _request(2, _selected_pool(3))
        return {"days": 2, "selected": request["selected_recipes"], "profile": user_profile_from_dict(request["user_profile"]), "request_text": "不要香菜，每天搭配有变化", "locale": "zh", "fixed_days": []}

    def prepared(self):
        workflow = MealPlanWorkflow(llm=V3PlannerLLM())
        state = self.state()
        state.update(workflow._draft_candidates_node(state))
        payload = V3PlannerLLM().complete_json(agent="comprehensive_plan_reviewer", user=json.dumps({**workflow._planning_input(state), "candidates": [item.model_dump() for item in state["candidates"]]}))
        return workflow, state, payload

    def test_invalid_winner_or_missing_evidence_never_materializes(self):
        for kind in ("winner", "coverage", "reference", "contradiction"):
            with self.subTest(kind=kind):
                workflow, state, payload = self.prepared()
                if kind == "winner":
                    payload["winner_index"] = 20
                elif kind == "coverage":
                    payload["assessments"][0]["checks"].pop()
                elif kind == "reference":
                    payload["assessments"][0]["checks"][0]["post_ids"] = ["invented"]
                else:
                    payload["status"] = "block"
                workflow.llm = Mock()
                workflow.llm.complete_json.return_value = payload
                with self.assertRaises(ValueError):
                    workflow._review_candidates_node(state)

    def test_blocked_winner_is_replaced_only_with_an_assessed_eligible_candidate(self):
        workflow, state, payload = self.prepared()
        payload["status"] = "block"
        payload["assessments"][0]["checks"][0].update(status="block", evidence="不符合时间要求", repair_action="减少当天菜数")
        workflow.llm = Mock()
        workflow.llm.complete_json.return_value = payload
        reviewed = workflow._review_candidates_node(state)["review"]
        self.assertNotEqual(reviewed.winner_index, 0)
        self.assertEqual(reviewed.status, "pass")

    def test_all_blocked_repair_keeps_requirements_and_only_one_revision(self):
        workflow, state, payload = self.prepared()
        payload["status"] = "block"
        for assessment in payload["assessments"]:
            assessment["checks"][0].update(status="block", repair_action="换一种组合")
        workflow.llm = Mock()
        workflow.llm.complete_json.return_value = payload
        state.update(workflow._review_candidates_node(state))
        self.assertEqual(workflow._route_after_review(state), "revise")
        candidate = state["candidates"][0].model_dump()
        workflow.llm.complete_json.return_value = candidate
        state.update(workflow._revise_candidate_node(state))
        sent = json.loads(workflow.llm.complete_json.call_args.kwargs["user"])
        self.assertEqual(sent["request"], state["request_text"])
        self.assertIn("user_profile", sent)
        self.assertIn("requirements", sent)
        self.assertIn("fixed_days", sent)
        self.assertEqual(workflow._route_after_review(state), "stop")
        with self.assertRaises(MealPlanNeedsInput):
            workflow._stop_node(state)

    def test_review_gets_steps_and_normalized_constraints(self):
        from forkfit.models import ConstraintSpec, ConstraintEvidence
        workflow, state, payload = self.prepared()
        state["constraints"] = ConstraintSpec([ConstraintEvidence("allergy", "花生", True, "profile")], 3, 40)
        request = workflow._planning_input(state)
        self.assertIn("steps", request["recipe_pool"][0])
        self.assertEqual(request["constraints"]["people_count"], 3)
        self.assertIn("花生", request["requirements"]["constraint_0"])

    def test_locked_day_is_in_input_and_cannot_be_reassigned(self):
        workflow, state, payload = self.prepared()
        first = state["selected"][0]
        fixed = PlannedDay(day_index=1, label="第 1 天", dishes=[{"source_post_id": first["post_id"], "meal": first["recipe"]}])
        state["fixed_days"] = [fixed]
        self.assertEqual(workflow._planning_input(state)["fixed_days"][0]["day_index"], 1)
        issues = workflow._validate_candidate(state["candidates"][0], 2, state["selected"], [fixed])
        self.assertTrue(any("锁定" in issue for issue in issues))

    def test_whole_meal_time_is_not_checked_as_individual_dish_time(self):
        workflow, state, _ = self.prepared()
        state["request_text"] = "每餐30分钟内"
        candidate = state["candidates"][0]
        issues = workflow._candidate_issues(candidate, state)
        self.assertTrue(any("超过整餐" in issue for issue in issues))
        facts = workflow._execution_facts(candidate, state)
        self.assertEqual(facts[0]["sequential_minutes"], 40)
        self.assertEqual(facts[0]["shared_equipment"], ["炒锅"])

    def test_all_locked_skips_recipe_adaptation_and_keeps_exact_meals(self):
        pool = _selected_pool(2)
        fixed = [PlannedDay(day_index=index + 1, label=f"第 {index + 1} 天", dishes=[{"source_post_id": item["post_id"], "meal": item["recipe"]}]) for index, item in enumerate(pool)]
        recipe_workflow = SelectedRecipeWorkflow()
        workflow = MealPlanWorkflow(llm=V3PlannerLLM(), recipe_workflow=recipe_workflow)
        request = {**_request(2, pool), "fixed_days": [day.model_dump(mode="json") for day in fixed]}
        result = workflow.run(request)
        self.assertEqual(result.days, fixed)
        self.assertEqual(recipe_workflow.calls, 0)

    def test_allergy_warning_is_not_allowed_to_release_a_plan(self):
        workflow, state, _ = self.prepared()
        state["profile"].allergies = ["花生"]
        payload = V3PlannerLLM().complete_json(agent="comprehensive_plan_reviewer", user=json.dumps({**workflow._planning_input(state), "candidates": [item.model_dump() for item in state["candidates"]]}))
        payload["status"] = "warn"
        for assessment in payload["assessments"]:
            for check in assessment["checks"]:
                if check["requirement_id"] == "profile_allergies_0":
                    check.update(status="warn", evidence="无法确认酱料不含花生", repair_action="换用成分明确的酱料")
        workflow.llm = Mock()
        workflow.llm.complete_json.return_value = payload
        state.update(workflow._review_candidates_node(state))
        self.assertEqual(state["review"].status, "block")
        with self.assertRaisesRegex(MealPlanNeedsInput, "酱料"):
            workflow._stop_node(state)
