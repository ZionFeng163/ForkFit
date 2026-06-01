from __future__ import annotations

from typing import Protocol

from forkfit.models import MealPack, UserProfile


class JobExecutor(Protocol):
    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
        locale: str = "en",
    ) -> None:
        ...
