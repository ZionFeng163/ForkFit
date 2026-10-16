from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from forkfit.db.models import AdminAuditLogRow, FeedbackRow


class FeedbackStore:
    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def create(self, user_id: str, request_id: UUID, category: str, content: str) -> FeedbackRow:
        feedback_id = f"fb_{uuid5(NAMESPACE_URL, f'{user_id}:{request_id}').hex}"
        with self._session_factory() as session:
            session.execute(insert(FeedbackRow).values(
                id=feedback_id, user_id=user_id, category=category, content=content,
            ).on_conflict_do_nothing(index_elements=[FeedbackRow.id]))
            row = session.get(FeedbackRow, feedback_id)
            if row.category != category or row.content != content:
                raise ValueError("Request ID already used for a different submission")
            session.commit()
            return row

    def list(self, *, user_id: str | None = None, status: str | None = None, limit: int = 20, offset: int = 0):
        filters = []
        if user_id is not None:
            filters.append(FeedbackRow.user_id == user_id)
        if status is not None:
            filters.append(FeedbackRow.status == status)
        with self._session_factory() as session:
            total = session.scalar(select(func.count()).select_from(FeedbackRow).where(*filters))
            rows = session.scalars(select(FeedbackRow).where(*filters).order_by(
                FeedbackRow.created_at.desc(), FeedbackRow.id.desc(),
            ).offset(offset).limit(limit)).all()
            return rows, total

    def update(self, feedback_id: str, *, admin_id: str, status: str, reply: str) -> FeedbackRow | None:
        with self._session_factory() as session:
            row = session.scalar(select(FeedbackRow).where(FeedbackRow.id == feedback_id).with_for_update())
            if row is None:
                return None
            row.status = status
            row.reply = reply
            row.updated_at = datetime.now(timezone.utc)
            session.add(AdminAuditLogRow(
                admin_user_id=admin_id, action="update_feedback", target_type="feedback",
                target_id=row.id, payload={"status": status, "has_reply": bool(reply)},
            ))
            session.commit()
            return row
