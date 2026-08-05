from __future__ import annotations

import asyncio
from functools import lru_cache


@lru_cache(maxsize=4)
def get_global_work_semaphore(limit: int) -> asyncio.Semaphore:
    return asyncio.Semaphore(max(1, limit))
