from __future__ import annotations

import re
from dataclasses import asdict
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from forkfit.api.schemas import CreatePostRequest
from forkfit.db.models import PostRow
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

    def list_posts(self) -> list[PostRecord]:
        self.ensure_preset_posts()
        with self.session_factory() as session:
            rows = (
                session.query(PostRow)
                .order_by(PostRow.created_at.desc(), PostRow.id.desc())
                .all()
            )
            return [_record_from_row(row) for row in rows]

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
