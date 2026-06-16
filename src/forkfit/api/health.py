from __future__ import annotations

import os
import time

from pydantic import BaseModel

from forkfit.config import get_settings


class ServiceHealth(BaseModel):
    name: str
    status: str
    latency_ms: float
    details: str = ""


class HealthReport(BaseModel):
    services: list[ServiceHealth]


def build_health_report() -> HealthReport:
    services: list[ServiceHealth] = []

    pg_ok, pg_latency, pg_detail = _check_postgres()
    services.append(ServiceHealth(name="database", status="ok" if pg_ok else "error", latency_ms=pg_latency, details=pg_detail))

    redis_ok, redis_latency, redis_detail = _check_redis()
    services.append(ServiceHealth(name="redis", status="ok" if redis_ok else "error", latency_ms=redis_latency, details=redis_detail))

    settings = get_settings()
    if settings.job_executor == "inline":
        services.append(ServiceHealth(name="executor", status="ok", latency_ms=0, details="inline"))
    else:
        kafka_ok, kafka_latency, kafka_detail = _check_kafka()
        services.append(ServiceHealth(name="executor", status="ok" if kafka_ok else "warn", latency_ms=kafka_latency, details=kafka_detail))

    llm_ok, llm_latency, llm_detail = _check_llm()
    services.append(ServiceHealth(name="llm", status="ok" if llm_ok else "warn", latency_ms=llm_latency, details=llm_detail))

    return HealthReport(services=services)


def _check_postgres() -> tuple[bool, float, str]:
    try:
        from sqlalchemy import text

        from forkfit.db.session import make_session_factory

        settings = get_settings()
        factory = make_session_factory(settings.database_url)
        started = time.perf_counter()
        with factory() as session:
            session.execute(text("SELECT 1"))
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, "connected"
    except Exception as exc:
        return False, 0, str(exc)[:120]


def _check_redis() -> tuple[bool, float, str]:
    try:
        import redis as redis_lib

        settings = get_settings()
        client = redis_lib.from_url(settings.redis_url, socket_timeout=3)
        started = time.perf_counter()
        client.ping()
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, "connected"
    except Exception as exc:
        return False, 0, str(exc)[:120]


def _check_kafka() -> tuple[bool, float, str]:
    try:
        from forkfit.kafka_utils import get_producer

        settings = get_settings()
        started = time.perf_counter()
        producer = get_producer(bootstrap_servers=settings.kafka_bootstrap_servers)
        producer.flush(timeout=3)
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, "connected"
    except Exception as exc:
        return False, 0, str(exc)[:120]


def _check_llm() -> tuple[bool, float, str]:
    try:
        if not os.getenv("BAILIAN_API_KEY"):
            return False, 0, "api key not configured"
        from forkfit.llm import BailianLLMClient

        started = time.perf_counter()
        client = BailianLLMClient()
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, f"model={client.model}"
    except Exception as exc:
        return False, 0, str(exc)[:120]
