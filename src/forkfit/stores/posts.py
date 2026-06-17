from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Literal
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from forkfit.api.schemas import CreatePostRequest, UpdatePostRequest
from forkfit.db.models import PostLikeRow, PostRow, PostSaveRow
from forkfit.models import Meal
from forkfit.preset_posts import PRESET_POSTS
from forkfit.serialization import meal_from_dict


PostStatus = Literal["draft", "published", "hidden"]
PostQuality = Literal["complete", "missing_image", "missing_steps", "incomplete"]
VALID_POST_STATUSES = {"draft", "published", "hidden"}


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
    status: PostStatus
    source_name: str
    source_url: str
    saves: int
    likes: int
    forks: int
    created_at: datetime

    @property
    def has_image(self) -> bool:
        return bool(self.image_urls)

    @property
    def has_steps(self) -> bool:
        return bool(self.recipe.steps)

    @property
    def quality(self) -> PostQuality:
        if self.has_image and self.has_steps:
            return "complete"
        if not self.has_image and not self.has_steps:
            return "incomplete"
        if not self.has_image:
            return "missing_image"
        return "missing_steps"


class PostgresPostStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def list_posts(
        self,
        limit: int = 20,
        offset: int = 0,
        search: str = "",
        tag: str = "",
        *,
        category: str = "",
        status: str = "published",
        quality: str = "complete",
        recommended: bool = False,
    ) -> tuple[list[PostRecord], int]:
        self.ensure_preset_posts()
        with self.session_factory() as session:
            q = session.query(PostRow)
            if status and status != "all":
                if status not in VALID_POST_STATUSES:
                    return [], 0
                q = q.filter(PostRow.status == status)
            if search:
                pattern = f"%{search}%"
                q = q.filter(
                    or_(
                        PostRow.title.ilike(pattern),
                        PostRow.description.ilike(pattern),
                    )
                )

            needs_python_filter = bool(tag or category or quality or recommended)
            if needs_python_filter:
                rows = q.order_by(PostRow.created_at.desc(), PostRow.id.desc()).all()
                records = [_record_from_row(row) for row in rows]
                if tag:
                    records = [record for record in records if _matches_tag(record, tag)]
                if category:
                    records = [
                        record for record in records if _matches_category(record, category)
                    ]
                if quality:
                    records = [
                        record for record in records if _matches_quality(record, quality)
                    ]
                if recommended or category == "推荐":
                    records = sorted(records, key=_recommendation_key, reverse=True)
                total = len(records)
                return records[offset : offset + limit], total

            total = q.count()
            rows = (
                q.order_by(PostRow.created_at.desc(), PostRow.id.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_record_from_row(row) for row in rows], total

    def list_admin_posts(
        self,
        limit: int = 50,
        offset: int = 0,
        search: str = "",
        tag: str = "",
        status: str = "all",
        quality: str = "",
    ) -> tuple[list[PostRecord], int]:
        return self.list_posts(
            limit=limit,
            offset=offset,
            search=search,
            tag=tag,
            status=status or "all",
            quality=quality,
        )

    def list_recommendable_posts(
        self, limit: int = 20, offset: int = 0, category: str = ""
    ) -> tuple[list[PostRecord], int]:
        return self.list_posts(
            limit=limit,
            offset=offset,
            category=category or "推荐",
            status="published",
            quality="complete",
            recommended=True,
        )

    def list_tags(self) -> list[str]:
        self.ensure_preset_posts()
        with self.session_factory() as session:
            rows = session.query(PostRow).filter(PostRow.status == "published").all()
            tags = set()
            for row in rows:
                record = _record_from_row(row)
                if record.quality != "complete":
                    continue
                for tag in record.recipe.tags:
                    if isinstance(tag, str) and tag.strip():
                        tags.add(tag.strip())
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
                status="published",
                source_name="User submission",
                source_url="",
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

    def update_post_status(self, post_id: str, status: PostStatus) -> PostRecord:
        if status not in VALID_POST_STATUSES:
            raise ValueError(f"Invalid post status: {status}")
        with self.session_factory() as session:
            row = session.get(PostRow, post_id)
            if row is None:
                raise KeyError(f"Unknown post_id: {post_id}")
            row.status = status
            session.commit()
            session.refresh(row)
            return _record_from_row(row)

    def upsert_imported_post(
        self,
        *,
        post_id: str,
        user_id: str,
        author: str,
        title: str,
        theme: str,
        location: str,
        image_urls: list[str],
        description: str,
        recipe: Meal,
        status: PostStatus = "published",
        source_name: str = "",
        source_url: str = "",
        saves: int = 0,
        likes: int = 0,
        forks: int = 0,
    ) -> PostRecord:
        if status not in VALID_POST_STATUSES:
            raise ValueError(f"Invalid post status: {status}")
        values = {
            "id": post_id,
            "user_id": user_id,
            "author": author,
            "title": title.strip(),
            "theme": theme.strip(),
            "location": location.strip(),
            "image_urls": [url.strip() for url in image_urls if url.strip()],
            "description": description.strip(),
            "recipe_payload": asdict(recipe),
            "status": status,
            "source_name": source_name.strip(),
            "source_url": source_url.strip(),
            "saves": saves,
            "likes": likes,
            "forks": forks,
        }
        with self.session_factory() as session:
            statement = (
                insert(PostRow)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=[PostRow.id],
                    set_={
                        key: value
                        for key, value in values.items()
                        if key not in {"id", "saves", "likes", "forks"}
                    },
                )
            )
            session.execute(statement)
            session.commit()
            row = session.get(PostRow, post_id)
            if row is None:
                raise KeyError(f"Unknown post_id after import: {post_id}")
            return _record_from_row(row)

    def count_matching_import_ids(self, post_ids: list[str]) -> int:
        if not post_ids:
            return 0
        with self.session_factory() as session:
            return (
                session.query(func.count(PostRow.id))
                .filter(PostRow.id.in_(post_ids))
                .scalar()
            )

    def delete_post(self, post_id: str) -> None:
        with self.session_factory() as session:
            row = session.get(PostRow, post_id)
            if row is None:
                raise KeyError(f"Unknown post_id: {post_id}")
            session.delete(row)
            session.commit()

    def toggle_like(self, user_id: str, post_id: str) -> tuple[bool, int, int]:
        with self.session_factory() as session:
            existing = session.get(PostLikeRow, (user_id, post_id))
            post = session.get(PostRow, post_id)
            if not post:
                raise KeyError(f"Unknown post_id: {post_id}")
            if existing:
                session.delete(existing)
                post.likes = max(0, post.likes - 1)
                session.commit()
                return False, post.likes, post.saves

            session.add(PostLikeRow(user_id=user_id, post_id=post_id))
            post.likes += 1
            session.commit()
            return True, post.likes, post.saves

    def toggle_save(self, user_id: str, post_id: str) -> tuple[bool, int]:
        with self.session_factory() as session:
            existing = session.get(PostSaveRow, (user_id, post_id))
            post = session.get(PostRow, post_id)
            if not post:
                raise KeyError(f"Unknown post_id: {post_id}")
            if existing:
                session.delete(existing)
                post.saves = max(0, post.saves - 1)
                session.commit()
                return False, post.saves

            session.add(PostSaveRow(user_id=user_id, post_id=post_id))
            post.saves += 1
            session.commit()
            return True, post.saves

    def get_user_interactions(
        self, user_id: str, post_ids: list[str]
    ) -> dict[str, tuple[bool, bool]]:
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

    def list_posts_by_user(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0,
        *,
        public_only: bool = False,
    ) -> tuple[list[PostRecord], int]:
        with self.session_factory() as session:
            q = session.query(PostRow).filter(PostRow.user_id == user_id)
            if public_only:
                rows = q.order_by(PostRow.created_at.desc(), PostRow.id.desc()).all()
                records = [
                    record
                    for record in (_record_from_row(row) for row in rows)
                    if is_public_record(record)
                ]
                return records[offset : offset + limit], len(records)

            total = session.scalar(select(func.count(PostRow.id)).where(PostRow.user_id == user_id))
            rows = q.order_by(PostRow.created_at.desc(), PostRow.id.desc()).offset(offset).limit(limit).all()
            return [_record_from_row(row) for row in rows], total

    def list_liked_posts(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0,
        *,
        public_only: bool = False,
    ) -> tuple[list[PostRecord], int]:
        with self.session_factory() as session:
            if public_only:
                rows = (
                    session.query(PostRow)
                    .join(PostLikeRow, PostRow.id == PostLikeRow.post_id)
                    .filter(PostLikeRow.user_id == user_id)
                    .order_by(PostLikeRow.created_at.desc())
                    .all()
                )
                records = [
                    record
                    for record in (_record_from_row(row) for row in rows)
                    if is_public_record(record)
                ]
                return records[offset : offset + limit], len(records)

            total = session.scalar(
                select(func.count(PostLikeRow.post_id)).where(
                    PostLikeRow.user_id == user_id
                )
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

    def list_saved_posts(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0,
        *,
        public_only: bool = False,
    ) -> tuple[list[PostRecord], int]:
        with self.session_factory() as session:
            if public_only:
                rows = (
                    session.query(PostRow)
                    .join(PostSaveRow, PostRow.id == PostSaveRow.post_id)
                    .filter(PostSaveRow.user_id == user_id)
                    .order_by(PostSaveRow.created_at.desc())
                    .all()
                )
                records = [
                    record
                    for record in (_record_from_row(row) for row in rows)
                    if is_public_record(record)
                ]
                return records[offset : offset + limit], len(records)

            total = session.scalar(
                select(func.count(PostSaveRow.post_id)).where(
                    PostSaveRow.user_id == user_id
                )
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

    def count_posts_since(self, since: datetime) -> int:
        with self.session_factory() as session:
            return (
                session.query(func.count(PostRow.id))
                .filter(PostRow.created_at >= since)
                .scalar()
            )

    def count_posts_by_status(self, status: str) -> int:
        with self.session_factory() as session:
            return (
                session.query(func.count(PostRow.id))
                .filter(PostRow.status == status)
                .scalar()
            )

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
                        status="published",
                        source_name="ForkFit curated",
                        source_url=f"internal://preset/{post['id']}",
                        saves=post["saves"],
                        likes=post.get("likes", 0),
                        forks=post["forks"],
                    )
                    .on_conflict_do_update(
                        index_elements=[PostRow.id],
                        set_={
                            "author": post["author"],
                            "title": post["title"],
                            "theme": post["theme"],
                            "location": post["location"],
                            "image_urls": post["image_urls"],
                            "description": post["description"],
                            "recipe_payload": asdict(post["recipe"]),
                            "source_name": "ForkFit curated",
                            "source_url": f"internal://preset/{post['id']}",
                        },
                    )
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
        image_urls=list(row.image_urls or []),
        description=row.description,
        recipe=meal_from_dict(row.recipe_payload),
        status=row.status,
        source_name=row.source_name,
        source_url=row.source_url,
        saves=row.saves,
        likes=row.likes,
        forks=row.forks,
        created_at=row.created_at,
    )


