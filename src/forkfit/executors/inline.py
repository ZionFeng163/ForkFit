from __future__ import annotations

import asyncio
import logging

from forkfit.models import MealPack, UserProfile
from forkfit.serialization import meal_pack_to_dict, user_profile_to_dict
from forkfit.workers.runner import run_forkfit_job

logger = logging.getLogger(__name__)
_tasks: set[asyncio.Task[None]] = set()


class InlineJobExecutor:
    """Run jobs in background threads for small single-instance deployments."""

    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
        locale: str = "en",
    ) -> None:
        task = asyncio.create_task(
            asyncio.to_thread(
                run_forkfit_job,
                run_id,
                user_profile_to_dict(user_profile),
                meal_pack_to_dict(meal_pack),
                locale,
            )
        )
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
        task.add_done_callback(self._log_failure)

    @staticmethod
    def _log_failure(task: asyncio.Task[None]) -> None:
        if task.cancelled():
            return
        error = task.exception()
        if error is not None:
            logger.error("Inline job failed", exc_info=error)
