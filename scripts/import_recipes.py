#!/usr/bin/env python3
"""Import curated recipe JSON into ForkFit posts.

The importer is intentionally conservative: it validates content quality before
writing anything, supports dry-run by default, and upserts by stable recipe id.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from forkfit.config import get_settings, load_env
from forkfit.db.session import make_session_factory
from forkfit.models import Meal
from forkfit.stores.posts import PostgresPostStore, PostStatus


@dataclass(frozen=True, slots=True)
class ImportRecipe:
    post_id: str
    title: str
    theme: str
    location: str
    image_urls: list[str]
    description: str
    recipe: Meal
    source_name: str
    source_url: str
    status: PostStatus = "published"
    saves: int = 0
    likes: int = 0
    forks: int = 0


def main() -> int:
    args = parse_args()
    paths = expand_sources(args.source)
    recipes, errors = load_recipes(paths)
    if errors:
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        return 2

    duplicate_ids = sorted(_duplicates([recipe.post_id for recipe in recipes]))
    if duplicate_ids:
        for post_id in duplicate_ids:
            print(f"ERROR duplicate recipe id in source: {post_id}", file=sys.stderr)
        return 2

    print(f"Loaded {len(recipes)} recipes from {len(paths)} file(s).")
    if args.dry_run or not args.apply:
        print("Dry run only; database was not modified.")
        return 0

    load_env()
    database_url = args.database_url or get_settings().database_url
    store = PostgresPostStore(make_session_factory(database_url))
    existing = store.count_matching_import_ids([recipe.post_id for recipe in recipes])
    for recipe in recipes:
        store.upsert_imported_post(
            post_id=recipe.post_id,
            user_id=args.user_id,
            author=args.author,
            title=recipe.title,
            theme=recipe.theme,
            location=recipe.location,
            image_urls=recipe.image_urls,
            description=recipe.description,
            recipe=recipe.recipe,
            status=recipe.status,
            source_name=recipe.source_name,
            source_url=recipe.source_url,
            saves=recipe.saves,
            likes=recipe.likes,
            forks=recipe.forks,
        )

    print(
        f"Applied {len(recipes)} recipes. "
        f"Existing ids before import: {existing}; new ids: {len(recipes) - existing}."
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import curated ForkFit recipes.")
    parser.add_argument(
        "--source",
        action="append",
        required=True,
        help="JSON file or glob. Can be passed multiple times.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate without writing.")
    parser.add_argument("--apply", action="store_true", help="Write validated recipes.")
    parser.add_argument("--database-url", default="", help="Override DATABASE_URL.")
    parser.add_argument("--user-id", default="seed_public_beta", help="Author user id.")
    parser.add_argument("--author", default="ForkFit 编辑部", help="Author display name.")
    args = parser.parse_args()
    if args.dry_run and args.apply:
        parser.error("--dry-run and --apply cannot be used together")
    if not args.dry_run and not args.apply:
        args.dry_run = True
    return args


def expand_sources(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        matches = sorted(glob.glob(pattern))
        if not matches:
            raise SystemExit(f"No files matched --source {pattern!r}")
        paths.extend(Path(match) for match in matches)
    return paths


def load_recipes(paths: list[Path]) -> tuple[list[ImportRecipe], list[str]]:
    recipes: list[ImportRecipe] = []
    errors: list[str] = []
    for path in paths:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"{path}: cannot read JSON: {exc}")
            continue

        items = raw.get("recipes") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            errors.append(f"{path}: expected a list or an object with recipes[]")
            continue

        for index, item in enumerate(items):
            try:
                recipes.append(parse_recipe(item))
            except ValueError as exc:
                errors.append(f"{path}#{index + 1}: {exc}")
    return recipes, errors


def parse_recipe(item: Any) -> ImportRecipe:
    if not isinstance(item, dict):
        raise ValueError("recipe item must be an object")

    recipe_payload = _required_dict(item, "recipe")
    recipe = Meal(
        id=str(recipe_payload.get("id") or item.get("id") or "main"),
        day=str(recipe_payload.get("day") or "post"),
        name=_required_str(recipe_payload, "name"),
        ingredients=_required_str_list(recipe_payload, "ingredients", min_items=1),
        equipment=_str_list(recipe_payload.get("equipment", [])),
        cook_time_minutes=int(recipe_payload.get("cook_time_minutes") or 0),
        estimated_cost=float(recipe_payload.get("estimated_cost") or 0),
        tags=_str_list(recipe_payload.get("tags", [])),
        notes=str(recipe_payload.get("notes") or ""),
        steps=_required_str_list(recipe_payload, "steps", min_items=1),
        difficulty=str(recipe_payload.get("difficulty") or "easy"),
    )
    if recipe.cook_time_minutes <= 0:
        raise ValueError("recipe.cook_time_minutes must be positive")
    if recipe.estimated_cost <= 0:
        raise ValueError("recipe.estimated_cost must be positive")

    post_id = _required_str(item, "id")
    image_urls = _required_str_list(item, "image_urls", min_items=1)
    source_name = _required_str(item, "source_name")
    source_url = _required_str(item, "source_url")
    status = str(item.get("status") or "published")
    if status not in {"draft", "published", "hidden"}:
        raise ValueError("status must be draft, published, or hidden")

    return ImportRecipe(
        post_id=post_id,
        title=_required_str(item, "title"),
        theme=_required_str(item, "theme"),
        location=str(item.get("location") or "ForkFit"),
        image_urls=image_urls,
        description=_required_str(item, "description"),
        recipe=recipe,
        source_name=source_name,
        source_url=source_url,
        status=status,  # type: ignore[arg-type]
        saves=int(item.get("saves") or 0),
        likes=int(item.get("likes") or 0),
        forks=int(item.get("forks") or 0),
    )


def _required_str(item: dict[str, Any], key: str) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required")
    return value.strip()


def _required_dict(item: dict[str, Any], key: str) -> dict[str, Any]:
    value = item.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"{key} must be an object")
    return value


def _required_str_list(item: dict[str, Any], key: str, *, min_items: int) -> list[str]:
    values = _str_list(item.get(key))
    if len(values) < min_items:
        raise ValueError(f"{key} must include at least {min_items} item(s)")
    return values


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _duplicates(values: list[str]) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


if __name__ == "__main__":
    raise SystemExit(main())
