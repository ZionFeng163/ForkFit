from __future__ import annotations

from threading import Lock
from uuid import uuid4

from forkfit.api.schemas import PublicRunError, RunResultPayload
from forkfit.models import MealPack, RunTrace
from forkfit.stores.base import RunRecord, utc_now


class InMemoryRunStore:
    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}
        self._lock = Lock()

    def create_run(
        self, *, user_id: str, input_payload: dict, original_meal_pack: MealPack
    ) -> RunRecord:
        run = RunRecord(
            id=f"run_{uuid4().hex}",
            user_id=user_id,
            status="queued",
            input_payload=input_payload,
            original_meal_pack=original_meal_pack,
        )
        with self._lock:
            self._runs[run.id] = run
        self.append_event(run.id, "run_queued", {})
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._lock:
            return self._runs.get(run_id)

    def mark_running(self, run_id: str) -> RunRecord:
        with self._lock:
            run = self._require_run(run_id)
            run.status = "running"
            run.started_at = utc_now()
        self.append_event(run_id, "run_started", {})
        return run

    def mark_succeeded(
        self, run_id: str, *, result: RunResultPayload, trace: RunTrace | None
    ) -> RunRecord:
        with self._lock:
            run = self._require_run(run_id)
            run.status = "succeeded"
            run.result = result
            run.trace = trace
            run.finished_at = utc_now()
        self.append_event(run_id, "run_succeeded", {})
        return run

    def mark_failed(
        self, run_id: str, *, error: PublicRunError, trace: RunTrace | None = None
    ) -> RunRecord:
        with self._lock:
            run = self._require_run(run_id)
            run.status = "failed"
            run.error = error
            run.trace = trace
            run.finished_at = utc_now()
        self.append_event(run_id, "run_failed", {"message": error.message})
        return run

    def append_event(self, run_id: str, event_type: str, payload: dict) -> None:
        with self._lock:
            run = self._require_run(run_id)
            run.events.append(
                {
                    "type": event_type,
                    "payload": payload,
                    "created_at": utc_now().isoformat(),
                }
            )

    def _require_run(self, run_id: str) -> RunRecord:
        run = self._runs.get(run_id)
        if run is None:
            raise KeyError(f"Unknown run_id: {run_id}")
        return run
