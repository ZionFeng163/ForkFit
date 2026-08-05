from __future__ import annotations

from dataclasses import asdict
import hashlib
import json

from fastapi import HTTPException

from forkfit.api.schemas import PublicRunError
from forkfit.config import Settings
from forkfit.executors.base import JobExecutor
from forkfit.models import MealPack, UserProfile
from forkfit.recipe_agent import WORKFLOW_VERSION
from forkfit.stores.base import RunRecord, RunStore


class RunService:
    def __init__(
        self, *, store: RunStore, executor: JobExecutor, settings: Settings
    ) -> None:
        self.store = store
        self.executor = executor
        self.settings = settings

    async def create_run(
        self, *, user_id: str, user_profile: UserProfile, meal_pack: MealPack,
        locale: str = "en", request_text: str = "", idempotency_key: str = "",
    ) -> RunRecord:
        input_payload = {
            "user_profile": asdict(user_profile),
            "meal_pack": meal_pack.to_dict(),
            "locale": locale,
            "request_text": request_text,
        }
        input_hash = _input_hash(input_payload, idempotency_key)
        find_reusable = getattr(self.store, "find_reusable_run", None)
        reusable = (
            find_reusable(
                user_id=user_id,
                input_hash=input_hash,
                workflow_version=WORKFLOW_VERSION,
            )
            if find_reusable
            else None
        )
        if reusable is not None:
            return reusable

        user_active = self.store.count_active_runs_for_user(user_id)
        if user_active >= self.settings.max_user_concurrent_runs:
            raise HTTPException(
                status_code=429,
                detail=f"Too many concurrent runs. Limit: {self.settings.max_user_concurrent_runs}.",
            )

        run = self.store.create_run(
            user_id=user_id,
            input_payload=input_payload,
            original_meal_pack=meal_pack,
            input_hash=input_hash,
            workflow_version=WORKFLOW_VERSION,
        )
        try:
            await self.executor.submit(
                run_id=run.id,
                user_profile=user_profile,
                meal_pack=meal_pack,
                locale=locale,
            )
        except Exception as exc:
            self.store.mark_failed(
                run.id,
                error=PublicRunError(message="任务队列暂时不可用，请稍后重试。"),
            )
            raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
        return run

    async def requeue_run(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
        locale: str,
        request_text: str = "",
    ) -> RunRecord:
        run = self.store.requeue_run(
            run_id,
            input_payload={
                "user_profile": asdict(user_profile),
                "meal_pack": meal_pack.to_dict(),
                "locale": locale,
                "request_text": request_text,
            },
            original_meal_pack=meal_pack,
        )
        try:
            await self.executor.submit(
                run_id=run.id,
                user_profile=user_profile,
                meal_pack=meal_pack,
                locale=locale,
            )
        except Exception as exc:
            self.store.mark_failed(
                run.id,
                error=PublicRunError(message="任务队列暂时不可用，请稍后重试。"),
            )
            raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        return self.store.get_run(run_id)


def _input_hash(payload: dict, idempotency_key: str = "") -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(
        f"{WORKFLOW_VERSION}|{idempotency_key}|{canonical}".encode("utf-8")
    ).hexdigest()
