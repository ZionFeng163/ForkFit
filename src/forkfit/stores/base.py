from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Protocol

from forkfit.api.schemas import PublicRunError, RunResultPayload, RunStatus
from forkfit.models import MealPack, RunTrace


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class RunRecord:
    id: str
    user_id: str
    status: RunStatus
    input_payload: dict
    original_meal_pack: MealPack
    result: RunResultPayload | None = None
    error: PublicRunError | None = None
    trace: RunTrace | None = None
    events: list[dict] = field(default_factory=list)
    created_at: datetime = field(default_factory=utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None


class RunStore(Protocol):
    def create_run(
        self, *, user_id: str, input_payload: dict, original_meal_pack: MealPack
    ) -> RunRecord:
        ...

    def get_run(self, run_id: str) -> RunRecord | None:
        ...

    def mark_running(self, run_id: str) -> RunRecord:
        ...

    def mark_succeeded(
        self, run_id: str, *, result: RunResultPayload, trace: RunTrace | None
    ) -> RunRecord:
        ...

    def mark_failed(
        self, run_id: str, *, error: PublicRunError, trace: RunTrace | None = None
    ) -> RunRecord:
        ...

    def append_event(self, run_id: str, event_type: str, payload: dict) -> None:
        ...
