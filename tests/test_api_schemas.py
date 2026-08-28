import unittest

from pydantic import ValidationError

from forkfit.api.schemas import CreateMealPlanRequest, CreateRunRequest
from forkfit.fixtures import demo_meal_pack, demo_user_profile


class ApiSchemaTests(unittest.TestCase):
    def test_create_run_request_accepts_current_domain_models(self):
        request = CreateRunRequest(
            user_profile=demo_user_profile(),
            meal_pack=demo_meal_pack(),
        )

        self.assertEqual(request.user_profile.people_count, 1)
        self.assertEqual(request.meal_pack.meals[0].id, "tuesday")

    def test_meal_plan_requires_at_least_one_selected_recipe_per_day(self):
        with self.assertRaises(ValidationError):
            CreateMealPlanRequest(
                days=3,
                selected_post_ids=["post-1", "post-2"],
                user_profile=demo_user_profile(),
            )

    def test_meal_plan_accepts_larger_candidate_pool_up_to_fourteen(self):
        request = CreateMealPlanRequest(
            days=3,
            selected_post_ids=[f"post-{index}" for index in range(8)],
            user_profile=demo_user_profile(),
        )
        self.assertEqual(len(request.selected_post_ids), 8)


if __name__ == "__main__":
    unittest.main()
