from __future__ import annotations

import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

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
