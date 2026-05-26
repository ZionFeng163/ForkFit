from __future__ import annotations

from functools import lru_cache

from forkfit.auth.demo_auth import get_current_user
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.executors import InMemoryJobExecutor
from forkfit.langgraph_workflow import ForkFitLangGraphWorkflow
from forkfit.services import RunService
from forkfit.stores import InMemoryRunStore


@lru_cache(maxsize=1)
def get_run_store() -> InMemoryRunStore:
    return InMemoryRunStore()


@lru_cache(maxsize=1)
def get_run_service() -> RunService:
    settings = get_settings()
    store = get_run_store()
    executor = InMemoryJobExecutor(
        store=store,
        workflow=ForkFitLangGraphWorkflow(),
        max_concurrent_runs=settings.max_global_concurrent_runs,
    )
    return RunService(store=store, executor=executor)


def current_user() -> CurrentUser:
    return get_current_user()
