import unittest
from dataclasses import asdict

from fastapi.testclient import TestClient
from redis import Redis

from forkfit.api.app import create_app
from forkfit.api.deps import current_user
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.fixtures import demo_meal_pack, demo_user_profile


class RunApiIntegrationTests(unittest.TestCase):
    def test_create_run_requires_real_postgres_and_redis(self):
        settings = get_settings()
        try:
            Redis.from_url(settings.redis_url).ping()
        except Exception as exc:
            self.fail(
                "Redis is required for API integration tests. "
                f"Install/start Redis at {settings.redis_url}. Original error: {exc}"
            )

        app = create_app()
        app.dependency_overrides[current_user] = lambda: CurrentUser(
            id="demo_user",
            username="demo",
            display_name="Demo User",
            avatar_url=None,
            role="user",
        )
        client = TestClient(app)
        response = client.post(
            "/runs",
            json={
                "user_profile": asdict(demo_user_profile()),
                "meal_pack": demo_meal_pack().to_dict(),
            },
        )

        self.assertEqual(response.status_code, 200)
        run_id = response.json()["run_id"]
        self.assertEqual(response.json()["status"], "queued")

        get_response = client.get(f"/runs/{run_id}")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["user_id"], "demo_user")


if __name__ == "__main__":
    unittest.main()
