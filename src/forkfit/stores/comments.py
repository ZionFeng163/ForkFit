from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from forkfit.db.models import CommentRow


@dataclass(frozen=True, slots=True)
class CommentRecord:
    id: str
    post_id: str
    user_id: str
    username: str
    display_name: str
    avatar_url: str | None
    content: str
    created_at: datetime


class CommentStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def list_comments(self, post_id: str, limit: int = 50, offset: int = 0) -> tuple[list[CommentRecord], int]:
        with self._session_factory() as session:
            total = session.scalar(
                select(func.count(CommentRow.id)).where(CommentRow.post_id == post_id)
            )
            rows = (
                session.query(CommentRow)
                .filter(CommentRow.post_id == post_id)
                .order_by(CommentRow.created_at.asc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            # Batch load users
            from forkfit.db.models import UserRow
            user_ids = list({r.user_id for r in rows})
            users_map: dict[str, tuple[str, str, str | None]] = {}
            if user_ids:
                user_rows = session.query(UserRow).filter(UserRow.id.in_(user_ids)).all()
                users_map = {u.id: (u.username, u.display_name, u.avatar_url) for u in user_rows}
            return [self._to_record(row, users_map) for row in rows], total

    def get_comment_count(self, post_id: str) -> int:
        with self._session_factory() as session:
            return session.scalar(
                select(func.count(CommentRow.id)).where(CommentRow.post_id == post_id)
            )

    def get_comment_counts(self, post_ids: list[str]) -> dict[str, int]:
        if not post_ids:
            return {}
        with self._session_factory() as session:
            rows = (
                session.query(CommentRow.post_id, func.count(CommentRow.id))
                .filter(CommentRow.post_id.in_(post_ids))
                .group_by(CommentRow.post_id)
                .all()
            )
            return {pid: cnt for pid, cnt in rows}

    def list_comments_by_user(self, user_id: str, limit: int = 50, offset: int = 0) -> tuple[list[CommentRecord], int]:
        with self._session_factory() as session:
            total = session.scalar(
                select(func.count(CommentRow.id)).where(CommentRow.user_id == user_id)
            )
            rows = (
                session.query(CommentRow)
                .filter(CommentRow.user_id == user_id)
                .order_by(CommentRow.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            from forkfit.db.models import UserRow
            user_rows = session.query(UserRow).filter(UserRow.id == user_id).all()
            users_map = {u.id: (u.username, u.display_name, u.avatar_url) for u in user_rows}
            return [self._to_record(row, users_map) for row in rows], total

    def create_comment(self, post_id: str, user_id: str, username: str, display_name: str, avatar_url: str | None, content: str) -> CommentRecord:
        comment_id = f"cmt_{uuid4().hex[:12]}"
        with self._session_factory() as session:
            row = CommentRow(
                id=comment_id,
                post_id=post_id,
                user_id=user_id,
                content=content.strip(),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return CommentRecord(
                id=row.id,
                post_id=row.post_id,
                user_id=row.user_id,
                username=username,
                display_name=display_name,
                avatar_url=avatar_url,
                content=row.content,
                created_at=row.created_at,
            )

    def delete_comment(self, comment_id: str, user_id: str) -> bool:
        with self._session_factory() as session:
            row = session.get(CommentRow, comment_id)
            if not row or row.user_id != user_id:
                return False
            session.delete(row)
            session.commit()
            return True

    def admin_delete_comment(self, comment_id: str) -> bool:
        with self._session_factory() as session:
            row = session.get(CommentRow, comment_id)
            if not row:
                return False
            session.delete(row)
            session.commit()
            return True

    def _to_record(self, row: CommentRow, users: dict[str, tuple[str, str, str | None]] | None = None) -> CommentRecord:
        username, display_name, avatar_url = "unknown", "Unknown", None
        if users and row.user_id in users:
            username, display_name, avatar_url = users[row.user_id]
        elif not users:
            from forkfit.stores.user import UserStore
            user_store = UserStore(self._session_factory)
            user = user_store.get_user_by_id(row.user_id)
            if user:
                username, display_name, avatar_url = user.username, user.display_name, user.avatar_url
        return CommentRecord(
            id=row.id, post_id=row.post_id, user_id=row.user_id,
            username=username, display_name=display_name, avatar_url=avatar_url,
            content=row.content, created_at=row.created_at,
        )
