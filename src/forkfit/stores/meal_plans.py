from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

from forkfit.api.schemas import PublicRunError, RunStatus
from forkfit.db.models import MealPlanMessageRow, MealPlanRow, MealPlanVersionRow
from forkfit.meal_planner import MealPlanResult
from forkfit.stores.base import utc_now


@dataclass(frozen=True, slots=True)
class MealPlanRecord:
    id: str
    user_id: str
    status: RunStatus
    mode: str
    request_payload: dict
    result: MealPlanResult | None
    error: PublicRunError | None
    current_stage: str
    progress: int
    workflow_version: str
    attempt_count: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    current_version_id: str | None
    locked_days: list[int]
    last_change_summary: str
    pending_message_id: str | None
    pending_change: dict | None


@dataclass(frozen=True, slots=True)
class MealPlanVersionRecord:
    id: str
    plan_id: str
    parent_version_id: str | None
    request_text: str
    patch_payload: dict | None
    result: MealPlanResult
    quality_report: dict | None
    created_by: str
    is_current: bool
    created_at: datetime


@dataclass(frozen=True, slots=True)
class MealPlanMessageRecord:
    id: str
    plan_id: str
    user_id: str
    base_version_id: str | None
    version_id: str | None
    role: str
    content: str
    intent: str
    status: str
    confirmed: bool
    response_payload: dict | None
    patch_payload: dict | None
    error: PublicRunError | None
    created_at: datetime
    processed_at: datetime | None


class PostgresMealPlanStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def create_plan(
        self,
        *,
        user_id: str,
        request_payload: dict,
        mode: str,
        workflow_version: str,
    ) -> MealPlanRecord:
        plan_id = f"plan_{uuid4().hex}"
        with self.session_factory() as session:
            session.add(
                MealPlanRow(
                    id=plan_id,
                    user_id=user_id,
                    status="queued",
                    mode=mode,
                    request_payload=request_payload,
                    current_stage="queued",
                    progress=0,
                    workflow_version=workflow_version,
                )
            )
            session.commit()
        record = self.get_plan(plan_id)
        if record is None:
            raise RuntimeError("Meal plan was not persisted.")
        return record

    def get_plan(self, plan_id: str) -> MealPlanRecord | None:
        with self.session_factory() as session:
            row = session.get(MealPlanRow, plan_id)
            if row:
                _attach_pending_message(session, row)
            return _record_from_row(row) if row else None

    def list_plans_for_user(self, user_id: str) -> list[MealPlanRecord]:
        with self.session_factory() as session:
            rows = (
                session.query(MealPlanRow)
                .filter(MealPlanRow.user_id == user_id)
                .order_by(MealPlanRow.created_at.desc(), MealPlanRow.id.desc())
                .all()
            )
            for row in rows:
                _attach_pending_message(session, row)
            return [_record_from_row(row) for row in rows]

    def count_active_for_user(self, user_id: str) -> int:
        with self.session_factory() as session:
            return int(
                session.query(func.count(MealPlanRow.id))
                .filter(
                    MealPlanRow.user_id == user_id,
                    MealPlanRow.status.in_(["queued", "running"]),
                )
                .scalar()
                or 0
            )

    def claim_next_plan(self, lease_seconds: int = 300) -> MealPlanRecord | None:
        plan_id: str | None = None
        with self.session_factory() as session:
            row = (
                session.query(MealPlanRow)
                .filter(MealPlanRow.status == "queued")
                .order_by(MealPlanRow.created_at.asc(), MealPlanRow.id.asc())
                .with_for_update(skip_locked=True)
                .first()
            )
            if row is None:
                return None
            row.status = "running"
            row.current_stage = "starting"
            row.progress = 2
            row.started_at = row.started_at or utc_now()
            row.finished_at = None
            row.attempt_count += 1
            row.lease_expires_at = utc_now() + timedelta(seconds=lease_seconds)
            plan_id = row.id
            session.commit()
        return self.get_plan(plan_id)

    def update_stage(
        self,
        plan_id: str,
        *,
        stage: str,
        progress: int,
        lease_seconds: int = 300,
    ) -> None:
        with self.session_factory() as session:
            row = _require_row(session, plan_id)
            row.current_stage = stage
            row.progress = max(0, min(99, progress))
            if row.status == "running":
                row.lease_expires_at = utc_now() + timedelta(seconds=lease_seconds)
            session.commit()

    def mark_succeeded(
        self, plan_id: str, result: MealPlanResult
    ) -> MealPlanRecord:
        with self.session_factory() as session:
            row = _require_row(session, plan_id)
            row.status = "succeeded"
            row.mode = result.mode
            row.result_payload = result.model_dump(mode="json")
            row.error_payload = None
            row.current_stage = "completed"
            row.progress = 100
            row.finished_at = utc_now()
            row.lease_expires_at = None
            if not row.current_version_id:
                version_id = f"version_{uuid4().hex}"
                session.add(
                    MealPlanVersionRow(
                        id=version_id,
                        plan_id=plan_id,
                        request_text=str(row.request_payload.get("request_text", "")),
                        result_payload=result.model_dump(mode="json"),
                        created_by=row.user_id,
                        is_current=True,
                    )
                )
                row.current_version_id = version_id
            row.last_change_summary = "已生成第一版菜单。"
            session.commit()
        record = self.get_plan(plan_id)
        if record is None:
            raise RuntimeError("Meal plan disappeared after completion.")
        return record

    def mark_failed(self, plan_id: str, message: str) -> MealPlanRecord:
        return self._finish_with_error(plan_id, "failed", message, "failed")

    def mark_needs_input(
        self, plan_id: str, message: str, issues: list[str]
    ) -> MealPlanRecord:
        return self._finish_with_error(
            plan_id,
            "needs_input",
            message,
            "needs_input",
            issues=issues,
        )

    def requeue_failed_plan(self, plan_id: str) -> MealPlanRecord:
        with self.session_factory() as session:
            row = _require_row(session, plan_id)
            if row.status != "failed":
                raise ValueError("Only failed meal plans can be retried.")
            row.status = "queued"
            row.confirmed = True
            row.result_payload = None
            row.error_payload = None
            row.current_stage = "queued"
            row.progress = 0
            row.finished_at = None
            row.lease_expires_at = None
            session.commit()
        record = self.get_plan(plan_id)
        if record is None:
            raise RuntimeError("Meal plan disappeared while retrying.")
        return record

    def _finish_with_error(
        self,
        plan_id: str,
        status: str,
        message: str,
        stage: str,
        *,
        issues: list[str] | None = None,
    ) -> MealPlanRecord:
        with self.session_factory() as session:
            row = _require_row(session, plan_id)
            row.status = status
            row.error_payload = {
                "message": message,
                **({"issues": issues} if issues else {}),
            }
            row.current_stage = stage
            row.finished_at = utc_now()
            row.lease_expires_at = None
            session.commit()
        record = self.get_plan(plan_id)
        if record is None:
            raise RuntimeError("Meal plan disappeared after failure.")
        return record

    def requeue_expired_plans(self) -> int:
        now = utc_now()
        recovered = 0
        with self.session_factory() as session:
            rows = (
                session.query(MealPlanRow)
                .filter(
                    MealPlanRow.status == "running",
                    MealPlanRow.lease_expires_at.is_not(None),
                    MealPlanRow.lease_expires_at < now,
                )
                .all()
            )
            for row in rows:
                row.status = "queued"
                row.current_stage = "queued"
                row.progress = 0
                row.lease_expires_at = None
                recovered += 1
            session.commit()
        return recovered

    def create_message(
        self,
        *,
        plan_id: str,
        user_id: str,
        content: str,
        base_version_id: str | None,
        locale: str,
    ) -> MealPlanMessageRecord:
        del locale
        message_id = f"message_{uuid4().hex}"
        with self.session_factory() as session:
            plan = (
                session.query(MealPlanRow)
                .filter(MealPlanRow.id == plan_id)
                .with_for_update()
                .one_or_none()
            )
            if plan is None or plan.user_id != user_id:
                raise KeyError("Meal plan not found.")
            if plan.status != "succeeded" or not plan.result_payload:
                raise ValueError("这份菜单还没有生成完成。")
            pending = (
                session.query(MealPlanMessageRow.id)
                .filter(
                    MealPlanMessageRow.plan_id == plan_id,
                    MealPlanMessageRow.status.in_(["queued", "processing", "needs_confirmation"]),
                )
                .first()
            )
            if pending is not None:
                raise ValueError("上一条菜单修改还在处理中，请稍候。")
            session.query(MealPlanMessageRow).filter(
                MealPlanMessageRow.plan_id == plan_id,
                MealPlanMessageRow.status == "needs_clarification",
            ).update(
                {
                    MealPlanMessageRow.status: "rejected",
                    MealPlanMessageRow.processed_at: utc_now(),
                }
            )
            if not plan.current_version_id:
                plan.current_version_id = f"version_{uuid4().hex}"
                session.add(
                    MealPlanVersionRow(
                        id=plan.current_version_id,
                        plan_id=plan_id,
                        request_text=str(plan.request_payload.get("request_text", "")),
                        result_payload=plan.result_payload,
                        created_by=user_id,
                        is_current=True,
                    )
                )
            current_version = base_version_id or plan.current_version_id
            if current_version != plan.current_version_id:
                raise ValueError("这份菜单已经更新，请刷新后再修改。")
            session.add(
                MealPlanMessageRow(
                    id=message_id,
                    plan_id=plan_id,
                    user_id=user_id,
                    base_version_id=current_version,
                    role="user",
                    content=content.strip(),
                    status="queued",
                )
            )
            session.commit()
        message = self.get_message(message_id)
        if message is None:
            raise RuntimeError("Conversation message was not persisted.")
        return message

    def get_message(self, message_id: str) -> MealPlanMessageRecord | None:
        with self.session_factory() as session:
            row = session.get(MealPlanMessageRow, message_id)
            return _message_from_row(row) if row else None

    def list_messages(self, plan_id: str, user_id: str) -> list[MealPlanMessageRecord]:
        with self.session_factory() as session:
            plan = session.get(MealPlanRow, plan_id)
            if plan is None or plan.user_id != user_id:
                raise KeyError("Meal plan not found.")
            rows = (
                session.query(MealPlanMessageRow)
                .filter(MealPlanMessageRow.plan_id == plan_id)
                .order_by(MealPlanMessageRow.created_at.asc(), MealPlanMessageRow.id.asc())
                .all()
            )
            return [_message_from_row(row) for row in rows]

    def claim_next_message(self, lease_seconds: int = 300) -> MealPlanMessageRecord | None:
        message_id: str | None = None
        with self.session_factory() as session:
            row = (
                session.query(MealPlanMessageRow)
                .filter(MealPlanMessageRow.status == "queued")
                .order_by(MealPlanMessageRow.created_at.asc(), MealPlanMessageRow.id.asc())
                .with_for_update(skip_locked=True)
                .first()
            )
            if row is None:
                return None
            row.status = "processing"
            row.lease_expires_at = utc_now() + timedelta(seconds=lease_seconds)
            plan = session.get(MealPlanRow, row.plan_id)
            if plan is not None:
                plan.current_stage = "conversation_processing"
                plan.progress = 30
            message_id = row.id
            session.commit()
        return self.get_message(message_id)

    def complete_message(
        self,
        message_id: str,
        *,
        result: MealPlanResult,
        intent: str,
        response: dict,
        patch: dict | None,
        request_text: str,
        created_by: str,
        create_version: bool = True,
        locked_days: list[int] | None = None,
    ) -> MealPlanMessageRecord:
        with self.session_factory() as session:
            message = session.get(MealPlanMessageRow, message_id)
            if message is None:
                raise KeyError("Unknown conversation message.")
            plan = session.get(MealPlanRow, message.plan_id)
            if plan is None or plan.current_version_id != message.base_version_id:
                raise ValueError("这份菜单已经更新，请刷新后再修改。")
            version_id = plan.current_version_id
            if create_version:
                version_id = f"version_{uuid4().hex}"
                if plan.current_version_id:
                    current = session.get(MealPlanVersionRow, plan.current_version_id)
                    if current is not None:
                        current.is_current = False
                session.add(
                    MealPlanVersionRow(
                        id=version_id,
                        plan_id=plan.id,
                        parent_version_id=plan.current_version_id,
                        request_text=request_text,
                        patch_payload=patch,
                        result_payload=result.model_dump(mode="json"),
                        created_by=created_by,
                        is_current=True,
                    )
                )
                plan.current_version_id = version_id
                plan.result_payload = result.model_dump(mode="json")
            if locked_days is not None:
                plan.locked_days = sorted(set(locked_days))
            request_payload = dict(plan.request_payload or {})
            context = str(request_payload.get("conversation_context", "")).strip()
            entry = request_text.strip()
            if entry:
                request_payload["conversation_context"] = (
                    f"{context}\n{entry}".strip()[-6000:]
                )
                plan.request_payload = request_payload
            plan.last_change_summary = str(response.get("summary", "菜单已更新"))[:300]
            plan.current_stage = "completed"
            plan.progress = 100
            message.status = "applied"
            message.intent = intent
            message.version_id = version_id
            message.response_payload = response
            message.patch_payload = patch
            message.lease_expires_at = None
            message.processed_at = utc_now()
            session.add(
                MealPlanMessageRow(
                    id=f"message_{uuid4().hex}",
                    plan_id=plan.id,
                    user_id=created_by,
                    base_version_id=version_id,
                    version_id=version_id,
                    role="assistant",
                    content=str(response.get("message", "菜单已更新")),
                    intent=intent,
                    status="applied",
                    response_payload=response,
                )
            )
            session.commit()
        loaded = self.get_message(message_id)
        if loaded is None:
            raise RuntimeError("Conversation message disappeared after completion.")
        return loaded

    def mark_message_needs_clarification(
        self, message_id: str, *, intent: str, response: dict
    ) -> MealPlanMessageRecord:
        return self._finish_message(message_id, "needs_clarification", intent=intent, response=response)

    def mark_message_needs_confirmation(
        self, message_id: str, *, intent: str, response: dict, patch: dict | None
    ) -> MealPlanMessageRecord:
        return self._finish_message(
            message_id,
            "needs_confirmation",
            intent=intent,
            response=response,
            patch=patch,
        )

    def mark_message_failed(self, message_id: str, message: str) -> MealPlanMessageRecord:
        return self._finish_message(
            message_id,
            "failed",
            response={"message": message, "summary": message},
            error={"message": message},
        )

    def requeue_message(self, message_id: str, user_id: str) -> MealPlanMessageRecord:
        with self.session_factory() as session:
            row = session.get(MealPlanMessageRow, message_id)
            if row is None or row.user_id != user_id:
                raise KeyError("Conversation message not found.")
            if row.status != "needs_confirmation":
                raise ValueError("这条修改当前不能确认。")
            plan = session.get(MealPlanRow, row.plan_id)
            if plan is None or plan.current_version_id != row.base_version_id:
                raise ValueError("这份菜单已经更新，请刷新后再修改。")
            row.status = "queued"
            row.response_payload = None
            row.error_payload = None
            row.lease_expires_at = None
            session.commit()
        loaded = self.get_message(message_id)
        if loaded is None:
            raise RuntimeError("Conversation message disappeared while confirming.")
        return loaded

    def requeue_expired_messages(self) -> int:
        now = utc_now()
        recovered = 0
        with self.session_factory() as session:
            rows = (
                session.query(MealPlanMessageRow)
                .filter(
                    MealPlanMessageRow.status == "processing",
                    MealPlanMessageRow.lease_expires_at.is_not(None),
                    MealPlanMessageRow.lease_expires_at < now,
                )
                .all()
            )
            for row in rows:
                row.status = "queued"
                row.lease_expires_at = None
                recovered += 1
            session.commit()
        return recovered

    def get_previous_result(
        self, plan_id: str, current_version_id: str | None
    ) -> tuple[str, MealPlanResult] | None:
        if not current_version_id:
            return None
        with self.session_factory() as session:
            current = session.get(MealPlanVersionRow, current_version_id)
            if current is None or not current.parent_version_id:
                return None
            parent = session.get(MealPlanVersionRow, current.parent_version_id)
            if parent is None or parent.plan_id != plan_id:
                return None
            return parent.id, MealPlanResult.model_validate(parent.result_payload)

    def set_locked_days(self, plan_id: str, user_id: str, locked_days: list[int]) -> MealPlanRecord:
        with self.session_factory() as session:
            row = session.get(MealPlanRow, plan_id)
            if row is None or row.user_id != user_id:
                raise KeyError("Meal plan not found.")
            row.locked_days = sorted({int(day) for day in locked_days if 1 <= int(day) <= 7})
            session.commit()
        record = self.get_plan(plan_id)
        if record is None:
            raise RuntimeError("Meal plan disappeared while updating locked days.")
        return record

    def _finish_message(
        self,
        message_id: str,
        status: str,
        *,
        intent: str = "",
        response: dict | None = None,
        patch: dict | None = None,
        error: dict | None = None,
    ) -> MealPlanMessageRecord:
        with self.session_factory() as session:
            row = session.get(MealPlanMessageRow, message_id)
            if row is None:
                raise KeyError("Unknown conversation message.")
            row.status = status
            row.intent = intent
            row.response_payload = response
            row.patch_payload = patch
            row.error_payload = error
            row.lease_expires_at = None
            row.processed_at = utc_now()
            session.commit()
        loaded = self.get_message(message_id)
        if loaded is None:
            raise RuntimeError("Conversation message disappeared after update.")
        return loaded

    def restore_version(self, plan_id: str, user_id: str, version_id: str) -> MealPlanRecord:
        with self.session_factory() as session:
            plan = session.get(MealPlanRow, plan_id)
            version = session.get(MealPlanVersionRow, version_id)
            if plan is None or plan.user_id != user_id or version is None or version.plan_id != plan_id:
                raise KeyError("Meal plan version not found.")
            session.query(MealPlanVersionRow).filter(
                MealPlanVersionRow.plan_id == plan_id
            ).update({MealPlanVersionRow.is_current: False})
            version.is_current = True
            plan.current_version_id = version_id
            plan.result_payload = version.result_payload
            plan.last_change_summary = "已恢复之前的菜单版本。"
            session.commit()
        record = self.get_plan(plan_id)
        if record is None:
            raise RuntimeError("Meal plan disappeared after restore.")
        return record


