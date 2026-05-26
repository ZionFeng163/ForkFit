from __future__ import annotations

from fastapi import FastAPI

from forkfit.api.routes_runs import router as runs_router


def create_app() -> FastAPI:
    app = FastAPI(title="ForkFit API")
    app.include_router(runs_router)
    return app


app = create_app()
