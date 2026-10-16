from __future__ import annotations

import os
import uvicorn

from forkfit.config import load_env


def main() -> None:
    load_env()
    host = os.getenv("API_HOST", "0.0.0.0")
    # Bound HTTP work independently of the much smaller AI job concurrency.
    limit = int(os.getenv("HTTP_MAX_CONCURRENCY", "128"))
    if not 8 <= limit <= 512:
        raise ValueError("HTTP_MAX_CONCURRENCY must be between 8 and 512.")
    uvicorn.run(
        "forkfit.api.app:app", host=host, port=8000, reload=False,
        limit_concurrency=limit, backlog=128, timeout_keep_alive=5,
    )


if __name__ == "__main__":
    main()
