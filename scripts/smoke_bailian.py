from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    load_env(Path(".env"))
    api_key = os.environ.get("BAILIAN_API_KEY")
    model = os.environ.get("BAILIAN_MODEL", "qwen3.6-flash")
    base_url = os.environ.get(
        "BAILIAN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).rstrip("/")

    if not api_key:
        print("BAILIAN_API_KEY is missing. Add it to .env first.", file=sys.stderr)
        return 2

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a strict JSON generator. Return only JSON.",
            },
            {
                "role": "user",
                "content": 'Return {"ok": true, "model_seen": "<model>"} and replace <model> with your model name if known.',
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {detail}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1

    message = body["choices"][0]["message"]["content"]
    print("Bailian smoke test succeeded.")
    print("model:", model)
    print("response:", message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
