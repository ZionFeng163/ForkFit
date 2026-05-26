import unittest

from forkfit.api.schemas import PublicRunError, result_payload_from_forkfit
from forkfit.agents import ConstraintGuard
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.fixtures import demo_meal_pack, demo_user_profile
from forkfit.models import (
    AdapterOutput,
    ForkFitResult,
    PreferenceProfile,
    PreferenceReview,
    RunTrace,
    StepTrace,
    UserAgentOutput,
)
from forkfit.stores import PostgresRunStore


class PostgresRunStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        settings = get_settings()
        self.store = PostgresRunStore(make_session_factory(settings.database_url))

    def test_create_and_fail_run_with_postgres(self):
        run = self.store.create_run(
            user_id="demo_user",
            input_payload={},
            original_meal_pack=demo_meal_pack(),
        )
        self.store.mark_running(run.id)
        failed = self.store.mark_failed(
            run.id, error=PublicRunError(message="safe failure")
        )

        loaded = self.store.get_run(run.id)
        self.assertEqual(loaded.status, "failed")
        self.assertEqual(failed.error.message, "safe failure")
        self.assertEqual(
            [event["type"] for event in loaded.events],
            ["run_queued", "run_started", "run_failed"],
        )

    def test_succeeded_run_returns_result_and_trace(self):
        meal_pack = demo_meal_pack()
        user_output = UserAgentOutput(
            agent="user",
            preference_profile=PreferenceProfile(
                likes=[],
                dislikes=[],
                allergies=[],
                diet_rules=[],
                equipment=[],
                soft_preferences=[],
            ),
            preference_review=PreferenceReview(
                status="pass",
                fit_score=1.0,
                findings=[],
            ),
        )
        final_review = ConstraintGuard().review(
            meal_pack,
            user_output.preference_profile.to_constraints(demo_user_profile()),
        )
        result = ForkFitResult(
            success=True,
            user_agent_output=user_output,
            reviews=[],
            adapter_output=AdapterOutput(
                forked_meal_pack=meal_pack,
                change_log=[],
                unresolved_items=[],
                summary="No changes.",
            ),
            final_review=final_review,
            trace=RunTrace(
                steps=[
                    StepTrace(
                        node="final_validation",
                        duration_ms=1.0,
                        status="success",
                    )
                ]
            ),
        )

        run = self.store.create_run(
            user_id="demo_user",
            input_payload={},
            original_meal_pack=meal_pack,
        )
        self.store.mark_succeeded(
            run.id,
            result=result_payload_from_forkfit(meal_pack, result),
            trace=result.trace,
        )

        loaded = self.store.get_run(run.id)
        self.assertEqual(loaded.status, "succeeded")
        self.assertIsNotNone(loaded.result)
        self.assertIsNotNone(loaded.trace)
        self.assertEqual(loaded.trace.steps[0].node, "final_validation")


if __name__ == "__main__":
    unittest.main()
