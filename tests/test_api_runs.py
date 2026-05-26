import time
import unittest
from dataclasses import asdict

from fastapi.testclient import TestClient

from forkfit.api.app import create_app
from forkfit.fixtures import demo_meal_pack, demo_user_profile


class RunApiTests(unittest.TestCase):
    def test_create_and_get_run(self):
        client = TestClient(create_app())

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
        self.assertEqual(payload["result"]["summary"], "Demo workflow completed.")

    def test_get_unknown_run_returns_404(self):
        client = TestClient(create_app())

        response = client.get("/runs/run_missing")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
