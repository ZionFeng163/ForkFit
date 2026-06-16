from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from forkfit.api.routes_admin import router as admin_router
from forkfit.api.routes_auth import router as auth_router
from forkfit.api.routes_comments import router as comments_router
from forkfit.api.routes_health import router as health_router
from forkfit.api.routes_posts import router as posts_router
from forkfit.api.routes_runs import router as runs_router
from forkfit.api.routes_upload import router as upload_router
from forkfit.api.routes_users import router as users_router
from forkfit.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    from forkfit.api.deps import get_run_store, get_user_store
    from forkfit.auth.password import hash_password
    from forkfit.config import _is_strong_admin_password, get_settings, validate_startup_settings

    settings = get_settings()
    validate_startup_settings(settings)
    store = get_user_store()
    if not store.has_admin():
        default_pw = settings.admin_password
        if _is_strong_admin_password(default_pw):
            store.create_user(
                username="admin",
                password_hash=hash_password(default_pw),
                display_name="Admin",
            )
            admin = store.get_user_by_username("admin")
            if admin is not None:
                store.set_role(admin.id, "admin")

    if settings.job_executor == "inline":
        get_run_store().fail_active_runs("服务曾重启，本次定制已中断，请重新提交。")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="ForkFit API", lifespan=lifespan)
    settings = get_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def csrf_protect(request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.cookies.get("access_token"):
            csrf_cookie = request.cookies.get("csrf_token")
            csrf_header = request.headers.get("x-csrf-token")
            if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
                return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})
        return await call_next(request)

    app.include_router(auth_router)
    app.include_router(posts_router)
    app.include_router(runs_router)
    app.include_router(admin_router)
    app.include_router(users_router)
    app.include_router(upload_router)
    app.include_router(comments_router)
    app.include_router(health_router)

    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    return app


app = create_app()
