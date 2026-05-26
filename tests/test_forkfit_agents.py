import unittest
from unittest.mock import Mock, patch

from forkfit import (
    AgentFinding,
    AgentReview,
    ConstraintAgent,
    ConstraintGuard,
    ForkFitLangGraphWorkflow,
    Meal,
    MealPack,
    UserAgent,
    UserProfile,
)
from forkfit.serialization import normalize_source_agent


class FakeLLMClient:
    model = "fake-qwen"

    def complete_json(self, *, agent, system, user, trace=None, max_tokens=None):
        import json

        request = json.loads(user)
        if agent == "user":
            profile = request["user_profile"]
            pack = request["meal_pack"]
            findings = []
            for item in pack["meals"]:
                text = " ".join(
                    [
                        item["name"],
                        item.get("notes", ""),
                        *item["ingredients"],
                        *item["tags"],
                    ]
                ).lower()
                for dislike in profile.get("dislikes", []):
                    if dislike.lower() in text:
                        findings.append(
                            {
                                "type": "taste_mismatch",
                                "severity": "medium",
                                "affected_items": [item["id"]],
                                "message": f"User dislikes {dislike}.",
                                "suggested_action": f"Reduce or replace {dislike}.",
                                "required_action": "",
                            }
                        )
            if trace is not None:
                from forkfit.models import LLMCallTrace

                trace.llm_calls.append(
                    LLMCallTrace(
                        agent="user",
                        model=self.model,
                        duration_ms=1.0,
                        prompt_tokens=10,
                        completion_tokens=10,
                        status="success",
                    )
                )
            return {
                "agent": "user",
                "preference_profile": {
                    "likes": profile.get("likes", []),
                    "dislikes": profile.get("dislikes", []),
                    "allergies": profile.get("allergies", []),
                    "diet_rules": profile.get("diet_rules", []),
                    "equipment": profile.get("equipment", []),
                    "soft_preferences": profile.get("soft_preferences", []),
                },
                "preference_review": {
                    "status": "warn" if findings else "pass",
                    "fit_score": 0.62 if findings else 0.85,
                    "findings": findings,
                },
            }

        if agent == "constraint":
            if trace is not None:
                from forkfit.models import LLMCallTrace

                trace.llm_calls.append(
                    LLMCallTrace(
                        agent="constraint",
                        model=self.model,
                        duration_ms=1.0,
                        prompt_tokens=15,
                        completion_tokens=15,
                        status="success",
                    )
                )
            return self._constraint_payload(request)

        if agent == "adapter":
            if trace is not None:
                from forkfit.models import LLMCallTrace

                trace.llm_calls.append(
                    LLMCallTrace(
                        agent="adapter",
                        model=self.model,
                        duration_ms=1.0,
                        prompt_tokens=20,
                        completion_tokens=20,
                        status="success",
                    )
                )
            return self._adapter_payload(request)

        raise AssertionError(f"unexpected agent: {agent}")

    def _constraint_payload(self, request):
        pack = request["meal_pack"]
        constraints = request["constraints"]
        findings = []

        for item in pack["meals"]:
            text = " ".join(
                [
                    item["name"],
                    item.get("notes", ""),
                    *item["ingredients"],
                    *item["equipment"],
                    *item["tags"],
                ]
            ).lower()
            for allergy in constraints.get("allergies", []):
                if allergy.lower() in text:
                    findings.append(
                        {
                            "type": "allergy",
                            "severity": "high",
                            "affected_items": [item["id"]],
                            "message": f"{item['name']} contains {allergy}.",
                            "suggested_action": "",
                            "required_action": "replace ingredient",
                        }
                    )
            available = {entry.lower() for entry in constraints.get("equipment", [])}
            missing = [
                entry for entry in item["equipment"] if entry.lower() not in available
            ]
            if missing:
                findings.append(
                    {
                        "type": "equipment",
                        "severity": "high",
                        "affected_items": [item["id"]],
                        "message": f"{item['name']} requires unavailable equipment: {', '.join(missing)}.",
                        "suggested_action": "",
                        "required_action": "replace equipment method",
                    }
                )
            if item["cook_time_minutes"] > constraints["max_cook_time_minutes"]:
                findings.append(
                    {
                        "type": "time",
                        "severity": "medium",
                        "affected_items": [item["id"]],
                        "message": f"{item['name']} exceeds time limit.",
                        "suggested_action": "shorten recipe",
                        "required_action": "",
                    }
                )

        if pack["meals"] and sum(item["estimated_cost"] for item in pack["meals"]) > constraints["budget"]:
            findings.append(
                {
                    "type": "budget",
                    "severity": "medium",
                    "affected_items": [item["id"] for item in pack["meals"]],
                    "message": "Estimated cost exceeds budget.",
                    "suggested_action": "reduce cost",
                    "required_action": "",
                }
            )

        return {
            "agent": "constraint",
            "status": "block"
            if any(item["severity"] == "high" for item in findings)
            else "warn"
            if findings
            else "pass",
            "findings": findings,
            "scores": {},
        }

    def _adapter_payload(self, request):
        pack = request["original_meal_pack"]
        user_output = request["user_agent_output"]
        reviews = request["reviews"]
        changed = False
        change_log = []
        unresolved = []
        allergies = user_output["preference_profile"].get("allergies", [])
        dislikes = user_output["preference_profile"].get("dislikes", [])
        equipment = user_output["preference_profile"].get("equipment", [])
        preferred_equipment = next(
            (item for item in ["air fryer", "stovetop", "rice cooker"] if item in equipment),
            None,
        )

        for review in reviews:
            for finding in review["findings"]:
                if finding["severity"] != "high":
                    continue
                meal = next(
                    item
                    for item in pack["meals"]
                    if item["id"] == finding["affected_items"][0]
                )
                if finding["type"] == "allergy" and "peanut" in allergies:
                    before = ", ".join(meal["ingredients"])
                    meal["ingredients"] = [
                        "sesame-lime sauce"
                        if "peanut" in ingredient.lower()
                        else ingredient
                        for ingredient in meal["ingredients"]
                    ]
                    meal["name"] = meal["name"].replace("Peanut", "Sesame-Lime Sauce")
                    change_log.append(
                        {
                            "affected_item": meal["id"],
                            "from_value": before,
                            "to_value": ", ".join(meal["ingredients"]),
                            "reason": finding["message"],
                            "source_agent": "constraint",
                        }
                    )
                    changed = True
                elif finding["type"] == "equipment" and preferred_equipment:
                    before = ", ".join(meal["equipment"])
                    meal["equipment"] = [preferred_equipment]
                    change_log.append(
                        {
                            "affected_item": meal["id"],
                            "from_value": before,
                            "to_value": preferred_equipment,
                            "reason": finding["message"],
                            "source_agent": "constraint",
                        }
                    )
                    changed = True
                elif finding["type"] == "time":
                    before = f"{meal['cook_time_minutes']} minutes"
                    meal["cook_time_minutes"] = 20
                    change_log.append(
                        {
                            "affected_item": meal["id"],
                            "from_value": before,
                            "to_value": "20 minutes",
                            "reason": finding["message"],
                            "source_agent": "constraint",
                        }
                    )
                    changed = True
                else:
                    unresolved.append(finding)

        for finding in user_output["preference_review"]["findings"]:
            meal = next(
                item for item in pack["meals"] if item["id"] == finding["affected_items"][0]
            )
            for dislike in dislikes:
                before = ", ".join(meal["ingredients"])
                meal["ingredients"] = [
                    "saucy chicken thigh"
                    if dislike.lower() in ingredient.lower()
                    else ingredient
                    for ingredient in meal["ingredients"]
                ]
                if before != ", ".join(meal["ingredients"]):
                    change_log.append(
                        {
                            "affected_item": meal["id"],
                            "from_value": before,
                            "to_value": ", ".join(meal["ingredients"]),
                            "reason": finding["message"],
                            "source_agent": "user",
                        }
                    )
                    changed = True

        for review in reviews:
            for finding in review["findings"]:
                if finding["severity"] == "high":
                    continue
                if finding["type"] == "budget":
                    meal = pack["meals"][0]
                    before = f"{', '.join(meal['ingredients'])} (${meal['estimated_cost']:.2f})"
                    meal["ingredients"] = [
                        "tofu and egg" if item.lower() == "salmon" else item
                        for item in meal["ingredients"]
                    ]
                    meal["estimated_cost"] = max(3.0, meal["estimated_cost"] - 8.0)
                    change_log.append(
                        {
                            "affected_item": meal["id"],
                            "from_value": before,
                            "to_value": f"{', '.join(meal['ingredients'])} (${meal['estimated_cost']:.2f})",
                            "reason": finding["message"],
                            "source_agent": "constraint",
                        }
                    )
                    changed = True
                if finding["type"] == "time":
                    meal = next(
                        item
                        for item in pack["meals"]
                        if item["id"] == finding["affected_items"][0]
                    )
                    before = f"{meal['cook_time_minutes']} minutes"
                    meal["cook_time_minutes"] = 20
                    change_log.append(
                        {
                            "affected_item": meal["id"],
                            "from_value": before,
                            "to_value": "20 minutes",
                            "reason": finding["message"],
                            "source_agent": "constraint",
                        }
                    )
                    changed = True

        return {
            "forked_meal_pack": pack,
            "change_log": change_log,
            "unresolved_items": unresolved,
            "summary": (
                "Could not safely fork the meal pack because hard constraints remain unresolved."
                if unresolved
                else "Adapted by fake qwen."
                if changed
                else "Meal pack already fits."
            ),
        }


