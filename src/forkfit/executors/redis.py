from __future__ import annotations

from redis import Redis
from rq import Queue

from forkfit.models import MealPack, UserProfile
from forkfit.serialization import meal_pack_to_dict, user_profile_to_dict
from forkfit.workers.runner import run_forkfit_job


class RedisJobExecutor:
    def __init__(self, *, redis_url: str, queue_name: str = "forkfit-runs") -> None:
        self.redis = Redis.from_url(redis_url)
        self.queue = Queue(queue_name, connection=self.redis)

    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
    ) -> None:
        self.queue.enqueue(
            run_forkfit_job,
            run_id,
            user_profile_to_dict(user_profile),
            meal_pack_to_dict(meal_pack),
            job_id=run_id,
            result_ttl=3600,
            failure_ttl=86400,
        )
