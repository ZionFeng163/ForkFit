from __future__ import annotations

from redis import Redis
from rq import Queue, Worker

from forkfit.config import get_settings


def main() -> None:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url)
    queue = Queue("forkfit-runs", connection=redis)
    Worker([queue], connection=redis).work()


if __name__ == "__main__":
    main()
