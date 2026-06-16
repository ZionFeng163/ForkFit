from __future__ import annotations

from fastapi import HTTPException

from forkfit.config import get_settings
from forkfit.redis_utils import get_rate_limiter


def enforce_rate_limit(
    key: str,
    *,
    max_requests: int,
    window_seconds: int,
    detail: str = "Too many requests. Please wait and try again.",
) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return

    limiter = get_rate_limiter(settings.redis_url)
    if limiter is None:
        return

    allowed, _remaining = limiter.is_allowed(
        key,
        max_requests=max_requests,
        window_seconds=window_seconds,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail=detail)
