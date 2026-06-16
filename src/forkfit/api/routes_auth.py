from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from forkfit.api.deps import current_user, get_user_store
from forkfit.auth.jwt import create_access_token
from forkfit.auth.models import CurrentUser
from forkfit.auth.password import hash_password, verify_password
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=500)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfoResponse(BaseModel):
    id: str
    username: str
    display_name: str
    avatar_url: str | None
    role: str = "user"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfoResponse


def _user_info(user_id: str, username: str, display_name: str, avatar_url: str | None, role: str = "user") -> UserInfoResponse:
    return UserInfoResponse(
        id=user_id,
        username=username,
        display_name=display_name,
        avatar_url=avatar_url,
        role=role,
    )


def _set_cookie(response: Response, token: str, cookie_secure: bool) -> None:
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=cookie_secure,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/",
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=cookie_secure,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/",
    )


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterRequest, response: Response, request: Request) -> AuthResponse:
    store = get_user_store()
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit(f"auth:register:{client_ip}", max_requests=5, window_seconds=300, detail="Too many registrations. Please wait.")

    existing = store.get_user_by_username(body.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    display_name = body.display_name or body.username
    user = store.create_user(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=display_name,
        avatar_url=body.avatar_url,
    )

    token = create_access_token(user.id)
    _set_cookie(response, token, settings.cookie_secure)

    return AuthResponse(
        access_token=token,
        user=_user_info(user.id, user.username, user.display_name, user.avatar_url, user.role),
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, response: Response, request: Request) -> AuthResponse:
    store = get_user_store()
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit(f"auth:login:{client_ip}:{body.username.lower()}", max_requests=8, window_seconds=300, detail="Too many login attempts. Please wait.")

    result = store.get_password_hash_by_username(body.username)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_id, password_hash = result
    if not verify_password(body.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user = store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user.id)
    _set_cookie(response, token, settings.cookie_secure)

    return AuthResponse(
        access_token=token,
        user=_user_info(user.id, user.username, user.display_name, user.avatar_url, user.role),
    )


@router.get("/me", response_model=UserInfoResponse)
def me(user: CurrentUser = Depends(current_user)) -> UserInfoResponse:
    return _user_info(user.id, user.username, user.display_name, user.avatar_url, user.role)


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="csrf_token", path="/")
    return {"detail": "Logged out"}
