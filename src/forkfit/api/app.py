from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from forkfit.api.routes_admin import router as admin_router
from forkfit.api.routes_auth import router as auth_router
from forkfit.api.routes_comments import router as comments_router
from forkfit.api.routes_posts import router as posts_router
from forkfit.api.routes_runs import router as runs_router
from forkfit.api.routes_upload import router as upload_router
from forkfit.api.routes_users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    from forkfit.api.deps import get_run_store, get_user_store
    from forkfit.auth.password import hash_password
    from forkfit.config import get_settings

    store = get_user_store()
    if not store.has_admin():
        default_pw = os.getenv("ADMIN_PASSWORD", "admin123456")
        store.create_user(
            username="admin",
            password_hash=hash_password(default_pw),
            display_name="Admin",
        )
        admin = store.get_user_by_username("admin")
        if admin is not None:
            store.set_role(admin.id, "admin")

    settings = get_settings()
    if settings.job_executor == "inline":
        get_run_store().fail_active_runs("服务曾重启，本次定制已中断，请重新提交。")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="ForkFit API", lifespan=lifespan)

    cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3001")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(posts_router)
    app.include_router(runs_router)
    app.include_router(admin_router)
    app.include_router(users_router)
    app.include_router(upload_router)
    app.include_router(comments_router)

    upload_dir = os.getenv("UPLOAD_DIR", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    return app


app = create_app()
