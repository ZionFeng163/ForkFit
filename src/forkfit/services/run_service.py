from __future__ import annotations

from dataclasses import asdict

from fastapi import HTTPException

from forkfit.config import Settings
from forkfit.executors.base import JobExecutor
from forkfit.models import MealPack, UserProfile
from forkfit.stores.base import RunRecord, RunStore


class RunService:
    def __init__(
        self, *, store: RunStore, executor: JobExecutor, settings: Settings
    ) -> None:
        self.store = store
        self.executor = executor
        self.settings = settings

    async def create_run(
        self, *, user_id: str, user_profile: UserProfile, meal_pack: MealPack, locale: str = "en"
    ) -> RunRecord:
        user_active = self.store.count_active_runs_for_user(user_id)
        if user_active >= self.settings.max_user_concurrent_runs:
            raise HTTPException(
                status_code=429,
                detail=f"Too many concurrent runs. Limit: {self.settings.max_user_concurrent_runs}.",
            )

        global_active = self.store.count_global_active_runs()
        if global_active >= self.settings.max_global_concurrent_runs:
            raise HTTPException(
                status_code=429,
                detail=f"Server is at capacity. Try again later.",
            )

        run = self.store.create_run(
            user_id=user_id,
            input_payload={
                "user_profile": asdict(user_profile),
                "meal_pack": meal_pack.to_dict(),
            },
            original_meal_pack=meal_pack,
        )
        await self.executor.submit(
            run_id=run.id,
            user_profile=user_profile,
            meal_pack=meal_pack,
            locale=locale,
        )
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        return self.store.get_run(run_id)
