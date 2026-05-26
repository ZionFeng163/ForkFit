from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from forkfit.db.models import Base


def make_session_factory(database_url: str) -> sessionmaker[Session]:
    if database_url.startswith("sqlite"):
        raise RuntimeError("ForkFit requires PostgreSQL; SQLite is not supported.")
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
