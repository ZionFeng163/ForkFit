"""Database query tool for agents to access user cooking history."""
from __future__ import annotations

from forkfit.stores.posts import PostgresPostStore


class DBQueryTool:
    """Provides formatted user cooking history for agent prompt injection."""

    def __init__(self, post_store: PostgresPostStore) -> None:
        self._post_store = post_store

    def get_user_cooking_history(self, user_id: str, limit: int = 20) -> str:
        """Get formatted cooking history for a user: their posts, liked posts, saved posts."""
        lines = []

        # User's own posts
        own_posts, own_count = self._post_store.list_posts_by_user(user_id, limit=limit)
        if own_posts:
            lines.append(f"User's own recipes ({own_count} total):")
            for post in own_posts:
                recipe = post.recipe
                ingredients = ", ".join(recipe.ingredients[:5])
                lines.append(
                    f"- {post.title} | ingredients: {ingredients} | "
                    f"tags: {', '.join(recipe.tags)} | "
                    f"cost: ${recipe.estimated_cost} | "
                    f"time: {recipe.cook_time_minutes}min"
                )

        # Liked posts
        liked_posts, liked_count = self._post_store.list_liked_posts(user_id, limit=limit)
        if liked_posts:
            lines.append(f"\nUser liked recipes ({liked_count} total):")
            for post in liked_posts:
                recipe = post.recipe
                ingredients = ", ".join(recipe.ingredients[:5])
                lines.append(
                    f"- {post.title} | ingredients: {ingredients} | "
                    f"tags: {', '.join(recipe.tags)} | "
                    f"by {post.author}"
                )

        # Saved posts
        saved_posts, saved_count = self._post_store.list_saved_posts(user_id, limit=limit)
        if saved_posts:
            lines.append(f"\nUser saved/bookmarked recipes ({saved_count} total):")
            for post in saved_posts:
                recipe = post.recipe
                ingredients = ", ".join(recipe.ingredients[:5])
                lines.append(
                    f"- {post.title} | ingredients: {ingredients} | "
                    f"tags: {', '.join(recipe.tags)} | "
                    f"by {post.author}"
                )

        if not lines:
            return "No cooking history found for this user."

        return "\n".join(lines)
