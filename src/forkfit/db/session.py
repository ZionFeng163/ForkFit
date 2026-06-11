from __future__ import annotations

import atexit
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from forkfit.db.migrations import run_migrations
from forkfit.db.models import Base

_engines: list[Engine] = []


@lru_cache(maxsize=8)
def make_session_factory(database_url: str) -> sessionmaker[Session]:
    if database_url.startswith("sqlite"):
        raise RuntimeError("ForkFit requires PostgreSQL; SQLite is not supported.")
    engine = create_engine(database_url, pool_pre_ping=True)
    _engines.append(engine)
    Base.metadata.create_all(engine)
    run_migrations(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


@atexit.register
def _dispose_engines() -> None:
    for engine in _engines:
        engine.dispose()
