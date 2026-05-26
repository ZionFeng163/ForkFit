from __future__ import annotations

from functools import lru_cache

from forkfit.auth.demo_auth import get_current_user
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.executors import RedisJobExecutor
from forkfit.services import RunService
from forkfit.stores import PostgresRunStore


@lru_cache(maxsize=1)
def get_run_store() -> PostgresRunStore:
    settings = get_settings()
    return PostgresRunStore(make_session_factory(settings.database_url))


@lru_cache(maxsize=1)
def get_run_service() -> RunService:
    settings = get_settings()
    store = get_run_store()
    executor = RedisJobExecutor(redis_url=settings.redis_url)
    return RunService(store=store, executor=executor)


def current_user() -> CurrentUser:
    return get_current_user()
