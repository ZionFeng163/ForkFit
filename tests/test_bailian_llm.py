import json
import unittest
import urllib.error
from unittest.mock import patch

from forkfit.llm import BailianLLMClient, FunctionTool


class _Response:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return json.dumps(
            {
                "choices": [{"message": {"content": "{\"ok\": true}"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            }
        ).encode("utf-8")


class BailianLLMClientTests(unittest.TestCase):
    def test_single_object_wrapper_is_normalized_but_multiple_objects_are_rejected(self):
        from forkfit.llm import _parse_json_content
        self.assertEqual(_parse_json_content('[{"operations": []}]'), {"operations": []})
        for value in ('[]', '[{}, {}]', '["not an object"]'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                _parse_json_content(value)

    def test_complete_json_accepts_fenced_object(self):
        class FencedResponse(_Response):
            def read(self):
                return json.dumps({"choices": [{"message": {"content": "```json\n{\"ok\": true}\n```"}}], "usage": {}}).encode()
        client = BailianLLMClient(api_key="test", model="deepseek-v4-flash-0731", base_url="https://example.test/v1")
        with patch("urllib.request.urlopen", return_value=FencedResponse()):
            self.assertEqual(client.complete_json(agent="test", system="s", user="u"), {"ok": True})

    def test_complete_json_disables_thinking_and_caps_tokens(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            captured["timeout"] = timeout
            return _Response()

        client = BailianLLMClient(
            api_key="test-key",
            model="qwen3.6-flash",
            base_url="https://example.test/v1",
            timeout_seconds=12,
        )

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = client.complete_json(
                agent="adapter",
                system="Return JSON.",
                user="{\"task\":\"test\"}",
                max_tokens=321,
            )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(captured["timeout"], 12)
        self.assertEqual(captured["payload"]["max_tokens"], 321)
        self.assertIs(captured["payload"]["enable_thinking"], False)
        self.assertEqual(
            captured["payload"]["response_format"],
            {"type": "json_object"},
        )

    def test_function_call_loop_executes_registered_tool_then_returns_json(self):
        responses = [
            {"choices": [{"message": {"content": None, "tool_calls": [{"id": "call-1", "type": "function", "function": {"name": "search_substitutions", "arguments": "{\"ingredient\":\"花生酱\"}"}}]}}], "usage": {}},
            {"choices": [{"message": {"content": "{\"operations\":[]}"}}], "usage": {}},
        ]
        captured = []

        class Response:
            def __init__(self, body): self.body = body
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return json.dumps(self.body, ensure_ascii=False).encode()

        def fake_urlopen(request, timeout):
            captured.append(json.loads(request.data.decode()))
            return Response(responses.pop(0))

        client = BailianLLMClient(api_key="test", model="deepseek-v4-flash-0731", base_url="https://example.test/v1")
        tool = FunctionTool("search_substitutions", "test", {"type": "object", "properties": {"ingredient": {"type": "string"}}}, lambda args: [{"substitute": "葵花籽酱"}])
        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = client.complete_with_tools(agent="recipe_adapter", system="s", user="u", tools=[tool])
        self.assertEqual(result.output, {"operations": []})
        self.assertEqual(result.tool_outputs[0]["result"][0]["substitute"], "葵花籽酱")
        self.assertEqual(captured[1]["messages"][-1]["role"], "tool")

    def test_transient_network_error_is_retried_once(self):
        client = BailianLLMClient(
            api_key="test", model="deepseek-v4-flash-0731",
            base_url="https://example.test/v1", max_retries=1,
        )
        with patch("urllib.request.urlopen", side_effect=[urllib.error.URLError("temporary"), _Response()]) as mocked:
            result = client.complete_json(agent="test", system="s", user="u")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(mocked.call_count, 2)

    def test_last_tool_turn_forces_final_json(self):
        responses = [
            {"choices": [{"message": {"content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "lookup", "arguments": "{}"}}]}}], "usage": {}},
            {"choices": [{"message": {"content": None, "tool_calls": [{"id": "c2", "type": "function", "function": {"name": "lookup", "arguments": "{}"}}]}}], "usage": {}},
            {"choices": [{"message": {"content": "{\"operations\":[]}"}}], "usage": {}},
        ]
        payloads = []

        class Response:
            def __init__(self, body): self.body = body
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return json.dumps(self.body).encode()

        def fake_urlopen(request, timeout):
            payloads.append(json.loads(request.data.decode()))
            return Response(responses.pop(0))

        client = BailianLLMClient(api_key="test", model="deepseek-v4-flash-0731", base_url="https://example.test/v1")
        tool = FunctionTool("lookup", "test", {"type": "object", "properties": {}}, lambda _args: [])
        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = client.complete_with_tools(agent="recipe_adapter", system="s", user="u", tools=[tool], max_turns=3, require_tool=True)
        self.assertEqual(result.output, {"operations": []})
        self.assertEqual([item["tool_choice"] for item in payloads], ["required", "auto", "none"])


if __name__ == "__main__":
    unittest.main()
