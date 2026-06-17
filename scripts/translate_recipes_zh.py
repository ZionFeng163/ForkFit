#!/usr/bin/env python3
"""Translate imported recipe display fields to Simplified Chinese.

Only user-facing fields are translated. Stable identifiers, source URLs, and
image URLs are preserved exactly so provenance remains auditable.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from forkfit.llm import BailianLLMClient


CATEGORY_ZH = {
    "Beef": "牛肉",
    "Chicken": "鸡肉",
    "Dessert": "甜品",
    "Lamb": "羊肉",
    "Miscellaneous": "综合料理",
    "Pasta": "意面",
    "Pork": "猪肉",
    "Seafood": "海鲜",
    "Side": "配菜",
    "Starter": "前菜",
    "Vegan": "纯素",
    "Vegetarian": "素食",
    "Breakfast": "早餐",
    "Goat": "山羊肉",
}

AREA_ZH = {
    "Algerian": "阿尔及利亚",
    "American": "美国",
    "Argentina": "阿根廷",
    "Australian": "澳大利亚",
    "British": "英国",
    "Canadian": "加拿大",
    "Chinese": "中国",
    "Croatian": "克罗地亚",
    "Dutch": "荷兰",
    "Egyptian": "埃及",
    "Filipino": "菲律宾",
    "France": "法国",
    "French": "法国",
    "Global": "国际",
    "Greek": "希腊",
    "India": "印度",
    "Indian": "印度",
    "Irish": "爱尔兰",
    "Italian": "意大利",
    "Jamaican": "牙买加",
    "Japanese": "日本",
    "Kenyan": "肯尼亚",
    "Malaysian": "马来西亚",
    "Mexican": "墨西哥",
    "Moroccan": "摩洛哥",
    "Netherlands": "荷兰",
    "Norway": "挪威",
    "Norwegian": "挪威",
    "Polish": "波兰",
    "Portuguese": "葡萄牙",
    "Russian": "俄罗斯",
    "Slovakia": "斯洛伐克",
    "Spanish": "西班牙",
    "Syrian": "叙利亚",
    "Thai": "泰国",
    "Tunisian": "突尼斯",
    "Turkish": "土耳其",
    "Ukrainian": "乌克兰",
    "United States": "美国",
    "Unknown": "未知地区",
    "Venezuela": "委内瑞拉",
    "Vietnamese": "越南",
}

TAG_ZH = {
    **CATEGORY_ZH,
    **AREA_ZH,
    "推荐": "推荐",
    "家常": "家常",
    "快手": "快手",
    "减脂": "减脂",
    "早餐": "早餐",
    "素食": "素食",
    "低预算": "低预算",
}

EQUIPMENT_ZH = {
    "pan": "平底锅",
    "pot": "汤锅",
    "oven": "烤箱",
    "grill": "烤架",
}


def main() -> int:
    args = parse_args()
    if args.source.resolve() == args.output.resolve() and not args.allow_in_place:
        print(
            "ERROR --source and --output are the same. "
            "Use a separate output file, or pass --allow-in-place explicitly.",
            file=sys.stderr,
        )
        return 2
    source = json.loads(args.source.read_text(encoding="utf-8"))
    recipes = source["recipes"]
    translated = load_existing(args.output)
    done_ids = {item["id"] for item in translated}
    client = BailianLLMClient(timeout_seconds=args.timeout)

    for start in range(0, len(recipes), args.batch_size):
        batch = [item for item in recipes[start:start + args.batch_size] if item["id"] not in done_ids]
        if not batch:
            continue
        translated_batch = translate_batch(client, batch)
        translated.extend(merge_recipe(original, translated_batch[original["id"]]) for original in batch)
        done_ids.update(item["id"] for item in batch)
        write_output(args.output, translated)
        print(f"Translated {len(done_ids)}/{len(recipes)}", flush=True)
        time.sleep(args.sleep)

    print(f"Wrote {len(translated)} translated recipes to {args.output}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Translate recipe JSON display fields to zh-CN.")
    parser.add_argument("--source", type=Path, default=Path("data/recipes/themealdb_recipes.json"))
    parser.add_argument("--output", type=Path, default=Path("data/recipes/themealdb_recipes.zh.json"))
    parser.add_argument(
        "--allow-in-place",
        action="store_true",
        help="Allow writing translations back to --source. Prefer a separate output file.",
    )
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--sleep", type=float, default=0.2)
    parser.add_argument("--timeout", type=int, default=90)
    return parser.parse_args()


def load_existing(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    items = raw.get("recipes") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return []
    return [item for item in items if is_probably_chinese(item)]


def translate_batch(client: BailianLLMClient, recipes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    payload = {
        "recipes": [
            {
                "id": item["id"],
                "title": item["title"],
                "theme": item["theme"],
                "location": item["location"],
                "description": item["description"],
                "recipe": {
                    "name": item["recipe"]["name"],
                    "ingredients": item["recipe"]["ingredients"],
                    "equipment": item["recipe"]["equipment"],
                    "tags": item["recipe"]["tags"],
                    "notes": item["recipe"]["notes"],
                    "steps": item["recipe"]["steps"],
                },
            }
            for item in recipes
        ]
    }
    result = client.complete_json(
        agent="recipe_translation_zh",
        system=(
            "You translate recipe data into natural Simplified Chinese for a Chinese cooking app. "
            "Return strict JSON only. Preserve every recipe id. Do not translate source URLs or image URLs. "
            "Keep ingredient quantities, temperatures, and times accurate. Use Chinese cooking terms. "
            "Output schema: {\"recipes\":[{\"id\":\"...\",\"title\":\"...\",\"description\":\"...\","
            "\"recipe\":{\"name\":\"...\",\"ingredients\":[...],\"steps\":[...],\"notes\":\"...\"}}]}."
        ),
        user=json.dumps(payload, ensure_ascii=False),
        max_tokens=12000,
    )
    items = result.get("recipes")
    if not isinstance(items, list):
        raise RuntimeError("Translation result missing recipes[]")
    mapped = {}
    for item in items:
        if not isinstance(item, dict) or "id" not in item:
            continue
        mapped[str(item["id"])] = item
    missing = [item["id"] for item in recipes if item["id"] not in mapped]
    if missing:
        raise RuntimeError(f"Translation result missing ids: {missing}")
    return mapped


def merge_recipe(original: dict[str, Any], translated: dict[str, Any]) -> dict[str, Any]:
    recipe_t = translated.get("recipe") if isinstance(translated.get("recipe"), dict) else {}
    merged = json.loads(json.dumps(original, ensure_ascii=False))
    title = clean(translated.get("title")) or original["title"]
    merged["title"] = title
    merged["theme"] = CATEGORY_ZH.get(original["theme"], original["theme"])
    merged["location"] = AREA_ZH.get(original["location"], original["location"])
    merged["description"] = (
        clean(translated.get("description"))
        or f"{title}，图片和原始菜谱均来自同一条 TheMealDB 记录。"
    )
    merged["source_name"] = "TheMealDB 同源菜谱和图片"
    merged["recipe"]["name"] = clean(recipe_t.get("name")) or title
    merged["recipe"]["ingredients"] = clean_list(recipe_t.get("ingredients")) or original["recipe"]["ingredients"]
    merged["recipe"]["equipment"] = [
        EQUIPMENT_ZH.get(item, item) for item in original["recipe"].get("equipment", [])
    ]
    merged["recipe"]["tags"] = translate_tags(original["recipe"].get("tags", []))
    merged["recipe"]["notes"] = (
        clean(recipe_t.get("notes"))
        or f"来源：TheMealDB meal id {original['id'].removeprefix('themealdb-')}。图片和步骤来自同一条原始记录。"
    )
    merged["recipe"]["steps"] = clean_list(recipe_t.get("steps")) or original["recipe"]["steps"]
    return merged


def translate_tags(tags: list[str]) -> list[str]:
    result = []
    for tag in tags:
        text = TAG_ZH.get(tag, tag)
        if text not in result:
            result.append(text)
    return result


def clean(value: Any) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [clean(item) for item in value if clean(item)]


def is_probably_chinese(item: dict[str, Any]) -> bool:
    text = f"{item.get('title', '')}{item.get('description', '')}"
    return any("\u4e00" <= char <= "\u9fff" for char in text)


def write_output(path: Path, recipes: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"recipes": recipes}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    raise SystemExit(main())
