from __future__ import annotations

import asyncio
import logging

from forkfit.stores.meal_plans import PostgresMealPlanStore
from forkfit.workers.meal_plan_runner import run_meal_plan_job, run_meal_plan_message_job

logger = logging.getLogger(__name__)


class MealPlanExecutor:
    """Small durable dispatcher dedicated to expensive multi-day planning."""

    def __init__(
        self,
        store: PostgresMealPlanStore,
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
        recovered = await asyncio.to_thread(self.store.requeue_expired_plans)
        if recovered:
            logger.info("Recovered %s expired meal plans", recovered)
        recovered_messages = await asyncio.to_thread(self.store.requeue_expired_messages)
        if recovered_messages:
            logger.info("Recovered %s expired meal plan messages", recovered_messages)
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

    async def submit(self) -> None:
        await self.start()
        self._wake.set()

    async def _dispatch_loop(self) -> None:
        while self._running:
            self._wake.clear()
            while self._running and len(self._jobs) < self.max_concurrency:
                plan = await asyncio.to_thread(self.store.claim_next_plan)
                if plan is not None:
                    task = asyncio.create_task(
                        self._execute_plan(plan.id, plan.request_payload)
                    )
                else:
                    message = await asyncio.to_thread(self.store.claim_next_message)
                    if message is None:
                        break
                    task = asyncio.create_task(self._execute_message(message))
                self._jobs.add(task)
                task.add_done_callback(self._job_done)
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=5)
            except asyncio.TimeoutError:
                await asyncio.to_thread(self.store.requeue_expired_plans)
                await asyncio.to_thread(self.store.requeue_expired_messages)

    async def _execute_plan(self, plan_id: str, payload: dict) -> None:
        if self.global_semaphore is None:
            await asyncio.to_thread(run_meal_plan_job, plan_id, payload)
            return
        async with self.global_semaphore:
            await asyncio.to_thread(run_meal_plan_job, plan_id, payload)

    async def _execute_message(self, message) -> None:
        if self.global_semaphore is None:
            await asyncio.to_thread(
                run_meal_plan_message_job,
                message.id,
                message.plan_id,
                message.content,
                message.confirmed,
            )
            return
        async with self.global_semaphore:
            await asyncio.to_thread(
                run_meal_plan_message_job,
                message.id,
                message.plan_id,
                message.content,
                message.confirmed,
            )

    def _job_done(self, task: asyncio.Task[None]) -> None:
        self._jobs.discard(task)
        self._wake.set()
        if task.cancelled():
            return
        error = task.exception()
        if error:
            logger.error("Inline meal plan job crashed", exc_info=error)
