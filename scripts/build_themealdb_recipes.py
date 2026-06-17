#!/usr/bin/env python3
"""Build a matched recipe/image dataset from TheMealDB.

Each generated post uses the meal image returned by the same TheMealDB meal
record as its recipe instructions. This avoids the unreliable stock-photo
pairing problem that made the previous public beta seed data feel fake.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


API_BASE = "https://www.themealdb.com/api/json/v1/1"
SOURCE_NAME = "TheMealDB matched recipe and image"
DEFAULT_OUTPUT = Path("data/recipes/themealdb_recipes.json")
DEFAULT_IMAGE_DIR = Path("apps/web/public/recipes/themealdb")


def main() -> int:
    args = parse_args()
    meals = collect_meals(limit=args.limit, sleep_seconds=args.sleep)
    recipes = []
    args.image_dir.mkdir(parents=True, exist_ok=True)
    for index, meal in enumerate(meals, start=1):
        image_url = meal.get("strMealThumb") or ""
        if args.image_mode == "download":
            image = download_meal_image(
                meal_id=meal["idMeal"],
                image_url=image_url,
                image_dir=args.image_dir,
                overwrite=args.overwrite_images,
            )
        else:
            image = image_url
        recipes.append(to_import_recipe(meal, index, image))
        if index % 10 == 0 or index == len(meals):
            print(f"Prepared {index}/{len(meals)} recipes", flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"recipes": recipes}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(recipes)} matched recipes to {args.output}")
    if args.image_mode == "download":
        print(f"Downloaded images to {args.image_dir}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build TheMealDB matched recipe seed data.")
    parser.add_argument("--limit", type=int, default=120, help="Number of meals to collect.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--image-dir", type=Path, default=DEFAULT_IMAGE_DIR)
    parser.add_argument(
        "--image-mode",
        choices=("remote", "download"),
        default="remote",
        help="Use TheMealDB image URLs directly or download matched images locally.",
    )
    parser.add_argument("--sleep", type=float, default=0.08, help="Delay between API calls.")
    parser.add_argument("--overwrite-images", action="store_true")
    return parser.parse_args()


def collect_meals(*, limit: int, sleep_seconds: float) -> list[dict[str, Any]]:
    categories = [
        item["strCategory"]
        for item in fetch_json(f"{API_BASE}/categories.php")["categories"]
    ]
    category_meals: dict[str, list[dict[str, Any]]] = {}
    for category in categories:
        url = f"{API_BASE}/filter.php?{urllib.parse.urlencode({'c': category})}"
        payload = fetch_json(url)
        category_meals[category] = payload.get("meals") or []

    summaries: list[dict[str, Any]] = []
    seen: set[str] = set()
    cursor = 0
    while len(summaries) < limit * 2:
        progressed = False
        for category in categories:
            meals = category_meals.get(category) or []
            if cursor >= len(meals):
                continue
            meal = meals[cursor]
            meal_id = meal["idMeal"]
            if meal_id not in seen:
                summaries.append(meal)
                seen.add(meal_id)
                progressed = True
            if len(summaries) >= limit * 2:
                break
        if not progressed:
            break
        cursor += 1

    details: list[dict[str, Any]] = []
    for summary in summaries:
        meal_id = summary["idMeal"]
        payload = fetch_json(f"{API_BASE}/lookup.php?{urllib.parse.urlencode({'i': meal_id})}")
        meal = (payload.get("meals") or [None])[0]
        if meal and is_usable_meal(meal):
            details.append(meal)
            if len(details) % 20 == 0:
                print(f"Fetched {len(details)}/{limit} meal records", flush=True)
        if len(details) >= limit:
            break
        time.sleep(sleep_seconds)
    return details


def is_usable_meal(meal: dict[str, Any]) -> bool:
    return bool(
        meal.get("idMeal")
        and meal.get("strMeal")
        and meal.get("strMealThumb")
        and meal.get("strInstructions")
        and extract_ingredients(meal)
        and len(split_steps(meal["strInstructions"])) >= 3
    )


def fetch_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def download_meal_image(
    *, meal_id: str, image_url: str, image_dir: Path, overwrite: bool
) -> str:
    target = image_dir / f"{meal_id}.jpg"
    if target.exists() and not overwrite:
        return f"/recipes/themealdb/{target.name}"
    source_url = f"{image_url}/medium" if image_url else image_url
    try:
        with urllib.request.urlopen(source_url, timeout=30) as response:
            data = response.read()
    except urllib.error.HTTPError:
        with urllib.request.urlopen(image_url, timeout=30) as response:
            data = response.read()
    if not data:
        raise RuntimeError(f"Empty image response for meal {meal_id}")
    target.write_bytes(data)
    return f"/recipes/themealdb/{target.name}"


def to_import_recipe(meal: dict[str, Any], index: int, local_image: str) -> dict[str, Any]:
    meal_id = meal["idMeal"]
    title = clean_text(meal["strMeal"])
    category = clean_text(meal.get("strCategory") or "Meal")
    area = clean_text(meal.get("strArea") or "Global")
    ingredients = extract_ingredients(meal)
    steps = split_steps(meal["strInstructions"])
    tags = infer_tags(meal, steps)
    cook_time = infer_cook_time(category, steps)
    return {
        "id": f"themealdb-{meal_id}",
        "title": title,
        "theme": category,
        "location": area,
        "image_urls": [local_image],
        "description": f"{title} from TheMealDB. Recipe and image are imported from the same source meal record.",
        "source_name": SOURCE_NAME,
        "source_url": f"https://www.themealdb.com/api/json/v1/1/lookup.php?i={meal_id}",
        "status": "published",
        "saves": 24 + (index * 7) % 220,
        "likes": 8 + (index * 5) % 120,
        "forks": 3 + (index * 3) % 70,
        "recipe": {
            "id": "main",
            "day": "post",
            "name": title,
            "ingredients": ingredients,
            "equipment": infer_equipment(category, steps),
            "cook_time_minutes": cook_time,
            "estimated_cost": infer_cost(category, ingredients),
            "tags": tags,
            "difficulty": "easy" if cook_time <= 20 else "medium",
            "notes": f"Source: TheMealDB meal id {meal_id}. Image and instructions are matched to this exact meal record.",
            "steps": steps,
        },
    }


def extract_ingredients(meal: dict[str, Any]) -> list[str]:
    ingredients = []
    for index in range(1, 21):
        ingredient = clean_text(meal.get(f"strIngredient{index}") or "")
        measure = clean_text(meal.get(f"strMeasure{index}") or "")
        if ingredient:
            ingredients.append(f"{measure} {ingredient}".strip())
    return ingredients


def split_steps(instructions: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", instructions.replace("\r", "\n")).strip()
    parts = re.split(r"(?<=[.!?])\s+", normalized)
    steps = [part.strip(" -") for part in parts if len(part.strip(" -")) >= 12]
    if len(steps) < 3:
        steps = [part.strip(" -") for part in re.split(r"\n+|;\s+", instructions) if part.strip(" -")]
    return steps[:12] or [normalized]


def infer_tags(meal: dict[str, Any], steps: list[str]) -> list[str]:
    category = clean_text(meal.get("strCategory") or "")
    area = clean_text(meal.get("strArea") or "")
    tags = ["推荐", "家常", category, area]
    text = f"{meal.get('strMeal', '')} {meal.get('strInstructions', '')} {category}".lower()
    if category in {"Breakfast", "Starter"}:
        tags.append("快手")
    if category == "Breakfast" or any(word in text for word in ["breakfast", "pancake", "omelette"]):
        tags.append("早餐")
    if category in {"Vegetarian", "Vegan"}:
        tags.extend(["素食", "低预算"])
    if category in {"Chicken", "Seafood", "Vegetarian", "Vegan"}:
        tags.append("减脂")
    if category in {"Pasta", "Starter", "Side"} or len(steps) <= 5:
        tags.append("快手")
    if category in {"Pasta", "Vegetarian", "Vegan", "Side", "Starter", "Breakfast"}:
        tags.append("低预算")
    return list(dict.fromkeys(tag for tag in tags if tag))


def infer_equipment(category: str, steps: list[str]) -> list[str]:
    text = " ".join(steps).lower()
    equipment = []
    if "oven" in text or "bake" in text:
        equipment.append("oven")
    if "grill" in text:
        equipment.append("grill")
    if "boil" in text or "simmer" in text or "soup" in category.lower():
        equipment.append("pot")
    if "fry" in text or "pan" in text or not equipment:
        equipment.append("pan")
    return list(dict.fromkeys(equipment))


def infer_cook_time(category: str, steps: list[str]) -> int:
    if category == "Breakfast":
        return 15
    if category in {"Starter", "Side"}:
        return 18
    if category in {"Vegetarian", "Vegan", "Pasta"}:
        return 25
    if category in {"Beef", "Lamb"}:
        return 55
    if category == "Dessert":
        return 45
    return 30 if len(steps) <= 6 else 40


def infer_cost(category: str, ingredients: list[str]) -> float:
    base = {
        "Beef": 24,
        "Lamb": 26,
        "Seafood": 24,
        "Chicken": 18,
        "Pork": 18,
        "Vegetarian": 10,
        "Vegan": 10,
        "Breakfast": 8,
        "Pasta": 10,
        "Dessert": 12,
    }.get(category, 14)
    return round(base + min(len(ingredients), 10) * 0.6, 1)


def clean_text(value: str) -> str:
    return " ".join(value.split())


if __name__ == "__main__":
    raise SystemExit(main())
