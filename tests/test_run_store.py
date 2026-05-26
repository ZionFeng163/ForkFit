import unittest

from forkfit.api.schemas import PublicRunError
from forkfit.fixtures import demo_meal_pack, demo_user_profile
from forkfit.stores import InMemoryRunStore


class InMemoryRunStoreTests(unittest.TestCase):
    def test_create_run_records_user_and_queued_status(self):
        store = InMemoryRunStore()

        run = store.create_run(
            user_id="demo_user",
            input_payload={"user_profile": demo_user_profile()},
            original_meal_pack=demo_meal_pack(),
        )

        self.assertEqual(run.user_id, "demo_user")
        self.assertEqual(run.status, "queued")
        self.assertEqual(run.events[0]["type"], "run_queued")

    def test_mark_running_and_failed(self):
        store = InMemoryRunStore()
        run = store.create_run(
            user_id="demo_user",
            input_payload={},
            original_meal_pack=demo_meal_pack(),
        )

        store.mark_running(run.id)
        failed = store.mark_failed(
            run.id,
            error=PublicRunError(message="safe error"),
        )

        self.assertEqual(failed.status, "failed")
        self.assertEqual(failed.error.message, "safe error")
        self.assertEqual([event["type"] for event in failed.events], ["run_queued", "run_started", "run_failed"])


if __name__ == "__main__":
    unittest.main()