def is_public_record(record: PostRecord) -> bool:
    return record.status == "published" and record.quality == "complete"


def _matches_tag(record: PostRecord, tag: str) -> bool:
    normalized = tag.strip().lower()
    return any(normalized == item.strip().lower() for item in record.recipe.tags)


def _matches_quality(record: PostRecord, quality: str) -> bool:
    if not quality or quality == "all":
        return True
    return record.quality == quality


def _matches_category(record: PostRecord, category: str) -> bool:
    normalized = category.strip()
    if not normalized or normalized in {"all", "推荐"}:
        return True
    text = (
        f"{record.title} {record.theme} {record.description} "
        f"{record.recipe.searchable_text()}"
    ).lower()
    tags = {tag.strip().lower() for tag in record.recipe.tags}
    if normalized == "快手":
        return record.recipe.cook_time_minutes <= 20 or "快手" in text
    if normalized == "减脂":
        terms = {"减脂", "低脂", "低卡", "高蛋白"}
        return bool(terms & tags) or any(term in text for term in terms)
    if normalized == "家常":
        terms = {"家常", "家常菜", "下饭"}
        return bool(terms & tags) or any(term in text for term in terms)
    if normalized == "早餐":
        return "早餐" in text or "早餐" in tags
    if normalized == "素食":
        terms = {"素食", "素菜", "蔬菜"}
        return bool(terms & tags) or any(term in text for term in terms)
    if normalized == "低预算":
        terms = {"低预算", "省钱"}
        return record.recipe.estimated_cost <= 12 or bool(terms & tags) or any(
            term in text for term in terms
        )
    return _matches_tag(record, normalized)


def _recommendation_key(record: PostRecord) -> tuple[int, datetime, str]:
    score = record.likes * 3 + record.saves * 2 + record.forks
    return score, record.created_at, record.id
