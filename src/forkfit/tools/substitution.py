from __future__ import annotations

from forkfit.knowledge.store import SubstitutionStore


class SubstitutionTool:
    """Tool for looking up ingredient substitutions from the knowledge base."""

    def __init__(self, store: SubstitutionStore) -> None:
        self._store = store

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
        exclude = [a.lower() for a in (exclude_allergens or [])]

        # 1. Try exact match first
        entry = self._store.get_by_ingredient(ingredient)
        if entry:
            results = []
            for sub in entry.substitutes:
                sub_allergens = set(a.lower() for a in sub.get("allergens_free", []))
                sub_name = sub["name"].lower()
                is_safe = not any(a.lower() in sub_name for a in exclude)
                if is_safe:
                    results.append({
                        "original": entry.original,
                        "substitute": sub["name"],
                        "reason": sub.get("reason", ""),
                        "ratio": sub.get("ratio", "1:1"),
                        "taste_profile": sub.get("taste_profile", ""),
                        "category": sub.get("category", ""),
                    })
            if results:
                return results

        # 2. Fall back to RAG semantic search
        query = ingredient
        if context:
            query = f"{ingredient} {context}"

        return self._store.search(
            query=query,
            exclude_allergens=exclude,
            top_k=5,
        )

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
