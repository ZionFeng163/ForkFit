from __future__ import annotations

from forkfit.knowledge.store import SubstitutionStore


TRUSTED_ENTRY_IDS = {
    "dairy_milk",
    "dairy_butter",
    "eggs_whole",
    "eggs_baking",
    "wheat_flour",
    "wheat_pasta",
    "soy_sauce",
    "peanut_butter",
    "shellfish_shrimp",
    "chicken",
    "beef",
}

INGREDIENT_LOOKUP_ALIASES = {
    "牛奶": "milk",
    "黄油": "butter",
    "鸡蛋": "egg",
    "蛋": "egg",
    "面粉": "wheat flour",
    "小麦面粉": "wheat flour",
    "意面": "wheat pasta",
    "酱油": "soy sauce",
    "生抽": "soy sauce",
    "老抽": "soy sauce",
    "花生": "peanut",
    "花生酱": "peanut butter",
    "虾": "shrimp",
    "虾仁": "shrimp",
}

ALLERGEN_ALIASES = {
    "花生": "peanuts",
    "peanut": "peanuts",
    "牛奶": "milk",
    "乳制品": "milk",
    "鸡蛋": "eggs",
    "egg": "eggs",
    "大豆": "soy",
    "黄豆": "soy",
    "小麦": "gluten",
    "麸质": "gluten",
    "虾": "shellfish",
    "虾仁": "shellfish",
}


def _canonical_allergen(value: str) -> str:
    normalized = value.lower().strip()
    return ALLERGEN_ALIASES.get(normalized, normalized)


class SubstitutionTool:
    """Tool for looking up ingredient substitutions from the knowledge base."""

    def __init__(self, store: SubstitutionStore, cache=None) -> None:
        self._store = store
        self._cache = cache

    def lookup(
        self,
        ingredient: str,
        exclude_allergens: list[str] | None = None,
        context: str = "",
    ) -> list[dict]:
        """
        Find suitable substitutes for an ingredient.

        Args:
            ingredient: The ingredient to find substitutes for
            exclude_allergens: Allergens to exclude from results
            context: Additional context (e.g., "for baking", "for curry")

        Returns:
            List of substitute suggestions with name, reason, ratio, etc.
        """
        # Check cache first
        if self._cache:
            cache_key = f"v2:{ingredient}:{','.join(sorted(exclude_allergens or []))}"
            cached = self._cache.get("substitution", cache_key)
            if cached is not None:
                return cached

        exclude = [_canonical_allergen(a) for a in (exclude_allergens or [])]
        lookup_ingredient = INGREDIENT_LOOKUP_ALIASES.get(ingredient.lower().strip(), ingredient)

        # 1. Try exact match first
        entry = self._store.get_by_ingredient(lookup_ingredient)
        if entry:
            results = []
            for sub in entry.substitutes:
                sub_allergens = set(a.lower() for a in sub.get("allergens_free", []))
                sub_name = sub["name"].lower()
                is_safe = all(allergen in sub_allergens for allergen in exclude)
                is_safe = is_safe and not any(allergen in sub_name for allergen in exclude)
                if is_safe:
                    results.append({
                        "original": entry.original,
                        "substitute": sub["name"],
                        "reason": sub.get("reason", ""),
                        "ratio": sub.get("ratio", "1:1"),
                        "taste_profile": sub.get("taste_profile", ""),
                        "category": sub.get("category", ""),
                        "source_entry": entry.id,
                        "approved": entry.id in TRUSTED_ENTRY_IDS,
                    })
            if results:
                if self._cache:
                    self._cache.set("substitution", f"v2:{ingredient}:{','.join(sorted(exclude))}", results, ttl=86400)
                return results

        # 2. Fall back to RAG semantic search
        query = lookup_ingredient
        if context:
            query = f"{ingredient} {context}"

        results = self._store.search(
            query=query,
            exclude_allergens=exclude,
            top_k=5,
        )
        for result in results:
            result["approved"] = result.get("source_entry") in TRUSTED_ENTRY_IDS
        if self._cache and results:
            self._cache.set("substitution", f"v2:{ingredient}:{','.join(sorted(exclude))}", results, ttl=3600)
        return results

    def get_substitution_context(
        self,
        ingredients: list[str],
        exclude_allergens: list[str] | None = None,
    ) -> str:
        """
        Pre-fetch substitution suggestions for a list of ingredients.
        Returns a formatted string to inject into the agent prompt.
        """
        exclude = [a.lower() for a in (exclude_allergens or [])]
        lines = []

        for ing in ingredients:
            results = self.lookup(ing, exclude_allergens=exclude)
            if results:
                subs = ", ".join(
                    f"{r['substitute']} ({r['ratio']})" for r in results[:3]
                )
                lines.append(f"- {ing} → {subs}")

        if not lines:
            return ""

        return "Ingredient substitution suggestions from knowledge base:\n" + "\n".join(lines)
