from __future__ import annotations

from typing import Protocol

from forkfit.models import ForkFitResult, MealPack, UserProfile


class WorkflowRunner(Protocol):
    def run(self, user_profile: UserProfile, meal_pack: MealPack) -> ForkFitResult:
        ...


class JobExecutor(Protocol):
    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
    ) -> None:
        ...
