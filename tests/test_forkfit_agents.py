import unittest

from forkfit import (
    AgentFinding,
    AgentReview,
    ConstraintAgent,
    ForkFitLangGraphWorkflow,
    ForkFitWorkflow,
    Meal,
    MealPack,
    UserAgent,
    UserProfile,
)


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

        result = ForkFitWorkflow().run(user, source)

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

        result = ForkFitWorkflow().run(user, source)

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

        result = ForkFitWorkflow().run(user, source)

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

        result = ForkFitWorkflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.reviews[0].status, "warn")
        self.assertLessEqual(result.adapter_output.forked_meal_pack.estimated_cost, 60)

    def test_no_conflict_keeps_pack_unchanged(self):
        user = base_user()
        source = pack_with(meal())

        result = ForkFitWorkflow().run(user, source)

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

        result = ForkFitWorkflow().run(user, source)

        self.assertFalse(result.success)
        self.assertTrue(result.adapter_output.unresolved_items)
        self.assertIn("unresolved", result.adapter_output.summary)

    def test_constraint_agent_only_needs_constraints_not_full_user_profile(self):
        user = base_user(allergies=["peanut"])
        source = pack_with(meal(ingredients=["rice", "peanut sauce"]))
        user_output = UserAgent().run(user, source)
        constraints = user_output.preference_profile.to_constraints(user)

        review = ConstraintAgent().review(source, constraints)

        self.assertEqual(review.status, "block")
        self.assertEqual(review.findings[0].type, "allergy")

    def test_mock_reviewer_uses_extension_protocol_without_workflow_changes(self):
        class MockNutritionAgent:
            agent_name = "nutrition"

            def review(self, meal_pack, constraints):
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

        result = ForkFitWorkflow(reviewer_agents=[ConstraintAgent(), MockNutritionAgent()]).run(
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

        result = ForkFitLangGraphWorkflow().run(user, source)

        self.assertTrue(result.success)
        self.assertEqual(result.user_agent_output.preference_review.status, "warn")
        self.assertEqual(result.reviews[0].status, "block")
        self.assertEqual(result.final_review.status, "pass")
        forked = result.adapter_output.forked_meal_pack.meals[0]
        self.assertNotIn("peanut", forked.searchable_text())
        self.assertEqual(forked.equipment, ["air fryer"])
        self.assertGreaterEqual(len(result.adapter_output.change_log), 3)


if __name__ == "__main__":
    unittest.main()
