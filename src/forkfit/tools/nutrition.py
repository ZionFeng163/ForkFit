"""Structured nutrition query tool for agents."""
from __future__ import annotations

from forkfit.knowledge.nutrition_store import NutritionStore


class NutritionTool:
    """Provides nutrition info for prompt injection."""

    def __init__(self, store: NutritionStore) -> None:
        self._store = store

    def lookup(self, ingredient: str) -> dict | None:
        """Look up nutrition info for a single ingredient."""
        entry = self._store.lookup(ingredient)
        if not entry:
            return None
        return {
            "name": entry.name,
            "category": entry.category,
            "per_100g": entry.per_100g,
            "allergens": entry.allergens,
            "diet_rules": entry.diet_rules,
            "substitutes": entry.substitutes,
            "tips": entry.tips,
        }

    def get_nutrition_context(self, ingredients: list[str]) -> str:
        """Get formatted nutrition info for prompt injection."""
        return self._store.get_nutrition_context(ingredients)
