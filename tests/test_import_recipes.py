from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_recipes import load_recipes, parse_recipe


class ImportRecipesTests(unittest.TestCase):
    def test_parse_recipe_requires_quality_fields(self) -> None:
        item = {
            "id": "recipe-1",
            "title": "测试菜谱",
            "theme": "家常",
            "location": "ForkFit",
            "image_urls": ["/recipes/test.jpg"],
            "description": "完整的测试菜谱。",
            "source_name": "ForkFit test",
            "source_url": "internal://test/recipe-1",
            "recipe": {
                "id": "main",
                "day": "post",
                "name": "测试菜谱",
                "ingredients": ["豆腐", "青菜"],
                "equipment": ["炒锅"],
                "cook_time_minutes": 12,
                "estimated_cost": 6,
                "tags": ["家常"],
                "steps": ["洗净食材。", "炒熟调味。"],
            },
        }

        recipe = parse_recipe(item)

        self.assertEqual(recipe.post_id, "recipe-1")
        self.assertEqual(recipe.status, "published")
        self.assertEqual(recipe.recipe.steps[0], "洗净食材。")

    def test_load_recipes_reports_missing_images_without_database(self) -> None:
        payload = {
            "recipes": [
                {
                    "id": "recipe-1",
                    "title": "缺图菜谱",
                    "theme": "家常",
                    "location": "ForkFit",
                    "image_urls": [],
                    "description": "这条应该被拒绝。",
                    "source_name": "ForkFit test",
                    "source_url": "internal://test/recipe-1",
                    "recipe": {
                        "name": "缺图菜谱",
                        "ingredients": ["豆腐"],
                        "equipment": [],
                        "cook_time_minutes": 10,
                        "estimated_cost": 5,
                        "steps": ["拌匀。"],
                    },
                }
            ]
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "recipes.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            recipes, errors = load_recipes([path])

        self.assertEqual(recipes, [])
        self.assertIn("image_urls", errors[0])


if __name__ == "__main__":
    unittest.main()
