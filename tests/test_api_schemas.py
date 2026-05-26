import unittest

from forkfit.api.schemas import CreateRunRequest
from forkfit.fixtures import demo_meal_pack, demo_user_profile


class ApiSchemaTests(unittest.TestCase):
    def test_create_run_request_accepts_current_domain_models(self):
        request = CreateRunRequest(
            user_profile=demo_user_profile(),
            meal_pack=demo_meal_pack(),
        )

        self.assertEqual(request.user_profile.people_count, 1)
        self.assertEqual(request.meal_pack.meals[0].id, "tuesday")


if __name__ == "__main__":
    unittest.main()
