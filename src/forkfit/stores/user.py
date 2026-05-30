from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from forkfit.db.models import UserRow


@dataclass(frozen=True, slots=True)
class UserRecord:
    id: str
    username: str
    display_name: str
    avatar_url: str | None
    role: str
    created_at: datetime


class UserStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def create_user(
        self,
        username: str,
        password_hash: str,
        display_name: str,
        avatar_url: str | None = None,
    ) -> UserRecord:
        user_id = f"usr_{uuid4().hex[:12]}"
        with self._session_factory() as session:
            row = UserRow(
                id=user_id,
                username=username,
                password_hash=password_hash,
                display_name=display_name,
                avatar_url=avatar_url,
            )
            session.add(row)
            session.commit()
            return UserRecord(
                id=row.id,
                username=row.username,
                display_name=row.display_name,
                avatar_url=row.avatar_url,
                role=row.role,
                created_at=row.created_at,
            )

    def get_user_by_username(self, username: str) -> UserRecord | None:
        with self._session_factory() as session:
            row = session.execute(
                select(UserRow).where(UserRow.username == username)
            ).scalar_one_or_none()
            if not row:
                return None
            return UserRecord(
                id=row.id,
                username=row.username,
                display_name=row.display_name,
                avatar_url=row.avatar_url,
                role=row.role,
                created_at=row.created_at,
            )

    def get_user_by_id(self, user_id: str) -> UserRecord | None:
        with self._session_factory() as session:
            row = session.get(UserRow, user_id)
            if not row:
                return None
            return UserRecord(
                id=row.id,
                username=row.username,
                display_name=row.display_name,
                avatar_url=row.avatar_url,
                role=row.role,
                created_at=row.created_at,
            )

    def get_password_hash(self, user_id: str) -> str | None:
        with self._session_factory() as session:
            row = session.get(UserRow, user_id)
            return row.password_hash if row else None

    def get_password_hash_by_username(self, username: str) -> tuple[str, str] | None:
        """Returns (user_id, password_hash) or None."""
        with self._session_factory() as session:
            row = session.execute(
                select(UserRow).where(UserRow.username == username)
            ).scalar_one_or_none()
            if not row:
                return None
            return (row.id, row.password_hash)

    def list_users(self, limit: int = 50, offset: int = 0) -> tuple[list[UserRecord], int]:
        with self._session_factory() as session:
            total = session.scalar(select(func.count(UserRow.id)))
            rows = session.execute(
                select(UserRow).order_by(UserRow.created_at.desc()).offset(offset).limit(limit)
            ).scalars().all()
            return (
                [UserRecord(id=r.id, username=r.username, display_name=r.display_name,
                            avatar_url=r.avatar_url, role=r.role, created_at=r.created_at) for r in rows],
                total,
            )

    def get_user_count(self) -> int:
        with self._session_factory() as session:
            return session.scalar(select(func.count(UserRow.id)))

    def update_user(self, user_id: str, **fields: str | None) -> UserRecord | None:
        with self._session_factory() as session:
            row = session.get(UserRow, user_id)
            if not row:
                return None
            for k, v in fields.items():
                if hasattr(row, k) and v is not None:
                    setattr(row, k, v)
            session.commit()
            session.refresh(row)
            return UserRecord(id=row.id, username=row.username, display_name=row.display_name,
                              avatar_url=row.avatar_url, role=row.role, created_at=row.created_at)

    def delete_user(self, user_id: str) -> bool:
        with self._session_factory() as session:
            row = session.get(UserRow, user_id)
            if not row:
                return False
            session.delete(row)
            session.commit()
            return True

    def has_admin(self) -> bool:
        with self._session_factory() as session:
            return session.scalar(select(func.count(UserRow.id)).where(UserRow.role == "admin")) > 0

    def set_role(self, user_id: str, role: str) -> bool:
        with self._session_factory() as session:
            row = session.get(UserRow, user_id)
            if not row:
                return False
            row.role = role
            session.commit()
            return True
