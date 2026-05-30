from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from forkfit.config import get_settings


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    return jwt.encode(
        {"sub": user_id, "exp": exp},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> str | None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload.get("sub")
    except jwt.PyJWTError:
        return None
