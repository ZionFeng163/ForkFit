"""Structured nutrition knowledge store — query-based, not RAG."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class NutritionEntry:
    id: str
    name: str
    aliases: list[str]
    category: str
    per_100g: dict
    allergens: list[str]
    diet_rules: list[str]
    substitutes: list[str]
    tips: str


class NutritionStore:
    """Structured nutrition store for exact-match lookups."""

    def __init__(self) -> None:
        self._entries: list[NutritionEntry] = []
        self._by_id: dict[str, NutritionEntry] = {}
        self._by_name: dict[str, NutritionEntry] = {}
        self._loaded = False

    def load(self) -> None:
        if self._loaded:
            return
        kb_path = Path(__file__).parent / "nutrition.json"
        with open(kb_path) as f:
            raw = json.load(f)
        for item in raw:
            entry = NutritionEntry(
                id=item["id"],
                name=item["name"],
                aliases=item.get("aliases", []),
                category=item.get("category", ""),
                per_100g=item.get("per_100g", {}),
                allergens=item.get("allergens", []),
                diet_rules=item.get("diet_rules", []),
                substitutes=item.get("substitutes", []),
                tips=item.get("tips", ""),
            )
            self._entries.append(entry)
            self._by_id[entry.id] = entry
            self._by_name[entry.name.lower()] = entry
            for alias in entry.aliases:
                self._by_name[alias.lower()] = entry
        self._loaded = True

    def lookup(self, ingredient: str) -> NutritionEntry | None:
        """Exact match lookup by name or alias."""
        self.load()
        return self._by_name.get(ingredient.lower().strip())

    def get_nutrition_context(self, ingredients: list[str]) -> str:
        """Get formatted nutrition info for a list of ingredients."""
        self.load()
        lines = ["Nutrition information per 100g:"]
        for ing in ingredients:
            entry = self.lookup(ing)
            if entry:
                p = entry.per_100g
                lines.append(
                    f"- {entry.name}: {p.get('calories', '?')} kcal, "
                    f"protein {p.get('protein_g', '?')}g, "
                    f"fat {p.get('fat_g', '?')}g, "
                    f"carbs {p.get('carbs_g', '?')}g, "
                    f"fiber {p.get('fiber_g', '?')}g"
                )
                if entry.allergens:
                    lines.append(f"  Allergens: {', '.join(entry.allergens)}")
        return "\n".join(lines) if len(lines) > 1 else "No nutrition data found."
