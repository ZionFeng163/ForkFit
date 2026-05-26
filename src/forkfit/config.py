from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    app_env: str = "local"
    demo_user_id: str = "demo_user"
    max_global_concurrent_runs: int = 3
    max_user_concurrent_runs: int = 1
    llm_timeout_seconds: int = 60


def get_settings() -> Settings:
    return Settings(
        app_env=os.getenv("APP_ENV", "local"),
        demo_user_id=os.getenv("DEMO_USER_ID", "demo_user"),
        max_global_concurrent_runs=int(os.getenv("MAX_GLOBAL_CONCURRENT_RUNS", "3")),
        max_user_concurrent_runs=int(os.getenv("MAX_USER_CONCURRENT_RUNS", "1")),
        llm_timeout_seconds=int(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
    )
