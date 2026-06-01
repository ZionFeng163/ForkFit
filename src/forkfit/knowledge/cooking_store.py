"""Knowledge store for cooking method step templates."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .embeddings import EmbeddingClient, cosine_similarity

_CACHE_DIR = Path(__file__).parent / ".cache"


@dataclass
class CookingMethodEntry:
    id: str
    method: str
    aliases: list[str]
    equipment: list[str]
    tags: list[str]
    steps_template: list[str]
    tips: str = ""
    _text: str = ""

    def searchable_text(self) -> str:
        if not self._text:
            parts = [self.method, *self.aliases, *self.equipment, *self.tags, self.tips]
            self._text = " ".join(parts).lower()
        return self._text


class CookingStepsStore:
    """RAG-backed store for cooking method step templates."""

    def __init__(self) -> None:
        self._entries: list[CookingMethodEntry] = []
        self._embeddings: np.ndarray | None = None
        self._texts: list[str] = []
        self._loaded = False
        self._client: EmbeddingClient | None = None

    def load(self, client: EmbeddingClient | None = None) -> None:
        if self._loaded:
            return
        self._client = client or EmbeddingClient()
        kb_path = Path(__file__).parent / "cooking_methods.json"
        with open(kb_path) as f:
            raw = json.load(f)

        self._entries = []
        self._texts = []
        for item in raw:
            entry = CookingMethodEntry(
                id=item["id"],
                method=item["method"],
                aliases=item.get("aliases", []),
                equipment=item.get("equipment", []),
                tags=item.get("tags", []),
                steps_template=item.get("steps_template", []),
                tips=item.get("tips", ""),
            )
            self._entries.append(entry)
            self._texts.append(entry.searchable_text())

        kb_hash = hashlib.md5(json.dumps(raw, sort_keys=True).encode()).hexdigest()
        cache_file = _CACHE_DIR / f"cooking_embeddings_{kb_hash}.npy"
        if cache_file.exists():
            self._embeddings = np.load(cache_file)
        else:
            self._embeddings = np.array(self._client.embed(self._texts))
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)
            np.save(cache_file, self._embeddings)
        self._loaded = True

    def search(self, query: str, top_k: int = 3) -> list[dict]:
        if not self._loaded:
            self.load()
        query_vec = np.array(self._client.embed_single(query.lower()))
        scores = [
            (i, cosine_similarity(query_vec, self._embeddings[i]))
            for i in range(len(self._entries))
        ]
        ranked = sorted(scores, key=lambda x: x[1], reverse=True)
        results = []
        for idx, score in ranked[:top_k]:
            entry = self._entries[idx]
            results.append({
                "method": entry.method,
                "steps_template": entry.steps_template,
                "tips": entry.tips,
                "equipment": entry.equipment,
                "score": float(score),
            })
        return results
