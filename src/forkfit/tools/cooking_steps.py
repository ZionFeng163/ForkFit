"""Tool for looking up cooking step templates from the knowledge base."""
from __future__ import annotations

from forkfit.knowledge.cooking_store import CookingStepsStore


class CookingStepsTool:
    """Provides cooking step templates from the knowledge base."""

    def __init__(self, store: CookingStepsStore, cache=None) -> None:
        self._store = store
        self._cache = cache

    def lookup(self, meal_name: str, ingredients: list[str], equipment: list[str]) -> list[dict]:
        """Look up step templates for a meal based on its name, ingredients, and equipment."""
        # Check cache
        if self._cache:
            cache_key = f"{meal_name}:{','.join(sorted(ingredients[:5]))}"
            cached = self._cache.get("cooking_steps", cache_key)
            if cached is not None:
                return cached

        query = f"{meal_name} {' '.join(ingredients)} {' '.join(equipment)}"
        results = self._store.search(query, top_k=2)

        if self._cache and results:
            self._cache.set("cooking_steps", cache_key, results, ttl=86400)
        return results

    def get_steps_context(self, meals: list[dict]) -> str:
        """Pre-fetch step templates for all meals. Returns formatted context string."""
        lines = ["Cooking method step templates from knowledge base:"]
        for meal in meals:
            results = self.lookup(
                meal.get("name", ""),
                meal.get("ingredients", []),
                meal.get("equipment", []),
            )
            if results:
                best = results[0]
                lines.append(
                    f"- {meal.get('name', '?')} → method: {best['method']} "
                    f"(score: {best['score']:.2f})"
                )
                for i, step in enumerate(best["steps_template"], 1):
                    lines.append(f"  {i}. {step}")
                if best["tips"]:
                    lines.append(f"  Tip: {best['tips']}")
        return "\n".join(lines)
