from __future__ import annotations

import json
from dataclasses import asdict

from forkfit.api.schemas import CreatePostRequest
from forkfit.llm import LLMClient
from forkfit.models import Meal


def extract_post_details(
    request: CreatePostRequest,
    *,
    llm: LLMClient,
) -> CreatePostRequest:
    raw = llm.complete_json(
        agent="post_extraction",
        system=(
            "Extract structured recipe metadata from a community food post. "
            "Return only JSON with keys: theme, location, ingredients, "
            "equipment, cook_time_minutes, estimated_cost, tags, notes. "
            "Use the post language. Infer theme from meal occasion, taste, or style "
            "when possible. Use unknown only for location if no place is mentioned. "
            "Do not invent specific ingredients unless implied by title or description."
        ),
        user=json.dumps(
            {
                "title": request.title,
                "description": request.description,
                "existing": {
                    "theme": request.theme,
                    "location": request.location,
                    "recipe": asdict(request.recipe),
                },
            },
            ensure_ascii=False,
        ),
        max_tokens=600,
    )
    recipe = request.recipe
    return CreatePostRequest(
        title=request.title,
        theme=_clean_default(_string(raw.get("theme")), "community recipe")
        or request.theme,
        location=_string(raw.get("location")) or request.location,
        image_urls=request.image_urls,
        description=request.description,
        recipe=Meal(
            id=recipe.id,
            day=recipe.day,
            name=recipe.name,
            ingredients=_string_list(raw.get("ingredients")) or recipe.ingredients,
            equipment=_string_list(raw.get("equipment")),
            cook_time_minutes=_positive_int(raw.get("cook_time_minutes"))
            or recipe.cook_time_minutes,
            estimated_cost=_positive_float(raw.get("estimated_cost"))
            or recipe.estimated_cost,
            tags=_string_list(raw.get("tags")),
            notes=_string(raw.get("notes")),
            steps=list(recipe.steps),
            difficulty=recipe.difficulty,
        ),
    )


def _string(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _clean_default(value: str, default: str) -> str:
    return "" if value.strip().lower() == default else value


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _positive_int(value: object) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number if number > 0 else 0


def _positive_float(value: object) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    return number if number >= 0 else 0