def workflow():
    return ForkFitLangGraphWorkflow(llm_client=FakeLLMClient())


def base_user(**overrides):
    data = {
        "people_count": 1,
        "budget": 60,
        "likes": ["rice bowls"],
        "dislikes": [],
        "allergies": [],
        "diet_rules": [],
        "equipment": ["stovetop", "air fryer", "rice cooker"],
        "max_cook_time_minutes": 30,
    }
    data.update(overrides)
    return UserProfile(**data)


def pack_with(*meals):
    return MealPack(
        id="pack",
        title="Community Pack",
        theme="weeknight dinners",
        meals=list(meals),
    )


def meal(**overrides):
    data = {
        "id": "monday",
        "day": "Monday",
        "name": "Rice Bowl",
        "ingredients": ["rice", "tofu", "broccoli"],
        "equipment": ["stovetop"],
        "cook_time_minutes": 25,
        "estimated_cost": 10,
        "tags": ["rice bowl"],
        "notes": "",
    }
    data.update(overrides)
    return Meal(**data)


class ForkFitAgentTests(unittest.TestCase):
    def test_allergy_block_is_replaced_and_traced(self):
        user = base_user(allergies=["peanut"])
        source = pack_with(
            meal(
                id="tuesday",
                day="Tuesday",
                name="Peanut Noodle Bowl",
                ingredients=["noodles", "peanut sauce", "cucumber"],
            )
        )

        result = workflow().run(user, source)

        self.assertTrue(result.success)
        forked_text = result.adapter_output.forked_meal_pack.meals[0].searchable_text()
        self.assertNotIn("peanut", forked_text)
        self.assertIn("sesame", forked_text)
        self.assertEqual(result.reviews[0].status, "block")
        self.assertEqual(result.adapter_output.change_log[0].source_agent, "constraint")

    def test_equipment_block_is_converted_to_available_method(self):
        user = base_user(equipment=["air fryer", "rice cooker"])
        source = pack_with(
            meal(
                id="wednesday",
                day="Wednesday",
                name="Oven Salmon Bowl",
                equipment=["oven"],
            )
        )

        result = workflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.adapter_output.forked_meal_pack.meals[0].equipment, ["air fryer"])

    def test_user_taste_warning_can_trigger_minimal_preference_fix(self):
        user = base_user(dislikes=["chicken breast"])
        source = pack_with(
            meal(
                id="monday",
                name="Chicken Breast Rice Bowl",
                ingredients=["rice", "chicken breast", "broccoli"],
            )
        )

        result = workflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.user_agent_output.preference_review.status, "warn")
        self.assertIn(
            "saucy chicken thigh",
            result.adapter_output.forked_meal_pack.meals[0].ingredients,
        )
        self.assertEqual(result.adapter_output.change_log[0].source_agent, "user")

    def test_budget_warning_can_be_softly_reduced(self):
        user = base_user(budget=60)
        source = pack_with(
            meal(
                id="friday",
                name="Salmon Rice Bowl",
                ingredients=["rice", "salmon", "asparagus"],
                estimated_cost=65,
            )
        )

        result = workflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.reviews[0].status, "warn")
        self.assertLessEqual(result.adapter_output.forked_meal_pack.estimated_cost, 60)

    def test_no_conflict_keeps_pack_unchanged(self):
        user = base_user()
        source = pack_with(meal())

        result = workflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.adapter_output.change_log, [])
        self.assertEqual(source.to_dict(), result.adapter_output.forked_meal_pack.to_dict())

    def test_unresolvable_hard_block_fails_without_fake_fork(self):
        user = base_user(equipment=[])
        source = pack_with(
            meal(
                id="sunday",
                day="Sunday",
                name="Smoked Brisket",
                equipment=["smoker"],
            )
        )

        result = workflow().run(user, source)

        self.assertFalse(result.success)
        self.assertTrue(result.adapter_output.unresolved_items)
        self.assertIn("unresolved", result.adapter_output.summary)

    def test_constraint_agent_only_needs_constraints_not_full_user_profile(self):
        user = base_user(allergies=["peanut"])
        source = pack_with(meal(ingredients=["rice", "peanut sauce"]))
        user_output = UserAgent(FakeLLMClient()).run(user, source)
        constraints = user_output.preference_profile.to_constraints(user)

        review = ConstraintAgent(FakeLLMClient()).review(source, constraints)

        self.assertEqual(review.status, "block")
        self.assertEqual(review.findings[0].type, "allergy")

    def test_mock_reviewer_uses_extension_protocol_without_workflow_changes(self):
        class MockNutritionAgent:
            agent_name = "nutrition"

            def review(self, meal_pack, constraints, trace=None):
                return AgentReview(
                    agent="nutrition",
                    status="warn",
                    findings=[
                        AgentFinding(
                            type="protein_low",
                            severity="medium",
                            affected_items=["monday"],
                            message="Protein may be low.",
                            suggested_action="Add tofu or eggs.",
                        )
                    ],
                    scores={"nutrition_balance": 0.68},
                )

        user = base_user()
        source = pack_with(meal())

        result = ForkFitLangGraphWorkflow(
            reviewer_agents=[ConstraintAgent(FakeLLMClient()), MockNutritionAgent()],
            llm_client=FakeLLMClient(),
        ).run(
            user, source
        )

        self.assertTrue(result.success)
        self.assertEqual([review.agent for review in result.reviews], ["constraint", "nutrition"])

    def test_langgraph_workflow_runs_full_recipe_flow(self):
        user = base_user(
            allergies=["peanut"],
            dislikes=["chicken breast"],
            equipment=["air fryer", "stovetop"],
        )
        source = pack_with(
            meal(
                id="tuesday",
                day="Tuesday",
                name="Peanut Chicken Breast Rice Bowl",
                ingredients=["rice", "chicken breast", "peanut sauce", "broccoli"],
                equipment=["oven"],
                cook_time_minutes=35,
            )
        )

        result = workflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.user_agent_output.preference_review.status, "warn")
        self.assertEqual(result.reviews[0].status, "block")
        self.assertEqual(result.final_review.status, "pass")
        forked = result.adapter_output.forked_meal_pack.meals[0]
        self.assertNotIn("peanut", forked.searchable_text())
        self.assertEqual(forked.equipment, ["air fryer"])
        self.assertGreaterEqual(len(result.adapter_output.change_log), 3)

    def test_langgraph_trace_records_steps_and_llm_calls(self):
        user = base_user(dislikes=["chicken breast"])
        source = pack_with(
            meal(
                name="Chicken Breast Rice Bowl",
                ingredients=["rice", "chicken breast"],
            )
        )

        result = workflow().run(user, source)

        self.assertIsNotNone(result.trace)
        self.assertEqual(
            [step.node for step in result.trace.steps],
            [
                "load_input",
                "user_agent",
                "reviewer_agents",
                "adapter_agent",
                "final_validation",
            ],
        )
        self.assertEqual(result.trace.llm_call_count, 3)
        self.assertEqual(
            [call.agent for call in result.trace.llm_calls],
            ["user", "constraint", "adapter"],
        )

    def test_langgraph_auto_tracing_is_disabled_for_workflow_run(self):
        context = Mock()
        context.__enter__ = Mock(return_value=None)
        context.__exit__ = Mock(return_value=None)

        with patch(
            "forkfit.langgraph_workflow.tracing_context", return_value=context
        ) as tracing_context:
            workflow().run(base_user(), pack_with(meal()))

        tracing_context.assert_called_once_with(enabled=False)
        context.__enter__.assert_called_once()
        context.__exit__.assert_called_once()

    def test_final_validation_is_guard_not_agent(self):
        user = base_user(allergies=["peanut"])
        source = pack_with(meal(ingredients=["rice", "peanut sauce"]))
        constraints = UserAgent(FakeLLMClient()).run(
            user, source
        ).preference_profile.to_constraints(user)

        review = ConstraintGuard().review(source, constraints)

        self.assertEqual(review.agent, "constraint_guard")
        self.assertEqual(review.status, "block")

    def test_llm_source_agent_is_normalized_to_single_agent(self):
        self.assertEqual(normalize_source_agent("user | constraint"), "constraint")
        self.assertEqual(normalize_source_agent("constraint | user"), "constraint")
        self.assertEqual(normalize_source_agent("USER"), "user")


if __name__ == "__main__":
    unittest.main()
