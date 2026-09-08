from __future__ import annotations

from forkfit.knowledge.store import SubstitutionStore


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
        desired_taste: str = "",
        desired_texture: str = "",
        cooking_use: str = "",
        top_k: int = 5,
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
        if not isinstance(ingredient, str) or not ingredient.strip() or len(ingredient.strip()) > 120:
            raise ValueError("ingredient is required")
        ingredient = ingredient.strip()
        top_k = int(top_k)
        if not 1 <= top_k <= 5:
            raise ValueError("top_k must be between 1 and 5")
        if not isinstance(exclude_allergens or [], list) or len(exclude_allergens or []) > 12:
            raise ValueError("excluded_allergens must contain at most 12 items")
        for value in (desired_taste, desired_texture, cooking_use):
            if not isinstance(value, str) or len(value) > 80:
                raise ValueError("taste, texture and cooking use must be strings up to 80 characters")
        exclude = [_canonical_allergen(str(a)) for a in (exclude_allergens or [])]
        lookup_ingredient = INGREDIENT_LOOKUP_ALIASES.get(ingredient.lower(), ingredient)
        query_parts = [lookup_ingredient, desired_taste, desired_texture, cooking_use, context]
        query = " ".join(part.strip() for part in query_parts if part and part.strip())[:500]
        cache_key = ":".join([
            "v3", lookup_ingredient, ",".join(sorted(exclude)), desired_taste.strip(),
            desired_texture.strip(), cooking_use.strip(), str(top_k),
        ])
        if self._cache:
            cached = self._cache.get("substitution", cache_key)
            if cached is not None:
                return cached
        results = self._store.search(
            query=query,
            exclude_allergens=exclude,
            ingredient=lookup_ingredient,
            desired_taste=desired_taste,
            desired_texture=desired_texture,
            cooking_use=cooking_use,
            top_k=top_k,
        )
        if self._cache and results:
            self._cache.set("substitution", cache_key, results, ttl=3600)
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
