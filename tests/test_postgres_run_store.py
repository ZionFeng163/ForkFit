import tempfile
import unittest
from pathlib import Path

from forkfit.api.schemas import PublicRunError
from forkfit.db.session import make_session_factory
from forkfit.fixtures import demo_meal_pack
from forkfit.stores import PostgresRunStore


class PostgresRunStoreTests(unittest.TestCase):
    def test_create_and_fail_run_with_sqlite_backing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            store = PostgresRunStore(make_session_factory(f"sqlite:///{db_path}"))

            run = store.create_run(
                user_id="demo_user",
                input_payload={},
                original_meal_pack=demo_meal_pack(),
            )
            store.mark_running(run.id)
            failed = store.mark_failed(
                run.id, error=PublicRunError(message="safe failure")
            )

            loaded = store.get_run(run.id)
            self.assertEqual(loaded.status, "failed")
            self.assertEqual(failed.error.message, "safe failure")
            self.assertEqual(
                [event["type"] for event in loaded.events],
                ["run_queued", "run_started", "run_failed"],
            )


if __name__ == "__main__":
    unittest.main()
