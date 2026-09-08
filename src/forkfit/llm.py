from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from .config import load_env
from .models import LLMCallTrace, RunTrace, ToolCallTrace


@dataclass(slots=True)
class FunctionTool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[[dict[str, Any]], Any]

    def schema(self) -> dict[str, Any]:
        return {"type": "function", "function": {
            "name": self.name, "description": self.description,
            "parameters": self.parameters,
        }}


@dataclass(slots=True)
class ToolAgentResult:
    output: dict[str, Any]
    tool_outputs: list[dict[str, Any]]


class LLMClient(Protocol):
    model: str

    def complete_json(
        self,
        *,
        agent: str,
        system: str,
        user: str,
        trace: RunTrace | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        ...

    def complete_with_tools(
        self, *, agent: str, system: str, user: str,
        tools: list[FunctionTool], trace: RunTrace | None = None,
        max_tokens: int | None = None, max_turns: int = 3,
        max_tool_calls: int = 8, require_tool: bool = False,
    ) -> ToolAgentResult:
        ...


class BailianLLMClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        timeout_seconds: int = 60,
        max_retries: int = 1,
    ) -> None:
        load_env()
        self.api_key = api_key or os.environ.get("BAILIAN_API_KEY")
        self.model = model or os.environ.get(
            "BAILIAN_MODEL", "deepseek-v4-flash-0731"
        )
        self.base_url = (
            base_url
            or os.environ.get(
                "BAILIAN_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            )
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, min(3, int(max_retries)))
        if not self.api_key:
            raise ValueError("BAILIAN_API_KEY is required for BailianLLMClient.")

    def complete_json(
        self,
        *,
        agent: str,
        system: str,
        user: str,
        trace: RunTrace | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "max_tokens": max_tokens or _default_max_tokens(agent),
            "response_format": {"type": "json_object"},
            "enable_thinking": _enable_thinking(self.model),
        }
        body = self._chat(payload, agent, trace)
        return _parse_json_content(body["choices"][0]["message"]["content"])

    def complete_with_tools(
        self, *, agent: str, system: str, user: str,
        tools: list[FunctionTool], trace: RunTrace | None = None,
        max_tokens: int | None = None, max_turns: int = 3,
        max_tool_calls: int = 8, require_tool: bool = False,
    ) -> ToolAgentResult:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        by_name = {tool.name: tool for tool in tools}
        outputs: list[dict[str, Any]] = []
        call_count = 0
        for turn in range(max_turns):
            payload = {
                "model": self.model, "messages": messages,
                "temperature": 0, "max_tokens": max_tokens or _default_max_tokens(agent),
                "tools": [tool.schema() for tool in tools],
                "tool_choice": "required" if require_tool and turn == 0 else "none" if turn == max_turns - 1 else "auto",
                "response_format": {"type": "json_object"},
                "enable_thinking": _enable_thinking(self.model),
            }
            body = self._chat(payload, agent, trace)
            message = body["choices"][0]["message"]
            calls = message.get("tool_calls") or []
            if not calls:
                return ToolAgentResult(_parse_json_content(message.get("content") or "{}"), outputs)
            messages.append({"role": "assistant", "content": message.get("content"), "tool_calls": calls})
            for call in calls:
                call_count += 1
                if call_count > max_tool_calls:
                    raise RuntimeError("Tool call limit exceeded.")
                name = str(call.get("function", {}).get("name", ""))
                if name not in by_name:
                    raise RuntimeError(f"Unknown tool requested: {name}")
                raw = call.get("function", {}).get("arguments", "{}")
                arguments = json.loads(raw) if isinstance(raw, str) else dict(raw)
                started = time.perf_counter()
                try:
                    result = by_name[name].handler(arguments)
                    outputs.append({"tool": name, "arguments": arguments, "result": result})
                    if trace is not None:
                        trace.tool_calls.append(ToolCallTrace(
                            agent=agent, tool=name, duration_ms=_elapsed_ms(started), status="success",
                            result_count=len(result) if isinstance(result, list) else 1,
                            arguments=_safe_tool_arguments(arguments),
                        ))
                except Exception as exc:
                    if trace is not None:
                        trace.tool_calls.append(ToolCallTrace(
                            agent=agent, tool=name, duration_ms=_elapsed_ms(started), status="error",
                            arguments=_safe_tool_arguments(arguments), error=type(exc).__name__,
                        ))
                    raise
                messages.append({
                    "role": "tool", "tool_call_id": call["id"],
                    "content": json.dumps(result, ensure_ascii=False),
                })
        raise RuntimeError("Tool agent did not produce a final response.")

    def _chat(self, payload: dict[str, Any], agent: str, trace: RunTrace | None) -> dict[str, Any]:
        started = time.perf_counter()
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions", data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        for attempt in range(self.max_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    body = json.loads(response.read().decode("utf-8"))
                usage = body.get("usage", {})
                if trace is not None:
                    trace.llm_calls.append(LLMCallTrace(
                        agent=agent, model=self.model, duration_ms=_elapsed_ms(started),
                        prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
                        status="success",
                    ))
                return body
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                retryable = exc.code == 429 or 500 <= exc.code < 600
                if retryable and attempt < self.max_retries:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                self._record_error(trace, agent, started, f"HTTP {exc.code}: {detail}")
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                if attempt < self.max_retries:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                self._record_error(trace, agent, started, str(exc))
                raise
            except Exception as exc:
                self._record_error(trace, agent, started, str(exc))
                raise
        raise RuntimeError("unreachable")

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


def _default_max_tokens(agent: str) -> int:
    return {
        "user": 700,
        "constraint": 700,
        "adapter": 1400,
    }.get(agent, 900)


def _enable_thinking(model: str) -> bool:
    """Preview reasoning models require thinking to be explicitly enabled."""
    return model.endswith("-preview")


def _safe_tool_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
    allergens = arguments.get("excluded_allergens", [])
    return {
        "ingredient": str(arguments.get("ingredient", ""))[:80],
        "excluded_allergens": [str(value)[:40] for value in allergens[:12]] if isinstance(allergens, list) else [],
        "desired_taste": str(arguments.get("desired_taste", ""))[:80],
        "desired_texture": str(arguments.get("desired_texture", ""))[:80],
        "cooking_use": str(arguments.get("cooking_use", ""))[:80],
        "top_k": arguments.get("top_k"),
    }


def _parse_json_content(content: str) -> dict[str, Any]:
    """Accept a JSON object, including the common fenced form returned by compatible models."""
    text = str(content).strip()
    if not text:
        raise ValueError("Model returned empty content after tool execution.")
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].strip().lower() in {"```json", "```"}:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model response is not JSON: {text[:160]!r}") from exc
    # Some compatible tool endpoints wrap the final object in a one-item array.
    # Do not coerce operation arrays or multiple candidate objects.
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict):
        value = value[0]
    if not isinstance(value, dict):
        raise ValueError("Model response must be a JSON object.")
    return value
