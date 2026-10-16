from __future__ import annotations

import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from forkfit.api.app import create_app
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.config import get_settings, validate_startup_settings


class StartupValidationTests(unittest.TestCase):
    def test_production_requires_strong_secrets(self) -> None:
        settings = replace(
            get_settings(),
            app_env="production",
            jwt_secret="dev-only-change-in-production",
            cookie_secure=False,
            admin_password="admin123456",
        )

        with self.assertRaises(RuntimeError):
            validate_startup_settings(settings)

    def test_local_allows_unset_admin_password(self) -> None:
        settings = replace(
            get_settings(),
            app_env="local",
            admin_password="",
        )

        validate_startup_settings(settings)


class RateLimitTests(unittest.TestCase):
    def test_unavailable_limiter_fails_closed(self) -> None:
        settings = replace(get_settings(), app_env="production", rate_limit_enabled=True)
        for limiter in (None, Mock(is_allowed=Mock(side_effect=RedisConnectionError("private connection details")))):
            with (
                self.subTest(limiter=limiter),
                patch("forkfit.api.rate_limit.get_settings", return_value=settings),
                patch("forkfit.api.rate_limit.get_rate_limiter", return_value=limiter),
            ):
                with self.assertRaises(HTTPException) as error:
                    enforce_rate_limit("test", max_requests=1, window_seconds=60)
                self.assertEqual(error.exception.status_code, 503)
                self.assertEqual(error.exception.headers, {"Retry-After": "10"})
                self.assertNotIn("private", error.exception.detail)

    def test_explicit_test_mode_disable_does_not_connect(self) -> None:
        with (
            patch("forkfit.api.rate_limit.get_settings", return_value=replace(get_settings(), rate_limit_enabled=False)),
            patch("forkfit.api.rate_limit.get_rate_limiter") as get_limiter,
        ):
            enforce_rate_limit("test", max_requests=1, window_seconds=60)
            get_limiter.assert_not_called()

    def test_limiter_recovers_after_connection_failure(self) -> None:
        limiter = Mock()
        limiter.is_allowed.side_effect = [RedisConnectionError(), (True, 1)]
        with (
            patch("forkfit.api.rate_limit.get_settings", return_value=replace(get_settings(), rate_limit_enabled=True)),
            patch("forkfit.api.rate_limit.get_rate_limiter", return_value=limiter),
        ):
            with self.assertRaises(HTTPException):
                enforce_rate_limit("test", max_requests=2, window_seconds=60)
            enforce_rate_limit("test", max_requests=2, window_seconds=60)

    def test_preference_extraction_is_limited_before_model_work(self) -> None:
        from forkfit.api.routes_users import extract_my_preferences
        with patch("forkfit.api.routes_users.enforce_rate_limit", side_effect=HTTPException(503)) as enforce:
            with self.assertRaises(HTTPException):
                extract_my_preferences(user=SimpleNamespace(id="test"))
            enforce.assert_called_once_with("extract-preferences:test", max_requests=3, window_seconds=600)

    def test_enforce_rate_limit_raises_429_when_limited(self) -> None:
        fake_limiter = SimpleNamespace(is_allowed=lambda *args, **kwargs: (False, 0))
        settings = replace(get_settings(), rate_limit_enabled=True)

        with (
            patch("forkfit.api.rate_limit.get_settings", return_value=settings),
            patch("forkfit.api.rate_limit.get_rate_limiter", return_value=fake_limiter),
        ):
            with self.assertRaises(HTTPException) as error:
                enforce_rate_limit("demo", max_requests=1, window_seconds=60)

        self.assertEqual(error.exception.status_code, 429)


class HealthRouteTests(unittest.TestCase):
    def test_healthz_is_plain_ok(self) -> None:
        client = TestClient(create_app())

        response = client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "ok")

    def test_readyz_returns_service_report(self) -> None:
        client = TestClient(create_app())

        response = client.get("/readyz")

        self.assertEqual(response.status_code, 200)
        names = {service["name"] for service in response.json()["services"]}
        self.assertIn("database", names)
        self.assertIn("redis", names)
        self.assertIn("executor", names)
        self.assertIn("llm", names)


if __name__ == "__main__":
    unittest.main()
