from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from forkfit.knowledge.embeddings import EmbeddingClient, cosine_similarity

_CACHE_DIR = Path(__file__).parent / ".cache"


@dataclass
class SubstitutionEntry:
    id: str
    original: str
    aliases: list[str]
    common_allergens: list[str]
    tags: list[str]
    substitutes: list[dict[str, str]]
    _text: str = ""

    def searchable_text(self) -> str:
        parts = [self.original] + self.aliases + self.tags
        for sub in self.substitutes:
            parts.append(sub.get("name", ""))
            parts.append(sub.get("reason", ""))
            parts.append(sub.get("category", ""))
        return " ".join(parts).lower()


class SubstitutionStore:
    """Knowledge base with RAG search for ingredient substitutions."""

    def __init__(self) -> None:
        self._entries: list[SubstitutionEntry] = []
        self._embeddings: np.ndarray | None = None
        self._texts: list[str] = []
        self._client: EmbeddingClient | None = None
        self._loaded = False

    def load(self, client: EmbeddingClient | None = None) -> None:
        if self._loaded:
            return
        self._client = client or EmbeddingClient()

        kb_path = Path(__file__).parent / "substitutions.json"
        with open(kb_path) as f:
            raw = json.load(f)

        self._entries = []
        self._texts = []
        for item in raw:
            entry = SubstitutionEntry(
                id=item["id"],
                original=item["original"],
                aliases=item.get("aliases", []),
                common_allergens=item.get("common_allergens", []),
                tags=item.get("tags", []),
                substitutes=item.get("substitutes", []),
            )
            self._entries.append(entry)
            self._texts.append(entry.searchable_text())

        # Check cache
        kb_hash = hashlib.md5(json.dumps(raw, sort_keys=True).encode()).hexdigest()
        cache_file = _CACHE_DIR / f"embeddings_{kb_hash}.npy"

        if cache_file.exists():
            self._embeddings = np.load(cache_file)
        else:
            self._embeddings = np.array(self._client.embed(self._texts))
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)
            np.save(cache_file, self._embeddings)

        self._loaded = True

    def get_by_ingredient(self, ingredient: str) -> SubstitutionEntry | None:
        """Exact match lookup by ingredient name."""
        term = ingredient.lower().strip()
        for entry in self._entries:
            if term == entry.original.lower():
                return entry
            for alias in entry.aliases:
                if term == alias.lower():
                    return entry
        return None

    def search(
        self,
        query: str,
        exclude_allergens: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        """Semantic search + allergen filtering. Returns ranked substitutes."""
        if not self._loaded:
            self.load()

        # Embed the query
        query_vec = np.array(self._client.embed_single(query))

        # Compute similarities
        scores = [
            (i, cosine_similarity(query_vec, self._embeddings[i]))
            for i in range(len(self._entries))
        ]
        scores.sort(key=lambda x: x[1], reverse=True)

        exclude = set(a.lower() for a in (exclude_allergens or []))
        results = []

        for idx, score in scores[:top_k * 3]:  # fetch extra for filtering
            entry = self._entries[idx]
            for sub in entry.substitutes:
                sub_allergens = set(a.lower() for a in sub.get("allergens_free", []))
                # Check if substitute is safe (its allergens_free doesn't include excluded allergens)
                is_safe = not exclude.intersection(sub_allergens)
                # Also check if the substitute itself doesn't contain excluded allergens
                sub_name_lower = sub["name"].lower()
                is_not_excluded = not any(a.lower() in sub_name_lower for a in exclude)

                if is_safe and is_not_excluded:
                    results.append({
                        "original": entry.original,
                        "substitute": sub["name"],
                        "reason": sub.get("reason", ""),
                        "ratio": sub.get("ratio", "1:1"),
                        "taste_profile": sub.get("taste_profile", ""),
                        "category": sub.get("category", ""),
                        "score": round(score, 3),
                        "source_entry": entry.id,
                    })
                    if len(results) >= top_k:
                        return results

        return results
