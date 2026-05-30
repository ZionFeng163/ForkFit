from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

from forkfit.api.schemas import PublicRunError, RunResultPayload
from forkfit.db.models import RunEventRow, RunRow
from forkfit.models import MealPack, RunTrace
from forkfit.serialization import meal_pack_from_dict, run_trace_from_dict
from forkfit.stores.base import RunRecord, utc_now


class PostgresRunStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def create_run(
        self, *, user_id: str, input_payload: dict, original_meal_pack: MealPack
    ) -> RunRecord:
        run_id = f"run_{uuid4().hex}"
        with self.session_factory() as session:
            row = RunRow(
                id=run_id,
                user_id=user_id,
                status="queued",
                input_payload=input_payload,
                original_meal_pack=original_meal_pack.to_dict(),
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
            events = [
                {
                    "type": event.event_type,
                    "payload": event.payload,
                    "created_at": event.created_at.isoformat(),
                }
                for event in session.query(RunEventRow)
                .filter(RunEventRow.run_id == run_id)
                .order_by(RunEventRow.id)
                .all()
            ]
            return _record_from_row(row, events)

    def mark_running(self, run_id: str) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "running"
            row.started_at = utc_now()
            session.commit()
        self.append_event(run_id, "run_started", {})
        return self.get_run(run_id)

    def mark_succeeded(
        self, run_id: str, *, result: RunResultPayload, trace: RunTrace | None
    ) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "succeeded"
            row.result_payload = result.model_dump(mode="json")
            row.trace_payload = asdict(trace) if trace else None
            row.finished_at = utc_now()
            session.commit()
        self.append_event(run_id, "run_succeeded", {})
        return self.get_run(run_id)

    def mark_failed(
        self, run_id: str, *, error: PublicRunError, trace: RunTrace | None = None
    ) -> RunRecord:
        with self.session_factory() as session:
            row = _require_row(session, run_id)
            row.status = "failed"
            row.error_payload = error.model_dump(mode="json")
            row.trace_payload = asdict(trace) if trace else None
            row.finished_at = utc_now()
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

    def list_runs_for_user(self, user_id: str) -> list[RunRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(RunRow)
                .filter(RunRow.user_id == user_id)
                .order_by(RunRow.created_at.desc())
                .all()
            )
            return [_record_from_row(row, []) for row in rows]

    def list_all_runs(self, limit: int = 50, offset: int = 0) -> list[RunRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(RunRow)
                .order_by(RunRow.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_record_from_row(row, []) for row in rows]


def _require_row(session: Session, run_id: str) -> RunRow:
    row = session.get(RunRow, run_id)
    if row is None:
        raise KeyError(f"Unknown run_id: {run_id}")
    return row


def _record_from_row(row: RunRow, events: list[dict]) -> RunRecord:
    return RunRecord(
        id=row.id,
        user_id=row.user_id,
        status=row.status,
        input_payload=row.input_payload,
        original_meal_pack=meal_pack_from_dict(row.original_meal_pack),
        result=RunResultPayload(**row.result_payload) if row.result_payload else None,
        error=PublicRunError(**row.error_payload) if row.error_payload else None,
        trace=run_trace_from_dict(row.trace_payload),
        events=events,
        created_at=row.created_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )
