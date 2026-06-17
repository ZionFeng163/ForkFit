#!/usr/bin/env python3
"""Hide imported posts by source name.

Use this for retiring a bad content batch without deleting interaction history.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from forkfit.config import get_settings, load_env
from forkfit.db.models import PostRow
from forkfit.db.session import make_session_factory


def main() -> int:
    parser = argparse.ArgumentParser(description="Hide posts matching source_name.")
    parser.add_argument("--source-name", action="append", required=True)
    parser.add_argument("--database-url", default="")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    load_env()
    database_url = args.database_url or get_settings().database_url
    factory = make_session_factory(database_url)
    with factory() as session:
        query = session.query(PostRow).filter(PostRow.source_name.in_(args.source_name))
        count = query.count()
        print(f"Matched {count} post(s) for source_name={args.source_name}")
        if not args.apply:
            print("Dry run only; pass --apply to set status=hidden.")
            return 0
        updated = query.update({PostRow.status: "hidden"}, synchronize_session=False)
        session.commit()
        print(f"Hidden {updated} post(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
