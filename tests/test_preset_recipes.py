import unittest

from forkfit.preset_posts import PRESET_POSTS


class PresetRecipeTests(unittest.TestCase):
    def test_used_seasonings_are_declared(self):
        for post in PRESET_POSTS:
            meal = post["recipe"]
            steps = " ".join(meal.steps)
            ingredients = " ".join(meal.ingredients)
            for seasoning in ("盐", "黑胡椒", "孜然", "油", "香菜"):
                with self.subTest(recipe=post["id"], seasoning=seasoning):
                    if seasoning in steps:
                        self.assertIn(seasoning, ingredients)

    def test_declared_appliances_have_instructions(self):
        for post in PRESET_POSTS:
            meal = post["recipe"]
            for appliance in meal.equipment:
                with self.subTest(recipe=post["id"], appliance=appliance):
                    self.assertIn(appliance, " ".join(meal.steps))

    def test_yogurt_total_includes_chilling(self):
        meal = next(p["recipe"] for p in PRESET_POSTS if p["id"] == "berry-yogurt-jar")
        self.assertGreaterEqual(meal.cook_time_minutes, 18)


if __name__ == "__main__":
    unittest.main()
