import time
import unittest
from dataclasses import asdict

from fastapi.testclient import TestClient

from forkfit.api.deps import get_run_service
from forkfit.api.app import create_app
from forkfit.executors import InMemoryJobExecutor
from forkfit.fixtures import demo_meal_pack, demo_user_profile
from forkfit.models import AdapterOutput, AgentReview, ForkFitResult
from forkfit.services import RunService
from forkfit.stores import InMemoryRunStore


class TestWorkflow:
    def run(self, user_profile, meal_pack):
        return ForkFitResult(
            success=True,
            user_agent_output=None,
            reviews=[],
            adapter_output=AdapterOutput(
                forked_meal_pack=meal_pack,
                change_log=[],
                unresolved_items=[],
                summary="Test workflow completed.",
            ),
            final_review=AgentReview(agent="constraint_guard", status="pass"),
            trace=None,
        )


def build_test_run_service() -> RunService:
    store = InMemoryRunStore()
    executor = InMemoryJobExecutor(
        store=store,
        workflow=TestWorkflow(),
        max_concurrent_runs=1,
    )
    return RunService(store=store, executor=executor)


class RunApiTests(unittest.TestCase):
    def test_create_and_get_run(self):
        app = create_app()
        service = build_test_run_service()
        app.dependency_overrides[get_run_service] = lambda: service
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

        deadline = time.time() + 2
        payload = None
        while time.time() < deadline:
            get_response = client.get(f"/runs/{run_id}")
            self.assertEqual(get_response.status_code, 200)
            payload = get_response.json()
            if payload["status"] == "succeeded":
                break
            time.sleep(0.05)

        self.assertEqual(payload["status"], "succeeded")
        self.assertEqual(payload["user_id"], "demo_user")
        self.assertEqual(payload["result"]["summary"], "Test workflow completed.")

    def test_get_unknown_run_returns_404(self):
        app = create_app()
        service = build_test_run_service()
        app.dependency_overrides[get_run_service] = lambda: service
        client = TestClient(app)

        response = client.get("/runs/run_missing")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
