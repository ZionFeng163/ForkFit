from __future__ import annotations

import unittest

from sqlalchemy import text

from forkfit.config import get_settings
from forkfit.db.migrations import MIGRATIONS
from forkfit.db.session import make_session_factory


class DatabaseMigrationTests(unittest.TestCase):
    def test_all_migrations_are_applied(self) -> None:
        factory = make_session_factory(get_settings().database_url)
        engine = factory.kw["bind"]
        with engine.connect() as connection:
            applied = {
                row[0]
                for row in connection.execute(
                    text("SELECT version FROM schema_migrations")
                )
            }

        self.assertEqual({version for version, _, _ in MIGRATIONS}, applied)


if __name__ == "__main__":
    unittest.main()
