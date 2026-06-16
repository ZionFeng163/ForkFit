import unittest
from dataclasses import asdict

from fastapi.testclient import TestClient
from redis import Redis

from forkfit.api.app import create_app
from forkfit.api.deps import current_user, get_run_service
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.db.models import RunEventRow, RunRow
from forkfit.db.session import make_session_factory
from forkfit.fixtures import demo_meal_pack, demo_user_profile
from forkfit.services import RunService
from forkfit.stores import PostgresRunStore


class NoopExecutor:
    async def submit(self, **_kwargs) -> None:
        return None


class RunApiIntegrationTests(unittest.TestCase):
    def _delete_run(self, run_id: str) -> None:
        session_factory = make_session_factory(get_settings().database_url)
        with session_factory() as session:
            session.query(RunEventRow).filter(RunEventRow.run_id == run_id).delete()
            session.query(RunRow).filter(RunRow.id == run_id).delete()
            session.commit()

    def test_create_run_requires_real_postgres_and_redis(self):
        settings = get_settings()
        try:
            Redis.from_url(settings.redis_url).ping()
        except Exception as exc:
            self.fail(
                "Redis is required for API integration tests. "
                f"Install/start Redis at {settings.redis_url}. Original error: {exc}"
            )

        store = PostgresRunStore(make_session_factory(settings.database_url))
        service = RunService(store=store, executor=NoopExecutor(), settings=settings)
        app = create_app()
        app.dependency_overrides[get_run_service] = lambda: service
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
        self.addCleanup(self._delete_run, run_id)
        self.assertEqual(response.json()["status"], "queued")
        self.assertIn("queue_position", response.json())
        self.assertIn("user_message", response.json())

        get_response = client.get(f"/runs/{run_id}")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["user_id"], "demo_user")

    def test_feedback_requires_succeeded_run(self):
        store = PostgresRunStore(make_session_factory(get_settings().database_url))
        service = RunService(store=store, executor=NoopExecutor(), settings=get_settings())
        app = create_app()
        app.dependency_overrides[get_run_service] = lambda: service
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
        run_id = response.json()["run_id"]
        self.addCleanup(self._delete_run, run_id)

        feedback_response = client.post(
            f"/runs/{run_id}/feedback",
            json={"rating": "helpful", "reason": "good"},
        )

        self.assertEqual(feedback_response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
