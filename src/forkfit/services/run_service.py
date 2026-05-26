from __future__ import annotations

from dataclasses import asdict

from forkfit.executors.base import JobExecutor
from forkfit.models import MealPack, UserProfile
from forkfit.stores.base import RunRecord, RunStore


class RunService:
    def __init__(self, *, store: RunStore, executor: JobExecutor) -> None:
        self.store = store
        self.executor = executor

    async def create_run(
        self, *, user_id: str, user_profile: UserProfile, meal_pack: MealPack
    ) -> RunRecord:
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
        )
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        return self.store.get_run(run_id)
