from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import Engine, text


Migration = tuple[int, str, Sequence[str]]


MIGRATIONS: tuple[Migration, ...] = (
    (
        1,
        "complete_user_columns",
        (
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio varchar(500) NOT NULL DEFAULT ''",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS location varchar(100) NOT NULL DEFAULT ''",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'user'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS extracted_preferences json",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_payload json",
        ),
    ),
    (
        2,
        "complete_post_columns",
        (
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes integer NOT NULL DEFAULT 0",
        ),
    ),
    (
        3,
        "complete_run_columns",
        (
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS unresolved_payload json",
            "ALTER TABLE runs ADD COLUMN IF NOT EXISTS saved boolean NOT NULL DEFAULT false",
        ),
    ),
    (
        4,
        "complete_indexes",
        (
            "CREATE INDEX IF NOT EXISTS ix_runs_user_id ON runs (user_id)",
            "CREATE INDEX IF NOT EXISTS ix_runs_status ON runs (status)",
            "CREATE INDEX IF NOT EXISTS ix_posts_user_id ON posts (user_id)",
            "CREATE INDEX IF NOT EXISTS ix_comments_post_id ON comments (post_id)",
            "CREATE INDEX IF NOT EXISTS ix_comments_user_id ON comments (user_id)",
        ),
    ),
    (
        5,
        "run_feedback_and_admin_audit",
        (
            """
            CREATE TABLE IF NOT EXISTS run_feedback (
                id serial PRIMARY KEY,
                run_id varchar(80) NOT NULL,
                user_id varchar(120) NOT NULL,
                rating varchar(40) NOT NULL,
                reason text NOT NULL DEFAULT '',
                created_at timestamptz NOT NULL DEFAULT now()
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_run_feedback_run_id ON run_feedback (run_id)",
            "CREATE INDEX IF NOT EXISTS ix_run_feedback_user_id ON run_feedback (user_id)",
            """
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id serial PRIMARY KEY,
                admin_user_id varchar(120) NOT NULL,
                action varchar(120) NOT NULL,
                target_type varchar(80) NOT NULL,
                target_id varchar(160) NOT NULL,
                payload json NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_admin_user_id ON admin_audit_logs (admin_user_id)",
        ),
    ),
    (
        6,
        "post_content_status_and_source",
        (
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'published'",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_name varchar(120) NOT NULL DEFAULT ''",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url varchar(500) NOT NULL DEFAULT ''",
            "CREATE INDEX IF NOT EXISTS ix_posts_status ON posts (status)",
        ),
    ),
)


def run_migrations(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(hashtext('forkfit_schema'))"))
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version integer PRIMARY KEY,
                    name varchar(120) NOT NULL,
                    applied_at timestamptz NOT NULL DEFAULT now()
                )
                """
            )
        )
        applied = {
            row[0]
            for row in connection.execute(text("SELECT version FROM schema_migrations"))
        }
        for version, name, statements in MIGRATIONS:
            if version in applied:
                continue
            for statement in statements:
                connection.execute(text(statement))
            connection.execute(
                text(
                    "INSERT INTO schema_migrations (version, name) "
                    "VALUES (:version, :name)"
                ),
                {"version": version, "name": name},
            )
