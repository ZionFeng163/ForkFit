from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Protocol

from .models import LLMCallTrace, RunTrace


class LLMClient(Protocol):
    model: str

    def complete_json(
        self,
        *,
        agent: str,
        system: str,
        user: str,
        trace: RunTrace | None = None,
    ) -> dict[str, Any]:
        ...


def load_env(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class BailianLLMClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        timeout_seconds: int = 60,
    ) -> None:
        load_env()
        self.api_key = api_key or os.environ.get("BAILIAN_API_KEY")
        self.model = model or os.environ.get("BAILIAN_MODEL", "qwen3.6-flash")
        self.base_url = (
            base_url
            or os.environ.get(
                "BAILIAN_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            )
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds
        if not self.api_key:
            raise ValueError("BAILIAN_API_KEY is required for BailianLLMClient.")

    def complete_json(
        self,
        *,
        agent: str,
        system: str,
        user: str,
        trace: RunTrace | None = None,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            usage = body.get("usage", {})
            if trace is not None:
                trace.llm_calls.append(
                    LLMCallTrace(
                        agent=agent,
                        model=self.model,
                        duration_ms=_elapsed_ms(started),
                        prompt_tokens=usage.get("prompt_tokens"),
                        completion_tokens=usage.get("completion_tokens"),
                        status="success",
                    )
                )
            return json.loads(content)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            self._record_error(trace, agent, started, f"HTTP {exc.code}: {detail}")
            raise
        except Exception as exc:
            self._record_error(trace, agent, started, str(exc))
            raise

    def _record_error(
        self, trace: RunTrace | None, agent: str, started: float, error: str
    ) -> None:
        if trace is None:
            return
        trace.llm_calls.append(
            LLMCallTrace(
                agent=agent,
                model=self.model,
                duration_ms=_elapsed_ms(started),
                prompt_tokens=None,
                completion_tokens=None,
                status="error",
                error=error,
            )
        )


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)
