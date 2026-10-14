from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

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
        self._candidates: list[dict] = []
        self._client: EmbeddingClient | None = None
        self._loaded = False
        self._embedding_lock = Lock()

    def load(self, client: EmbeddingClient | None = None) -> None:
        if self._loaded:
            return
        self._client = client

        kb_path = Path(__file__).parent / "substitutions.json"
        with open(kb_path) as f:
            raw = json.load(f)

        self._entries = []
        self._texts = []
        self._candidates = []
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
            for substitute in entry.substitutes:
                candidate = {
                    "original": entry.original,
                    "aliases": list(entry.aliases),
                    "tags": list(entry.tags),
                    "common_allergens": list(entry.common_allergens),
                    "substitute": substitute.get("name", ""),
                    "reason": substitute.get("reason", ""),
                    "ratio": substitute.get("ratio", "1:1"),
                    "taste_profile": substitute.get("taste_profile", ""),
                    "category": substitute.get("category", ""),
                    "allergens_free": list(substitute.get("allergens_free", [])),
                    "source_entry": entry.id,
                }
                text = " ".join([
                    entry.original, *entry.aliases, *entry.tags,
                    candidate["substitute"], candidate["reason"],
                    candidate["taste_profile"], candidate["category"],
                ]).lower()
                candidate["searchable_text"] = text
                self._candidates.append(candidate)
                self._texts.append(text)

        self._loaded = True

    def _ensure_embeddings(self) -> None:
        # Exact ingredient lookups need neither credentials nor an embedding request.
        with self._embedding_lock:
            if self._embeddings is not None:
                return
            self._client = self._client or EmbeddingClient()
            digest = hashlib.sha256(json.dumps([self._client.model, self._texts]).encode()).hexdigest()
            cache_file = _CACHE_DIR / f"embeddings_{digest}.npy"
            if cache_file.exists():
                self._embeddings = np.load(cache_file)
            else:
                self._embeddings = np.array(self._client.embed(self._texts))
                try:
                    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
                    np.save(cache_file, self._embeddings)
                except OSError:
                    # Read-only source mounts must not make retrieval unavailable.
                    pass

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
        ingredient: str = "",
        desired_taste: str = "",
        desired_texture: str = "",
        cooking_use: str = "",
        top_k: int = 5,
    ) -> list[dict]:
        """Use local exact matches; rank fuzzy candidates only after allergen filtering."""
        if not self._loaded:
            self.load()
        top_k = max(1, min(5, int(top_k)))
        term = ingredient.lower().strip()
        exact = [i for i, candidate in enumerate(self._candidates)
                 if term and term in {candidate["original"].lower(), *(alias.lower() for alias in candidate["aliases"])}]
        exclude = {a.lower() for a in (exclude_allergens or [])}
        eligible = [i for i in (exact if exact else range(len(self._candidates)))
                    if exclude.issubset({a.lower() for a in self._candidates[i]["allergens_free"]})
                    and not any(a in self._candidates[i]["substitute"].lower() for a in exclude)]
        if not eligible:
            return []
        terms = [value.lower().strip() for value in (
            ingredient, desired_taste, desired_texture, cooking_use
        ) if value.strip()]
        keyword_scores: list[tuple[int, float]] = []
        for index in eligible:
            candidate = self._candidates[index]
            text = candidate["searchable_text"]
            aliases = {alias.lower() for alias in candidate["aliases"]}
            score = sum(3.0 if term == candidate["original"].lower() or term in aliases else 1.0
                        for term in terms if term and term in text)
            if score > 0:
                keyword_scores.append((index, score))
        keyword_scores.sort(key=lambda item: item[1], reverse=True)
        keyword_rank = {index: rank for rank, (index, _score) in enumerate(keyword_scores, 1)}
        vector_rank = {}
        if not exact:
            self._ensure_embeddings()
            query_vec = np.array(self._client.embed_single(query))
            vector_scores = sorted(
                ((i, cosine_similarity(query_vec, self._embeddings[i])) for i in eligible),
                key=lambda item: item[1], reverse=True,
            )
            vector_rank = {index: rank for rank, (index, _score) in enumerate(vector_scores, 1)}
        fused = []
        for index in eligible:
            score = 1 / (60 + vector_rank[index]) if index in vector_rank else 0
            if index in keyword_rank:
                score += 1 / (60 + keyword_rank[index])
            fused.append((index, score))
        fused.sort(key=lambda item: item[1], reverse=True)
        results = []
        for index, score in fused:
            candidate = self._candidates[index]
            results.append({
                key: candidate[key] for key in (
                    "original", "substitute", "reason", "ratio",
                    "taste_profile", "category", "source_entry"
                )
            } | {"score": round(score, 5)})
            if len(results) >= top_k:
                break
        return results
