from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from forkfit.api.health import HealthReport, build_health_report

router = APIRouter(tags=["health"])


@router.get("/healthz", response_class=PlainTextResponse)
def healthz() -> str:
    return "ok"


@router.get("/readyz", response_model=HealthReport)
def readyz() -> HealthReport:
    return build_health_report()
