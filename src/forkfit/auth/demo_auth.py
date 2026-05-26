from __future__ import annotations

from forkfit.auth.models import CurrentUser
from forkfit.config import Settings, get_settings


def get_current_user(settings: Settings | None = None) -> CurrentUser:
    settings = settings or get_settings()
    return CurrentUser(id=settings.demo_user_id, display_name="Demo User")
