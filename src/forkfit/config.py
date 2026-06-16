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
    kafka_bootstrap_servers: str = "localhost:9092"
    job_executor: str = "inline"
    rate_limit_enabled: bool = True
    langsmith_tracing: bool = False
    langsmith_api_key: str = ""
    langsmith_project: str = "forkfit"
    langsmith_endpoint: str = ""
    post_extraction_model: str = "deepseek-v4-flash"
    jwt_secret: str = "dev-only-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7
    cookie_secure: bool = False
    admin_password: str = ""
    cors_origins: tuple[str, ...] = ("http://localhost:3001",)
    upload_max_bytes: int = 5 * 1024 * 1024
    upload_max_pixels: int = 12_000_000
    upload_storage_quota_bytes: int = 512 * 1024 * 1024


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
        kafka_bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
        job_executor=os.getenv("JOB_EXECUTOR", "inline").strip().lower(),
        rate_limit_enabled=parse_bool(os.getenv("RATE_LIMIT_ENABLED", "true")),
        langsmith_tracing=parse_bool(os.getenv("LANGSMITH_TRACING", "false")),
        langsmith_api_key=os.getenv("LANGSMITH_API_KEY", ""),
        langsmith_project=os.getenv("LANGSMITH_PROJECT", "forkfit"),
        langsmith_endpoint=os.getenv("LANGSMITH_ENDPOINT", ""),
        post_extraction_model=os.getenv("POST_EXTRACTION_MODEL", "deepseek-v4-flash"),
        jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_expire_days=int(os.getenv("JWT_EXPIRE_DAYS", "7")),
        cookie_secure=parse_bool(os.getenv("COOKIE_SECURE", "false")),
        admin_password=os.getenv("ADMIN_PASSWORD", ""),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:3001").split(",")
            if origin.strip()
        ),
        upload_max_bytes=int(os.getenv("UPLOAD_MAX_BYTES", str(5 * 1024 * 1024))),
        upload_max_pixels=int(os.getenv("UPLOAD_MAX_PIXELS", "12000000")),
        upload_storage_quota_bytes=int(
            os.getenv("UPLOAD_STORAGE_QUOTA_BYTES", str(512 * 1024 * 1024))
        ),
    )


def is_production_env(app_env: str) -> bool:
    return app_env.strip().lower() in {"prod", "production"}


def validate_startup_settings(settings: Settings) -> None:
    if settings.job_executor not in {"inline", "kafka"}:
        raise RuntimeError("JOB_EXECUTOR must be either 'inline' or 'kafka'.")

    if not settings.cors_origins:
        raise RuntimeError("CORS_ORIGINS must include at least one origin.")

    if not is_production_env(settings.app_env):
        return

    if (
        not settings.jwt_secret
        or settings.jwt_secret == "dev-only-change-in-production"
        or len(settings.jwt_secret) < 32
    ):
        raise RuntimeError("Production JWT_SECRET must be a random secret with at least 32 characters.")

    if not settings.cookie_secure:
        raise RuntimeError("COOKIE_SECURE=true is required in production.")

    if not _is_strong_admin_password(settings.admin_password):
        raise RuntimeError(
            "Production ADMIN_PASSWORD must be set, changed from the default, and at least 12 characters."
        )


def _is_strong_admin_password(password: str) -> bool:
    return bool(password) and password != "admin123456" and len(password) >= 12


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
