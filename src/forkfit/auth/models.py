from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: str
    display_name: str
    avatar_url: str | None = None
    username: str = ""
    role: str = "user"
