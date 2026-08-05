from __future__ import annotations

import asyncio
import logging

from forkfit.models import MealPack, UserProfile
from forkfit.stores.postgres import PostgresRunStore
from forkfit.workers.runner import run_forkfit_job

logger = logging.getLogger(__name__)


class InlineJobExecutor:
    """A durable PostgreSQL-backed dispatcher for the single API process."""

    def __init__(
        self,
        store: PostgresRunStore,
        max_concurrency: int = 1,
        global_semaphore: asyncio.Semaphore | None = None,
    ) -> None:
        self.store = store
        self.max_concurrency = max(1, max_concurrency)
        self.global_semaphore = global_semaphore
        self._dispatcher: asyncio.Task[None] | None = None
        self._jobs: set[asyncio.Task[None]] = set()
        self._wake = asyncio.Event()
        self._running = False

    async def start(self) -> None:
        if self._dispatcher and not self._dispatcher.done():
            return
        recovered = await asyncio.to_thread(self.store.requeue_expired_runs)
        if recovered:
            logger.info("Recovered %s expired ForkFit runs", recovered)
        self._running = True
        self._dispatcher = asyncio.create_task(self._dispatch_loop())
        self._wake.set()

    async def stop(self) -> None:
        self._running = False
        self._wake.set()
        if self._dispatcher:
            await self._dispatcher
        if self._jobs:
            await asyncio.gather(*self._jobs, return_exceptions=True)

    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
        locale: str = "en",
    ) -> None:
        del run_id, user_profile, meal_pack, locale
        await self.start()
        self._wake.set()

    async def _dispatch_loop(self) -> None:
        while self._running:
            self._wake.clear()
            while self._running and len(self._jobs) < self.max_concurrency:
                run = await asyncio.to_thread(self.store.claim_next_run)
                if run is None:
                    break
                task = asyncio.create_task(self._execute(run.id, run.input_payload))
                self._jobs.add(task)
                task.add_done_callback(self._job_done)
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=5)
            except asyncio.TimeoutError:
                await asyncio.to_thread(self.store.requeue_expired_runs)

    async def _execute(self, run_id: str, payload: dict) -> None:
        if self.global_semaphore is None:
            await self._run_job(run_id, payload)
            return
        async with self.global_semaphore:
            await self._run_job(run_id, payload)

    @staticmethod
    async def _run_job(run_id: str, payload: dict) -> None:
        await asyncio.to_thread(
            run_forkfit_job,
            run_id,
            payload["user_profile"],
            payload["meal_pack"],
            payload.get("locale", "en"),
            True,
            payload.get("request_text", ""),
        )

    def _job_done(self, task: asyncio.Task[None]) -> None:
        self._jobs.discard(task)
        self._wake.set()
        if task.cancelled():
            return
        error = task.exception()
        if error:
            logger.error("Inline ForkFit job crashed", exc_info=error)
