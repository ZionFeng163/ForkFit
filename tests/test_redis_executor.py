import unittest
from unittest.mock import Mock, patch

from forkfit.executors import RedisJobExecutor
from forkfit.fixtures import demo_meal_pack, demo_user_profile
from forkfit.workers.runner import run_forkfit_job


class RedisJobExecutorTests(unittest.IsolatedAsyncioTestCase):
    @patch("forkfit.executors.redis.Queue")
    @patch("forkfit.executors.redis.Redis")
    async def test_submit_enqueues_real_worker_job(self, redis_cls, queue_cls):
        queue = Mock()
        queue_cls.return_value = queue
        redis_cls.from_url.return_value = Mock()
        executor = RedisJobExecutor(redis_url="redis://localhost:6379/0")

        await executor.submit(
            run_id="run_123",
            user_profile=demo_user_profile(),
            meal_pack=demo_meal_pack(),
        )

        queue.enqueue.assert_called_once()
        args, kwargs = queue.enqueue.call_args
        self.assertIs(args[0], run_forkfit_job)
        self.assertEqual(args[1], "run_123")
        self.assertEqual(kwargs["job_id"], "run_123")


if __name__ == "__main__":
    unittest.main()
