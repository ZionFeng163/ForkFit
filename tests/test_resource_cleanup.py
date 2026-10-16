from __future__ import annotations

import io
import json
import os
import runpy
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from redis.exceptions import ConnectionError as RedisConnectionError

from forkfit.api.health import _check_redis
from forkfit.knowledge.embeddings import EmbeddingClient
from forkfit.llm import BailianLLMClient
from forkfit.redis_utils import get_rate_limiter


class ResourceCleanupTests(unittest.TestCase):
    def test_watchdog_does_not_restart_a_busy_server(self):
        script = Path(__file__).resolve().parents[1] / "scripts/healthcheck_services.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, content in {
                "curl": '#!/bin/sh\nprintf "%s" "$HTTP_CODE"\n',
                "systemctl": '#!/bin/sh\necho "$*" >> "$CALLS"\n',
                "logger": '#!/bin/sh\nexit 0\n',
                "sleep": '#!/bin/sh\nexit 0\n',
            }.items():
                path = root / name
                path.write_text(content)
                path.chmod(0o755)
            calls = root / "calls"
            env = {**os.environ, "PATH": f"{root}:{os.environ['PATH']}", "CALLS": str(calls)}
            for code in ("200", "503"):
                subprocess.run(["bash", str(script)], env={**env, "HTTP_CODE": code}, check=True)
                self.assertFalse(calls.exists())
            subprocess.run(["bash", str(script)], env={**env, "HTTP_CODE": "000"}, check=True)
            self.assertEqual(calls.read_text().splitlines(), [
                "restart forkfit-backend.service", "restart forkfit-frontend.service",
            ])

    def test_embedding_response_closed_even_on_invalid_json(self):
        for body in (b'{"data":[{"index":0,"embedding":[1,2]}]}', b"invalid"):
            with self.subTest(body=body):
                response = io.BytesIO(body)
                with patch("urllib.request.urlopen", return_value=response):
                    try:
                        EmbeddingClient(api_key="test").embed(["test"])
                    except json.JSONDecodeError:
                        pass
                self.assertTrue(response.closed)

    def test_llm_http_error_closed_before_retry(self):
        stream = io.BytesIO(b"unavailable")
        error = HTTPError("http://test", 503, "unavailable", {}, stream)
        response = io.BytesIO(b'{"choices":[{"message":{"content":"{}"}}]}')
        with patch("urllib.request.urlopen", side_effect=[error, response]), patch("time.sleep"):
            BailianLLMClient(api_key="test").complete_json(agent="test", system="", user="")
        self.assertTrue(stream.closed)
        self.assertTrue(response.closed)

    def test_redis_health_probe_closes_on_failure_and_success(self):
        for failure in (None, RedisConnectionError("unavailable")):
            manager = MagicMock()
            manager.__enter__.return_value.ping.side_effect = failure
            with patch("redis.from_url", return_value=manager):
                ok, _, _ = _check_redis()
            self.assertEqual(ok, failure is None)
            manager.__exit__.assert_called_once()

    def test_failed_limiter_initialization_closes_client(self):
        client = MagicMock()
        client.ping.side_effect = RedisConnectionError()
        with patch("forkfit.redis_utils._rate_limiter", None), patch("forkfit.redis_utils.Redis.from_url", return_value=client) as connect:
            self.assertIsNone(get_rate_limiter("redis://test"))
        client.close.assert_called_once()
        self.assertEqual(connect.call_args.kwargs["socket_connect_timeout"], 2)

    def test_http_concurrency_is_bounded_and_separate_from_ai_limit(self):
        path = Path(__file__).resolve().parents[1] / "scripts/run_api.py"
        with patch.dict(os.environ, {"HTTP_MAX_CONCURRENCY": "64", "API_HOST": "127.0.0.1", "MAX_GLOBAL_CONCURRENT_RUNS": "1"}), patch("uvicorn.run") as run:
            runpy.run_path(str(path), run_name="__main__")
        self.assertEqual(run.call_args.kwargs["limit_concurrency"], 64)
        self.assertEqual(run.call_args.kwargs["backlog"], 128)
        self.assertEqual(run.call_args.kwargs["timeout_keep_alive"], 5)
        with patch.dict(os.environ, {"HTTP_MAX_CONCURRENCY": "0"}), patch("uvicorn.run") as run:
            with self.assertRaises(ValueError):
                runpy.run_path(str(path), run_name="__main__")
            run.assert_not_called()
