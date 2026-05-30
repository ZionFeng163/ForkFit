from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    app_env: str = "local"
    demo_user_id: str = "demo_user"
    max_global_concurrent_runs: int = 3
    max_user_concurrent_runs: int = 1
    llm_timeout_seconds: int = 60
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    langsmith_tracing: bool = False
    langsmith_api_key: str = ""
    langsmith_project: str = "forkfit"
    langsmith_endpoint: str = ""
    post_extraction_model: str = "deepseek-v4-flash"
    jwt_secret: str = "dev-only-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7
    cookie_secure: bool = False


def get_settings() -> Settings:
    load_env()
    database_url = require_env("DATABASE_URL")
    if database_url.startswith("sqlite"):
        raise RuntimeError("DATABASE_URL must point to a real PostgreSQL database.")
    return Settings(
        app_env=os.getenv("APP_ENV", "local"),
        demo_user_id=os.getenv("DEMO_USER_ID", "demo_user"),
        max_global_concurrent_runs=int(os.getenv("MAX_GLOBAL_CONCURRENT_RUNS", "3")),
        max_user_concurrent_runs=int(os.getenv("MAX_USER_CONCURRENT_RUNS", "1")),
        llm_timeout_seconds=int(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
        database_url=database_url,
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        langsmith_tracing=parse_bool(os.getenv("LANGSMITH_TRACING", "false")),
        langsmith_api_key=os.getenv("LANGSMITH_API_KEY", ""),
        langsmith_project=os.getenv("LANGSMITH_PROJECT", "forkfit"),
        langsmith_endpoint=os.getenv("LANGSMITH_ENDPOINT", ""),
        post_extraction_model=os.getenv("POST_EXTRACTION_MODEL", "deepseek-v4-flash"),
        jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_expire_days=int(os.getenv("JWT_EXPIRE_DAYS", "7")),
        cookie_secure=parse_bool(os.getenv("COOKIE_SECURE", "false")),
    )


def load_env(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}
