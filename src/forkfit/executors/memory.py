from __future__ import annotations

import asyncio

from forkfit.api.schemas import PublicRunError, result_payload_from_forkfit
from forkfit.executors.base import WorkflowRunner
from forkfit.models import MealPack, UserProfile
from forkfit.stores.base import RunStore


class InMemoryJobExecutor:
    def __init__(
        self,
        *,
        store: RunStore,
        workflow: WorkflowRunner,
        max_concurrent_runs: int,
    ) -> None:
        self.store = store
        self.workflow = workflow
        self._semaphore = asyncio.Semaphore(max_concurrent_runs)

    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
    ) -> None:
        asyncio.create_task(self._run(run_id, user_profile, meal_pack))

    async def _run(
        self, run_id: str, user_profile: UserProfile, meal_pack: MealPack
    ) -> None:
        async with self._semaphore:
            self.store.mark_running(run_id)
            try:
                result = await asyncio.to_thread(
                    self.workflow.run, user_profile, meal_pack
                )
                if result.success:
                    self.store.mark_succeeded(
                        run_id,
                        result=result_payload_from_forkfit(meal_pack, result),
                        trace=result.trace,
                    )
                else:
                    self.store.mark_failed(
                        run_id,
                        error=PublicRunError(
                            message="该饭包无法安全适配，请调整过敏源、厨具或食材后重试。"
                        ),
                        trace=result.trace,
                    )
            except Exception:
                self.store.mark_failed(
                    run_id,
                    error=PublicRunError(message="运行失败，请稍后重试。"),
                )
