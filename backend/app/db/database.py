from __future__ import annotations

import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./verae.db")

_engine_kwargs: dict[str, object] = {}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def _ensure_users_profile_columns() -> None:
    required_columns = {
        "first_name": "VARCHAR(120)",
        "last_name": "VARCHAR(120)",
        "default_age": "INTEGER",
        "default_gender": "INTEGER",
        "default_height": "FLOAT",
        "default_weight": "FLOAT",
    }
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("users")}
    missing = [name for name in required_columns if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for column_name in missing:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN {column_name} {required_columns[column_name]}"))


def init_db() -> None:
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_users_profile_columns()
