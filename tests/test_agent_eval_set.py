from __future__ import annotations

import unittest

from forkfit import ConstraintGuard, Meal, MealPack
from forkfit.models import ConstraintSet


EVAL_CASES = [
    ("去花生", ["花生"], [], ["炒锅"], 30, ["花生酱"], ["炒锅"], 15, "allergy"),
    ("花生过敏", ["花生"], [], ["炒锅"], 30, ["花生碎"], ["炒锅"], 12, "allergy"),
    ("不要 peanut", ["peanut"], [], ["pan"], 30, ["peanut butter"], ["pan"], 10, "allergy"),
    ("乳糖不耐", ["牛奶"], [], ["汤锅"], 30, ["牛奶"], ["汤锅"], 18, "allergy"),
    ("虾过敏", ["虾"], [], ["炒锅"], 30, ["虾仁"], ["炒锅"], 15, "allergy"),
    ("鸡蛋过敏", ["鸡蛋"], [], ["平底锅"], 30, ["鸡蛋"], ["平底锅"], 8, "allergy"),
    ("大豆过敏", ["大豆"], [], ["炒锅"], 30, ["大豆蛋白"], ["炒锅"], 16, "allergy"),
    ("芝麻过敏", ["芝麻"], [], ["炒锅"], 30, ["芝麻酱"], ["炒锅"], 12, "allergy"),
    ("素食不要鸡肉", [], ["素食"], ["炒锅"], 30, ["鸡胸肉"], ["炒锅"], 18, "diet_rule"),
    ("素食不要牛肉", [], ["素食"], ["汤锅"], 30, ["牛肉"], ["汤锅"], 28, "diet_rule"),
    ("素食不要鱼", [], ["素食"], ["蒸锅"], 30, ["鲈鱼"], ["蒸锅"], 18, "diet_rule"),
    ("素食不要虾", [], ["素食"], ["炒锅"], 30, ["虾仁"], ["炒锅"], 12, "diet_rule"),
    ("不吃猪肉", [], ["不吃猪肉"], ["炒锅"], 30, ["猪肉末"], ["炒锅"], 15, "diet_rule"),
    ("无猪肉", [], ["无猪肉"], ["炖锅"], 60, ["排骨"], ["炖锅"], 45, "diet_rule"),
    ("no pork", [], ["no pork"], ["pan"], 30, ["bacon"], ["pan"], 12, "diet_rule"),
    ("不要牛肉", [], ["不吃牛肉"], ["汤锅"], 40, ["肥牛"], ["汤锅"], 20, "diet_rule"),
    ("no beef", [], ["no beef"], ["pan"], 30, ["beef"], ["pan"], 18, "diet_rule"),
    ("少盐避开火腿", [], ["少盐"], ["炒锅"], 30, ["火腿"], ["炒锅"], 10, "diet_rule"),
    ("低盐避开腊肉", [], ["低盐"], ["炒锅"], 30, ["腊肉"], ["炒锅"], 16, "diet_rule"),
    ("无烤箱", [], [], ["炒锅"], 30, ["花椰菜"], ["烤箱"], 25, "equipment"),
    ("无空气炸锅", [], [], ["炒锅"], 30, ["三文鱼"], ["空气炸锅"], 20, "equipment"),
    ("只有电饭煲", [], [], ["电饭煲"], 30, ["鸡肉"], ["烤箱"], 25, "equipment"),
    ("只有炉灶可用", [], [], ["炉灶"], 30, ["土豆"], ["烤箱"], 22, "equipment"),
    ("no oven", [], [], ["stovetop"], 30, ["cauliflower"], ["oven"], 25, "equipment"),
    ("no air fryer", [], [], ["stovetop"], 30, ["salmon"], ["air fryer"], 22, "equipment"),
    ("20 分钟内", [], [], ["炒锅"], 20, ["牛肉"], ["炒锅"], 45, "time"),
    ("15 分钟内", [], [], ["汤锅"], 15, ["排骨"], ["汤锅"], 40, "time"),
    ("快手晚餐", [], [], ["平底锅"], 18, ["鸡腿"], ["平底锅"], 36, "time"),
    ("午休时间短", [], [], ["炒锅"], 12, ["土豆"], ["炒锅"], 30, "time"),
    ("多人份也要快", [], [], ["炖锅"], 25, ["牛肉"], ["炖锅"], 55, "time"),
    ("去掉香菜", ["香菜"], [], ["炒锅"], 30, ["香菜"], ["炒锅"], 8, "allergy"),
    ("不要椰浆", ["椰浆"], [], ["汤锅"], 30, ["椰浆"], ["汤锅"], 20, "allergy"),
]


class AgentEvalSetTests(unittest.TestCase):
    def test_common_chinese_hard_constraints_are_detected(self) -> None:
        guard = ConstraintGuard()
        passed = 0
        for name, allergies, diet_rules, equipment, max_minutes, ingredients, meal_equipment, cook_time, expected_type in EVAL_CASES:
            with self.subTest(name=name):
                review = guard.review(
                    _pack(ingredients, meal_equipment, cook_time),
                    ConstraintSet(
                        allergies=allergies,
                        diet_rules=diet_rules,
                        equipment=equipment,
                        max_cook_time_minutes=max_minutes,
                        people_count=1,
                    ),
                    locale="zh",
                )
                finding_types = {finding.type for finding in review.findings}
                self.assertIn(expected_type, finding_types)
                passed += 1

        self.assertGreaterEqual(passed / len(EVAL_CASES), 0.9)


def _pack(ingredients: list[str], equipment: list[str], cook_time: int) -> MealPack:
    return MealPack(
        id="eval-pack",
        title="评测菜谱",
        theme="eval",
        meals=[
            Meal(
                id="main",
                day="post",
                name="评测菜",
                ingredients=ingredients,
                equipment=equipment,
                cook_time_minutes=cook_time,
                estimated_cost=10,
                tags=[],
                notes="",
                steps=["准备食材。", "完成烹饪。"],
            )
        ],
    )


if __name__ == "__main__":
    unittest.main()