def _record_from_row(row: MealPlanRow) -> MealPlanRecord:
    error = PublicRunError.model_validate(row.error_payload) if row.error_payload else None
    result = MealPlanResult.model_validate(row.result_payload) if row.result_payload else None
    return MealPlanRecord(
        id=row.id,
        user_id=row.user_id,
        status=row.status,
        mode=row.mode,
        request_payload=row.request_payload,
        result=result,
        error=error,
        current_stage=row.current_stage,
        progress=row.progress,
        workflow_version=row.workflow_version,
        attempt_count=row.attempt_count,
        created_at=row.created_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
        current_version_id=getattr(row, "current_version_id", None),
        locked_days=[int(item) for item in (getattr(row, "locked_days", None) or [])],
        last_change_summary=getattr(row, "last_change_summary", "") or "",
        pending_message_id=_pending_message_id(row),
        pending_change=_pending_change(row),
    )


def _pending_message_id(row: MealPlanRow) -> str | None:
    # The record is normally built from a detached row; pending state is filled
    # by the store's lightweight query helper when available.
    return getattr(row, "_pending_message_id", None)


def _pending_change(row: MealPlanRow) -> dict | None:
    return getattr(row, "_pending_change", None)


def _attach_pending_message(session: Session, row: MealPlanRow) -> None:
    pending = (
        session.query(MealPlanMessageRow)
        .filter(
            MealPlanMessageRow.plan_id == row.id,
            MealPlanMessageRow.status.in_(["queued", "processing", "needs_confirmation", "needs_clarification"]),
        )
        .order_by(MealPlanMessageRow.created_at.desc())
        .first()
    )
    if pending is not None:
        row._pending_message_id = pending.id
        row._pending_change = pending.response_payload


def _message_from_row(row: MealPlanMessageRow) -> MealPlanMessageRecord:
    return MealPlanMessageRecord(
        id=row.id,
        plan_id=row.plan_id,
        user_id=row.user_id,
        base_version_id=row.base_version_id,
        version_id=row.version_id,
        role=row.role,
        content=row.content,
        intent=row.intent,
        status=row.status,
        confirmed=row.confirmed,
        response_payload=row.response_payload,
        patch_payload=row.patch_payload,
        error=PublicRunError.model_validate(row.error_payload) if row.error_payload else None,
        created_at=row.created_at,
        processed_at=row.processed_at,
    )


def _require_row(session: Session, plan_id: str) -> MealPlanRow:
    row = session.get(MealPlanRow, plan_id)
    if row is None:
        raise KeyError(f"Unknown meal plan: {plan_id}")
    return row
