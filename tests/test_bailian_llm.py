import json
import unittest
from unittest.mock import patch

from forkfit.llm import BailianLLMClient


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


if __name__ == "__main__":
    unittest.main()
