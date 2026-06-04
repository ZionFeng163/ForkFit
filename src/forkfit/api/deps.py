from __future__ import annotations

from functools import lru_cache

from fastapi import Cookie, Depends, Header, HTTPException

from forkfit.auth.jwt import decode_access_token
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.executors.kafka import KafkaJobExecutor
from forkfit.llm import BailianLLMClient
from forkfit.services import RunService
from forkfit.stores import PostgresPostStore, PostgresRunStore
from forkfit.stores.comments import CommentStore
from forkfit.stores.user import UserStore


@lru_cache(maxsize=1)
def get_run_store() -> PostgresRunStore:
    settings = get_settings()
    return PostgresRunStore(make_session_factory(settings.database_url))


@lru_cache(maxsize=1)
def get_post_store() -> PostgresPostStore:
    settings = get_settings()
    return PostgresPostStore(make_session_factory(settings.database_url))


@lru_cache(maxsize=1)
def get_user_store() -> UserStore:
    settings = get_settings()
    return UserStore(make_session_factory(settings.database_url))


@lru_cache(maxsize=1)
def get_comment_store() -> CommentStore:
    settings = get_settings()
    return CommentStore(make_session_factory(settings.database_url))


@lru_cache(maxsize=1)
def get_post_extraction_llm() -> BailianLLMClient:
    settings = get_settings()
    return BailianLLMClient(
        model=settings.post_extraction_model,
        timeout_seconds=settings.llm_timeout_seconds,
    )


@lru_cache(maxsize=1)
def get_run_service() -> RunService:
    settings = get_settings()
    store = get_run_store()
    executor = KafkaJobExecutor()
    return RunService(store=store, executor=executor, settings=settings)


def current_user(
    access_token: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> CurrentUser:
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_store = get_user_store()
    user = user_store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return CurrentUser(
        id=user.id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        username=user.username,
        role=user.role,
    )


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def optional_current_user(
    access_token: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> CurrentUser | None:
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        return None
    user_id = decode_access_token(token)
    if not user_id:
        return None
    user_store = get_user_store()
    user = user_store.get_user_by_id(user_id)
    if not user:
        return None
    return CurrentUser(
        id=user.id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        username=user.username,
        role=user.role,
    )
