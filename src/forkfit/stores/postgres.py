from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

from forkfit.api.schemas import PublicRunError, RunResultPayload
from forkfit.db.models import RunEventRow, RunFeedbackRow, RunRow
from forkfit.models import MealPack, RunTrace
from forkfit.serialization import meal_pack_from_dict, run_trace_from_dict
from forkfit.stores.base import RunRecord, utc_now


@dataclass(frozen=True, slots=True)
class RunFeedbackRecord:
    id: int
    run_id: str
    user_id: str
    rating: str
    reason: str
    created_at: datetime


class PostgresRunStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def create_run(
        self, *, user_id: str, input_payload: dict, original_meal_pack: MealPack,
        input_hash: str = "", workflow_version: str = "v2",
    ) -> RunRecord:
        run_id = f"run_{uuid4().hex}"
        with self.session_factory() as session:
            row = RunRow(
                id=run_id,
                user_id=user_id,
                status="queued",
                input_payload=input_payload,
                original_meal_pack=original_meal_pack.to_dict(),
                input_hash=input_hash,
                workflow_version=workflow_version,
                current_stage="queued",
            )
            session.add(row)
            session.commit()
        self.append_event(run_id, "run_queued", {})
        return self.get_run(run_id)

    def get_run(self, run_id: str) -> RunRecord | None:
        with self.session_factory() as session:
            row = session.get(RunRow, run_id)
            if row is None:
                return None
            record = _record_from_row(row)
            event_rows = (
                session.query(RunEventRow)
                .filter(RunEventRow.run_id == run_id)
                .order_by(RunEventRow.id.asc())
                .all()
            )
            record.events = [
                {
                    "type": event.event_type,
                    "payload": event.payload,
                    "created_at": event.created_at.isoformat(),
                }
                for event in event_rows
            ]
            return record

    def find_reusable_run(
        self, *, user_id: str, input_hash: str, workflow_version: str
    ) -> RunRecord | None:
        if not input_hash:
            return None
        with self.session_factory() as session:
            row = (
                session.query(RunRow)
                .filter(
                    RunRow.user_id == user_id,
                    RunRow.input_hash == input_hash,
                    RunRow.workflow_version == workflow_version,
                    RunRow.status.in_(["queued", "running", "succeeded"]),
                    RunRow.created_at >= utc_now() - timedelta(hours=24),
                )
                .order_by(RunRow.created_at.desc())
                .first()
            )
            return _record_from_row(row) if row else None

    def mark_running(self, run_id: str) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "running"
            row.started_at = utc_now()
            row.current_stage = "starting"
            row.attempt_count += 1
            session.commit()
        self.append_event(run_id, "run_started", {})
        return self.get_run(run_id)

    def requeue_run(
        self, run_id: str, *, input_payload: dict, original_meal_pack: MealPack
    ) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "queued"
            row.input_payload = input_payload
            row.original_meal_pack = original_meal_pack.to_dict()
            row.result_payload = None
            row.error_payload = None
            row.trace_payload = None
            row.unresolved_payload = None
            row.started_at = None
            row.finished_at = None
            row.current_stage = "queued"
            row.lease_expires_at = None
            row.checkpoint_payload = None
            session.commit()
        self.append_event(run_id, "run_requeued", {})
        return self.get_run(run_id)

    def update_trace(self, run_id: str, trace: RunTrace) -> None:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.trace_payload = asdict(trace)
            session.commit()

    def update_checkpoint(
        self,
        run_id: str,
        *,
        stage: str,
        checkpoint: dict | None,
        trace: RunTrace,
        lease_seconds: int = 180,
    ) -> None:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.current_stage = stage
            row.checkpoint_payload = checkpoint
            row.trace_payload = asdict(trace)
            if row.status == "running":
                row.lease_expires_at = utc_now() + timedelta(seconds=lease_seconds)
            session.commit()

    def claim_next_run(self, lease_seconds: int = 180) -> RunRecord | None:
        run_id = None
        with self.session_factory() as session:
            row = (
                session.query(RunRow)
                .filter(RunRow.status == "queued")
                .order_by(RunRow.created_at.asc(), RunRow.id.asc())
                .with_for_update(skip_locked=True)
                .first()
            )
            if row is None:
                return None
            row.status = "running"
            row.current_stage = "starting"
            row.started_at = row.started_at or utc_now()
            row.finished_at = None
            row.attempt_count += 1
            row.lease_expires_at = utc_now() + timedelta(seconds=lease_seconds)
            run_id = row.id
            session.commit()
        self.append_event(run_id, "run_started", {"attempt": self.get_run(run_id).attempt_count})
        return self.get_run(run_id)

    def requeue_expired_runs(self) -> int:
        now = utc_now()
        run_ids: list[str] = []
        with self.session_factory() as session:
            rows = session.query(RunRow).filter(
                RunRow.status == "running",
                RunRow.lease_expires_at.is_not(None),
                RunRow.lease_expires_at < now,
            ).all()
            for row in rows:
                row.status = "queued"
                row.current_stage = "queued"
                row.lease_expires_at = None
                run_ids.append(row.id)
            session.commit()
        for run_id in run_ids:
            self.append_event(run_id, "run_recovered", {})
        return len(run_ids)

    def mark_succeeded(
        self, run_id: str, *, result: RunResultPayload, trace: RunTrace | None
    ) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "succeeded"
            row.result_payload = result.model_dump(mode="json")
            row.trace_payload = asdict(trace) if trace else None
            row.finished_at = utc_now()
            row.current_stage = "completed"
            row.lease_expires_at = None
            session.commit()
        self.append_event(run_id, "run_succeeded", {})
        return self.get_run(run_id)

    def mark_failed(
        self, run_id: str, *, error: PublicRunError, trace: RunTrace | None = None,
        result=None,
    ) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "failed"
            row.error_payload = error.model_dump(mode="json")
            if result is not None:
                row.result_payload = result.model_dump(mode="json") if hasattr(result, "model_dump") else result
            else:
                row.result_payload = None
            row.trace_payload = asdict(trace) if trace else None
            row.finished_at = utc_now()
            row.current_stage = "failed"
            row.lease_expires_at = None
            session.commit()
        self.append_event(run_id, "run_failed", {"message": error.message})
        return self.get_run(run_id)

    def append_event(self, run_id: str, event_type: str, payload: dict) -> None:
        with self.session_factory() as session:
            _require_row(session, run_id)
            session.add(
                RunEventRow(run_id=run_id, event_type=event_type, payload=payload)
            )
            session.commit()

    def count_active_runs_for_user(self, user_id: str) -> int:
        with self.session_factory() as session:
            return session.query(func.count(RunRow.id)).filter(
                RunRow.user_id == user_id,
                RunRow.status.in_(["queued", "running"]),
            ).scalar()

    def count_global_active_runs(self) -> int:
        with self.session_factory() as session:
            return session.query(func.count(RunRow.id)).filter(
                RunRow.status.in_(["queued", "running"]),
            ).scalar()

    def count_queued_ahead(self, run_id: str) -> int:
        with self.session_factory() as session:
            row = session.get(RunRow, run_id)
            if row is None or row.status not in {"queued", "running"}:
                return 0
            if row.status == "running":
                return 0
            return session.query(func.count(RunRow.id)).filter(
                RunRow.status == "queued",
                RunRow.created_at < row.created_at,
            ).scalar()

    def list_runs_for_user(self, user_id: str) -> list[RunRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(RunRow)
                .filter(RunRow.user_id == user_id)
                .order_by(RunRow.created_at.desc())
                .all()
            )
            return [_record_from_row(row) for row in rows]

    def list_all_runs(self, limit: int = 50, offset: int = 0) -> list[RunRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(RunRow)
                .order_by(RunRow.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_record_from_row(row) for row in rows]

    def mark_saved(self, run_id: str) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.saved = True
            session.commit()
        return self.get_run(run_id)

    def mark_unsaved(self, run_id: str) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.saved = False
            session.commit()
        return self.get_run(run_id)

    def mark_needs_input(
        self, run_id: str, *, unresolved: dict, trace: RunTrace | None = None,
    ) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "needs_input"
            row.unresolved_payload = unresolved
            row.trace_payload = asdict(trace) if trace else None
            row.finished_at = utc_now()
            row.current_stage = "clarify"
            row.lease_expires_at = None
            session.commit()
        self.append_event(run_id, "run_needs_input", {})
        return self.get_run(run_id)

    def list_saved_runs_for_user(self, user_id: str) -> list[RunRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(RunRow)
                .filter(RunRow.user_id == user_id, RunRow.saved == True, RunRow.status == "succeeded")
                .order_by(RunRow.created_at.desc())
                .all()
            )
            return [_record_from_row(row) for row in rows]

    def count_runs_since(self, since: datetime) -> int:
        with self.session_factory() as session:
            return session.query(func.count(RunRow.id)).filter(
                RunRow.created_at >= since,
            ).scalar()

    def count_all_runs(self) -> int:
        with self.session_factory() as session:
            return session.query(func.count(RunRow.id)).scalar()

    def count_runs_by_status(self, status: str) -> int:
        with self.session_factory() as session:
            return session.query(func.count(RunRow.id)).filter(RunRow.status == status).scalar()

    def list_failed_runs(self, limit: int = 20) -> list[RunRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(RunRow)
                .filter(RunRow.status == "failed")
                .order_by(RunRow.created_at.desc())
                .limit(limit)
                .all()
            )
            return [_record_from_row(row) for row in rows]

    def save_feedback(self, *, run_id: str, user_id: str, rating: str, reason: str = "") -> None:
        with self.session_factory() as session:
            _require_row(session, run_id)
            session.add(RunFeedbackRow(run_id=run_id, user_id=user_id, rating=rating, reason=reason))
            session.commit()

    def list_feedback(self, limit: int = 50, offset: int = 0) -> tuple[list[RunFeedbackRecord], int]:
        with self.session_factory() as session:
            total = session.query(func.count(RunFeedbackRow.id)).scalar()
            rows = (
                session.query(RunFeedbackRow)
                .order_by(RunFeedbackRow.created_at.desc(), RunFeedbackRow.id.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [
                RunFeedbackRecord(
                    id=row.id,
                    run_id=row.run_id,
                    user_id=row.user_id,
                    rating=row.rating,
                    reason=row.reason,
                    created_at=row.created_at,
                )
                for row in rows
            ], total


def _require_row(session: Session, run_id: str) -> RunRow:
    row = session.get(RunRow, run_id)
    if row is None:
        raise KeyError(f"Unknown run_id: {run_id}")
    return row


def _record_from_row(row: RunRow) -> RunRecord:
    return RunRecord(
        id=row.id,
        user_id=row.user_id,
        status=row.status,
        input_payload=row.input_payload,
        original_meal_pack=meal_pack_from_dict(row.original_meal_pack),
        result=RunResultPayload(**row.result_payload) if row.result_payload else None,
        error=PublicRunError(**row.error_payload) if row.error_payload else None,
        trace=run_trace_from_dict(row.trace_payload),
        unresolved_payload=row.unresolved_payload,
        saved=row.saved,
        created_at=row.created_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
        workflow_version=getattr(row, "workflow_version", "v1"),
        current_stage=getattr(row, "current_stage", row.status),
        attempt_count=getattr(row, "attempt_count", 0),
        lease_expires_at=getattr(row, "lease_expires_at", None),
        input_hash=getattr(row, "input_hash", ""),
        checkpoint_payload=getattr(row, "checkpoint_payload", None),
    )
