from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from forkfit.api.routes_posts import router as posts_router
from forkfit.api.routes_runs import router as runs_router


def create_app() -> FastAPI:
    app = FastAPI(title="ForkFit API")

    cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(posts_router)
    app.include_router(runs_router)
    return app


app = create_app()
