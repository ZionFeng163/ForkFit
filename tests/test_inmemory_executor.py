import asyncio
import unittest

from forkfit.executors import InMemoryJobExecutor
from forkfit.fixtures import demo_meal_pack, demo_user_profile
from forkfit.models import AdapterOutput, AgentReview, ForkFitResult
from forkfit.stores import InMemoryRunStore


class FakeWorkflow:
    def run(self, user_profile, meal_pack):
        return ForkFitResult(
            success=True,
            user_agent_output=None,
            reviews=[],
            adapter_output=AdapterOutput(
                forked_meal_pack=meal_pack,
                change_log=[],
                unresolved_items=[],
                summary="ok",
            ),
            final_review=AgentReview(agent="constraint_guard", status="pass"),
            trace=None,
        )


class InMemoryJobExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_executor_runs_workflow_and_marks_success(self):
        store = InMemoryRunStore()
        meal_pack = demo_meal_pack()
        run = store.create_run(
            user_id="demo_user",
            input_payload={},
            original_meal_pack=meal_pack,
        )
        executor = InMemoryJobExecutor(
            store=store,
            workflow=FakeWorkflow(),
            max_concurrent_runs=1,
        )

        await executor.submit(
            run_id=run.id,
            user_profile=demo_user_profile(),
            meal_pack=meal_pack,
        )
        await asyncio.sleep(0.05)

        saved = store.get_run(run.id)
        self.assertEqual(saved.status, "succeeded")
        self.assertEqual(saved.result.summary, "ok")


if __name__ == "__main__":
    unittest.main()
