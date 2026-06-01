from __future__ import annotations

import re
from dataclasses import asdict
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, or_, select, String, cast, text
from sqlalchemy.dialects.postgresql import insert, JSONB
from sqlalchemy.orm import Session, sessionmaker

from forkfit.api.schemas import CreatePostRequest, UpdatePostRequest
from forkfit.db.models import PostLikeRow, PostRow, PostSaveRow
from forkfit.models import Meal
from forkfit.preset_posts import PRESET_POSTS
from forkfit.serialization import meal_from_dict


@dataclass(frozen=True, slots=True)
class PostRecord:
    id: str
    user_id: str
    author: str
    title: str
    theme: str
    location: str
    image_urls: list[str]
    description: str
    recipe: Meal
    saves: int
    forks: int
    created_at: datetime


class PostgresPostStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def list_posts(self, limit: int = 20, offset: int = 0, search: str = "", tag: str = "") -> tuple[list[PostRecord], int]:
        self.ensure_preset_posts()
        with self.session_factory() as session:
            q = session.query(PostRow)
            if search:
                pattern = f"%{search}%"
                q = q.filter(or_(
                    PostRow.title.ilike(pattern),
                    PostRow.description.ilike(pattern),
                ))
            if tag:
                # Filter by tag in Python due to JSON Unicode escape issues
                all_rows = q.order_by(PostRow.created_at.desc(), PostRow.id.desc()).all()
                rows = [r for r in all_rows if tag in (r.recipe_payload.get("tags") or [])]
                total = len(rows)
                rows = rows[offset:offset + limit]
            else:
                total = q.count()
                rows = (
                    q.order_by(PostRow.created_at.desc(), PostRow.id.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )
            return [_record_from_row(row) for row in rows], total

    def list_tags(self) -> list[str]:
        with self.session_factory() as session:
            rows = session.query(PostRow.recipe_payload).all()
            tags = set()
            for (payload,) in rows:
                if isinstance(payload, dict):
                    for t in payload.get("tags", []):
                        if isinstance(t, str) and t.strip():
                            tags.add(t.strip())
            return sorted(tags)

    def get_post(self, post_id: str) -> PostRecord | None:
        self.ensure_preset_posts()
        with self.session_factory() as session:
            row = session.get(PostRow, post_id)
            return _record_from_row(row) if row else None

    def create_post(
        self, *, user_id: str, author: str, request: CreatePostRequest
    ) -> PostRecord:
        post_id = _make_post_id(request.title)
        with self.session_factory() as session:
            row = PostRow(
                id=post_id,
                user_id=user_id,
                author=author,
                title=request.title.strip(),
                theme=request.theme.strip(),
                location=request.location.strip(),
                image_urls=[url.strip() for url in request.image_urls if url.strip()],
                description=request.description.strip(),
                recipe_payload=asdict(request.recipe),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return _record_from_row(row)

    def update_post(self, *, post_id: str, request: UpdatePostRequest) -> PostRecord:
        with self.session_factory() as session:
            row = session.get(PostRow, post_id)
            if row is None:
                raise KeyError(f"Unknown post_id: {post_id}")
            row.title = request.title.strip()
            row.theme = request.theme.strip()
            row.location = request.location.strip()
            row.image_urls = [url.strip() for url in request.image_urls if url.strip()]
            row.description = request.description.strip()
            row.recipe_payload = asdict(request.recipe)
            session.commit()
            session.refresh(row)
            return _record_from_row(row)

    def delete_post(self, post_id: str) -> None:
        with self.session_factory() as session:
            row = session.get(PostRow, post_id)
            if row is None:
                raise KeyError(f"Unknown post_id: {post_id}")
            session.delete(row)
            session.commit()

    def toggle_like(self, user_id: str, post_id: str) -> tuple[bool, int]:
        """Toggle like. Returns (liked, new_saves_count)."""
        with self.session_factory() as session:
            existing = session.get(PostLikeRow, (user_id, post_id))
            post = session.get(PostRow, post_id)
            if not post:
                raise KeyError(f"Unknown post_id: {post_id}")
            if existing:
                session.delete(existing)
                session.commit()
                return False, post.saves
            else:
                session.add(PostLikeRow(user_id=user_id, post_id=post_id))
                session.commit()
                return True, post.saves

    def toggle_save(self, user_id: str, post_id: str) -> tuple[bool, int]:
        """Toggle bookmark. Returns (saved, new_saves_count)."""
        with self.session_factory() as session:
            existing = session.get(PostSaveRow, (user_id, post_id))
            post = session.get(PostRow, post_id)
            if not post:
                raise KeyError(f"Unknown post_id: {post_id}")
            if existing:
                session.delete(existing)
                session.commit()
                return False, post.saves
            else:
                session.add(PostSaveRow(user_id=user_id, post_id=post_id))
                session.commit()
                return True, post.saves

    def get_user_interactions(self, user_id: str, post_ids: list[str]) -> dict[str, tuple[bool, bool]]:
        """Returns {post_id: (liked, saved)} for given posts."""
        if not post_ids:
            return {}
        with self.session_factory() as session:
            likes = set(
                session.execute(
                    select(PostLikeRow.post_id).where(
                        PostLikeRow.user_id == user_id,
                        PostLikeRow.post_id.in_(post_ids),
                    )
                ).scalars()
            )
            saves = set(
                session.execute(
                    select(PostSaveRow.post_id).where(
                        PostSaveRow.user_id == user_id,
                        PostSaveRow.post_id.in_(post_ids),
                    )
                ).scalars()
            )
            return {pid: (pid in likes, pid in saves) for pid in post_ids}

    def list_posts_by_user(self, user_id: str, limit: int = 20, offset: int = 0) -> tuple[list[PostRecord], int]:
        with self.session_factory() as session:
            total = session.scalar(
                select(func.count(PostRow.id)).where(PostRow.user_id == user_id)
            )
            rows = (
                session.query(PostRow)
                .filter(PostRow.user_id == user_id)
                .order_by(PostRow.created_at.desc(), PostRow.id.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_record_from_row(row) for row in rows], total

    def list_liked_posts(self, user_id: str, limit: int = 20, offset: int = 0) -> tuple[list[PostRecord], int]:
        with self.session_factory() as session:
            total = session.scalar(
                select(func.count(PostLikeRow.post_id)).where(PostLikeRow.user_id == user_id)
            )
            rows = (
                session.query(PostRow)
                .join(PostLikeRow, PostRow.id == PostLikeRow.post_id)
                .filter(PostLikeRow.user_id == user_id)
                .order_by(PostLikeRow.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_record_from_row(row) for row in rows], total

    def list_saved_posts(self, user_id: str, limit: int = 20, offset: int = 0) -> tuple[list[PostRecord], int]:
        with self.session_factory() as session:
            total = session.scalar(
                select(func.count(PostSaveRow.post_id)).where(PostSaveRow.user_id == user_id)
            )
            rows = (
                session.query(PostRow)
                .join(PostSaveRow, PostRow.id == PostSaveRow.post_id)
                .filter(PostSaveRow.user_id == user_id)
                .order_by(PostSaveRow.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_record_from_row(row) for row in rows], total

    def ensure_preset_posts(self) -> None:
        with self.session_factory() as session:
            for post in PRESET_POSTS:
                statement = (
                    insert(PostRow)
                    .values(
                        id=post["id"],
                        user_id=post["user_id"],
                        author=post["author"],
                        title=post["title"],
                        theme=post["theme"],
                        location=post["location"],
                        image_urls=post["image_urls"],
                        description=post["description"],
                        recipe_payload=asdict(post["recipe"]),
                        saves=post["saves"],
                        forks=post["forks"],
                    )
                    .on_conflict_do_nothing(index_elements=[PostRow.id])
                )
                session.execute(statement)
            session.commit()


def _make_post_id(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = slug[:72].strip("-") or "recipe"
    return f"{slug}-{uuid4().hex[:8]}"


def _record_from_row(row: PostRow) -> PostRecord:
    return PostRecord(
        id=row.id,
        user_id=row.user_id,
        author=row.author,
        title=row.title,
        theme=row.theme,
        location=row.location,
        image_urls=list(row.image_urls),
        description=row.description,
        recipe=meal_from_dict(row.recipe_payload),
        saves=row.saves,
        forks=row.forks,
        created_at=row.created_at,
    )
