from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import Any

import numpy as np


class EmbeddingClient:
    """Call DashScope embedding API (text-embedding-v3)."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("BAILIAN_API_KEY")
        self.model = model or "text-embedding-v3"
        self.base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        if not self.api_key:
            raise ValueError("BAILIAN_API_KEY is required for embeddings.")

    def embed(self, texts: list[str], batch_size: int = 10) -> list[list[float]]:
        """Embed a list of texts, returns list of embedding vectors."""
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            # Truncate each text to 512 chars to avoid API limits
            truncated = [t[:512] for t in batch]
            payload = json.dumps({
                "model": self.model,
                "input": truncated,
                "dimensions": 512,
            }).encode("utf-8")

            req = urllib.request.Request(
                f"{self.base_url}/embeddings",
                data=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp = urllib.request.urlopen(req, timeout=30)
            body = json.loads(resp.read())
            for item in sorted(body["data"], key=lambda x: x["index"]):
                all_embeddings.append(item["embedding"])
        return all_embeddings

    def embed_single(self, text: str) -> list[float]:
        return self.embed([text])[0]


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))
