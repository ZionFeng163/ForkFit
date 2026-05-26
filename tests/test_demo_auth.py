import unittest

from forkfit.auth.demo_auth import get_current_user
from forkfit.config import Settings


class DemoAuthTests(unittest.TestCase):
    def test_demo_auth_returns_configured_user_id(self):
        user = get_current_user(Settings(demo_user_id="review_user"))

        self.assertEqual(user.id, "review_user")
        self.assertEqual(user.display_name, "Demo User")


if __name__ == "__main__":
    unittest.main()
