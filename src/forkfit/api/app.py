from __future__ import annotations

import os

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


def create_app() -> FastAPI:
    app = FastAPI(title="ForkFit API")

    cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
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

    @app.on_event("startup")
    def seed_admin():
        from forkfit.api.deps import get_user_store
        from forkfit.auth.password import hash_password
        store = get_user_store()
        if not store.has_admin():
            store.create_user(
                username="admin",
                password_hash=hash_password("admin123456"),
                display_name="Admin",
            )
            store.set_role(store.get_user_by_username("admin").id, "admin")

    return app


app = create_app()
