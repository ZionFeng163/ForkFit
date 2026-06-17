from __future__ import annotations

import unittest

from forkfit.api.schemas import CreatePostRequest
from forkfit.models import Meal
from forkfit.post_extraction import extract_post_details


class PartialLLM:
    def complete_json(self, **kwargs):
        return {
            "theme": "家常晚餐",
            "location": "杭州",
            "ingredients": ["番茄", "米饭"],
        }


class PostExtractionTests(unittest.TestCase):
    def test_partial_llm_output_preserves_existing_metadata(self) -> None:
        request = CreatePostRequest(
            title="番茄饭",
            theme="community recipe",
            location="unknown",
            image_urls=["https://example.com/rice.jpg"],
            description="简单晚饭。",
            recipe=Meal(
                id="main",
                day="post",
                name="番茄饭",
                ingredients=["番茄", "米饭", "鸡蛋"],
                equipment=["电饭锅"],
                cook_time_minutes=20,
                estimated_cost=8,
                tags=["家常", "快手"],
                notes="保留备注。",
                steps=["淘米。", "焖熟。"],
            ),
        )

        result = extract_post_details(request, llm=PartialLLM())

        self.assertEqual(result.recipe.equipment, ["电饭锅"])
        self.assertEqual(result.recipe.tags, ["家常", "快手"])
        self.assertEqual(result.recipe.notes, "保留备注。")


if __name__ == "__main__":
    unittest.main()
