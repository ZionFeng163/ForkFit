from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evals" / "datasets"
CALIBRATION_OUTPUT = ROOT / "evals" / "calibration"


SEED_CASES = [
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


SUBSTITUTES = {
    "花生酱": "葵花籽酱", "花生碎": "烤南瓜籽", "peanut butter": "sunflower seed butter",
    "牛奶": "燕麦奶", "虾仁": "杏鲍菇", "鸡蛋": "嫩豆腐", "大豆蛋白": "豌豆蛋白",
    "芝麻酱": "南瓜籽酱", "鸡胸肉": "杏鲍菇", "牛肉": "杏鲍菇", "鲈鱼": "猴头菇",
    "猪肉末": "香菇丁", "排骨": "莲藕块", "bacon": "smoked mushroom", "肥牛": "杏鲍菇",
    "beef": "king oyster mushroom", "火腿": "鲜香菇", "腊肉": "烟熏豆干", "香菜": "芹菜叶",
    "椰浆": "燕麦奶",
}


def profile(*, allergies=None, diet_rules=None, equipment=None, minutes=30) -> dict[str, Any]:
    return {
        "people_count": 2,
        "likes": [],
        "dislikes": [],
        "allergies": allergies or [],
        "diet_rules": diet_rules or [],
        "equipment": equipment or ["炒锅"],
        "max_cook_time_minutes": minutes,
        "soft_preferences": [],
    }


def meal(meal_id: str, ingredients: list[str], equipment: list[str], minutes: int, name: str = "家常菜") -> dict[str, Any]:
    ingredient_text = "、".join(ingredients)
    return {
        "id": meal_id,
        "day": "community",
        "name": name,
        "ingredients": ingredients,
        "equipment": equipment,
        "cook_time_minutes": minutes,
        "tags": ["家常"],
        "notes": "",
        "steps": [f"清洗并准备{ingredient_text}。", f"将{equipment[0]}加热，加入{ingredient_text}翻炒或烹煮至熟。"],
        "difficulty": "medium",
    }


def pack(meals: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": "eval-pack", "title": "评测菜谱", "theme": "eval", "meals": meals}


def metadata(index: int, category: str, source: str = "manual") -> dict[str, Any]:
    return {
        "category": category,
        "difficulty": "adversarial" if category in {"clarification", "repair"} else "composite" if category in {"multi_recipe", "planning"} else "basic",
        "split": "holdout" if index % 3 == 0 else "development",
        "smoke": index in {1, 2, 9, 20, 33, 41, 49, 57, 81, 89, 97, 105},
        "source": source,
    }


def seed_recipe_cases(start: int = 1) -> list[dict[str, Any]]:
    cases = []
    for offset, (request, allergies, diet_rules, equipment, max_minutes, ingredients, meal_equipment, cook_time, kind) in enumerate(SEED_CASES):
        index = start + offset
        meal_id = "main"
        common_seasonings = ["食用油", "盐"]
        if not any(value in {"大豆", "soy"} for value in allergies):
            common_seasonings.append("生抽")
        recipe_ingredients = list(dict.fromkeys([*ingredients, "土豆", "青椒", *common_seasonings]))
        operations: list[dict[str, Any]] = []
        affected_ingredients: list[str] = []
        tool_policy: dict[str, Any] = {"should_call": False, "max_calls": 8}
        if kind in {"allergy", "diet_rule"}:
            target = ingredients[0]
            replacement = SUBSTITUTES[target]
            adjusted_ingredients = [replacement if item == target else item for item in recipe_ingredients]
            adjusted_text = "、".join(adjusted_ingredients)
            affected_ingredients = [target]
            operations = [
                {"op": "replace_ingredient", "meal_id": meal_id, "target": target, "value": replacement, "reason": "满足用户饮食限制"},
                {"op": "replace_steps", "meal_id": meal_id, "target": "", "value": [f"清洗并准备{adjusted_text}。", f"将{meal_equipment[0]}加热，加入{adjusted_text}翻炒或烹煮至熟。"], "reason": "同步食材与步骤"},
            ]
            excluded = allergies
            argument_requirements = {"ingredient": target}
            if excluded:
                argument_requirements["excluded_allergens"] = excluded
            tool_policy = {
                "should_call": True,
                "tool": "search_substitutions",
                "argument_requirements": argument_requirements,
                "fixture_results": [{"substitute": replacement, "ratio": "1:1", "reason": "满足限制", "allergens": []}],
                "max_calls": 8,
            }
        elif kind == "equipment":
            operations = [{"op": "replace_equipment", "meal_id": meal_id, "target": meal_equipment[0], "value": equipment[0], "reason": "使用用户现有厨具"}]
        else:
            operations = [{"op": "set_cook_time", "meal_id": meal_id, "target": "", "value": max_minutes, "reason": "满足用餐时间要求"}]
        expected_constraints = []
        if kind == "allergy":
            expected_constraints = [{"kind": "allergy", "value": allergies[0], "hard": True}]
        elif kind == "diet_rule":
            expected_constraints = [{"kind": "diet_rule", "value": diet_rules[0], "hard": True}]
        elif kind == "equipment":
            expected_constraints = [{"kind": "equipment", "value": equipment[0], "hard": True}]
        else:
            expected_constraints = [{"kind": "time", "value": str(max_minutes), "hard": True}]
        cases.append({
            "id": f"recipe-seed-{index:03d}",
            "target": "recipe_graph",
            "input": {
                "user_profile": profile(allergies=allergies, diet_rules=diet_rules, equipment=equipment, minutes=max_minutes),
                "request_text": request,
                "meal_pack": pack([meal(meal_id, recipe_ingredients, meal_equipment, cook_time)]),
                "locale": "en" if request.startswith("no ") or "peanut" in request else "zh",
            },
            "reference": {
                "expected_action": "adapt",
                "expected_constraints": expected_constraints,
                "affected_recipe_ids": [meal_id],
                "affected_ingredients": affected_ingredients,
                "tool_policy": tool_policy,
                "expected_patch": operations,
                "required_invariants": ["preserve_recipe_ids", "preserve_recipe_count", "max_one_repair"] + (["safe_substitutions_from_tool"] if tool_policy["should_call"] else []),
                "semantic_checks": ["identity_preserved", "culinary_feasible", "ingredient_step_consistent"],
            },
            "metadata": metadata(index, kind, "existing_test"),
        })
    return cases


def no_change_cases(start: int) -> list[dict[str, Any]]:
    requests = [
        "少油但不用改配方", "两个人吃", "口味清淡", "保留原菜谱", "喜欢蒜香", "不需要额外调整", "周末晚餐",
        "家里有炒锅", "30 分钟内即可", "想吃热菜", "不放香菜，原菜没有香菜", "不要花生，原菜没有花生",
        "偏软一些但保持做法", "适合晚餐", "希望简单一些", "按原菜谱制作",
    ]
    cases = []
    for offset, request in enumerate(requests):
        index = start + offset
        cases.append({
            "id": f"review-pass-{index:03d}", "target": "constraint_review",
            "input": {"user_profile": profile(), "request_text": request, "meal_pack": pack([meal("main", ["番茄", "鸡蛋"], ["炒锅"], 15, "番茄炒蛋")]), "locale": "zh"},
            "reference": {"expected_action": "pass", "expected_constraints": [{"kind": "equipment", "value": "炒锅", "hard": True}], "tool_policy": {"should_call": False, "max_calls": 8}},
            "metadata": metadata(index, "no_change", "manual"),
        })
    return cases


def clarification_cases(start: int) -> list[dict[str, Any]]:
    requests = [
        "吃完这道菜会不舒服，但我不知道是哪种食材引起的", "海鲜好像不能吃，但不确定是哪种", "牛奶可能不耐受", "帮我避开容易过敏的东西",
        "家里那个加热的机器坏了", "不要太久，时间你看着办", "口感要适合老人，但没有更多信息", "做成孩子能吃的",
        "我不吃某种肉，名字忘了", "需要清真但配料标签不完整", "对蛋白质过敏", "这个调料我可能不能吃",
    ]
    cases = []
    for offset, request in enumerate(requests):
        index = start + offset
        cases.append({
            "id": f"review-clarify-{index:03d}", "target": "constraint_review",
            "input": {"user_profile": profile(), "request_text": request, "meal_pack": pack([meal("main", ["鸡肉", "蘑菇"], ["炒锅"], 20)]), "locale": "zh"},
            "reference": {"expected_action": "clarify", "tool_policy": {"should_call": False, "max_calls": 8}},
            "metadata": metadata(index, "clarification", "manual"),
        })
    return cases


def direct_adjustment_cases(start: int) -> list[dict[str, Any]]:
    specs = [
        ("没有烤箱，改成炒锅", "equipment", "烤箱", "炒锅"),
        ("只能用电饭煲", "equipment", "烤箱", "电饭煲"),
        ("控制在 20 分钟", "time", "", 20),
        ("控制在 15 分钟", "time", "", 15),
        ("去掉空气炸锅", "equipment", "空气炸锅", "炒锅"),
        ("改用蒸锅", "equipment", "烤箱", "蒸锅"),
        ("缩短到 25 分钟", "time", "", 25),
        ("只有平底锅", "equipment", "烤箱", "平底锅"),
        ("不用料理机", "equipment", "料理机", "炒锅"),
        ("十分钟快手菜", "time", "", 10),
        ("不用空气炸锅，改蒸", "equipment", "空气炸锅", "蒸锅"),
        ("半小时内完成", "time", "", 30),
    ]
    cases = []
    for offset, (request, kind, target, value) in enumerate(specs):
        index = start + offset
        current_equipment = [target or "炒锅"]
        minutes = int(value) if kind == "time" else 45
        operation = {"op": "set_cook_time", "meal_id": "main", "target": "", "value": value, "reason": "满足时间要求"} if kind == "time" else {"op": "replace_equipment", "meal_id": "main", "target": target, "value": value, "reason": "满足厨具限制"}
        expected = {"kind": "time", "value": str(value), "hard": True} if kind == "time" else {"kind": "equipment", "value": str(value), "hard": True}
        cases.append({
            "id": f"recipe-direct-{index:03d}", "target": "recipe_graph",
            "input": {"user_profile": profile(equipment=[str(value)] if kind == "equipment" else ["炒锅"], minutes=minutes), "request_text": request, "meal_pack": pack([meal("main", ["土豆", "青椒"], current_equipment, 45)]), "locale": "zh"},
            "reference": {"expected_action": "adapt", "expected_constraints": [expected], "affected_recipe_ids": ["main"], "tool_policy": {"should_call": False, "max_calls": 8}, "expected_patch": [operation], "required_invariants": ["preserve_recipe_ids", "preserve_recipe_count", "max_one_repair"], "semantic_checks": ["identity_preserved", "culinary_feasible"]},
            "metadata": metadata(index, kind, "manual"),
        })
    return cases


def multi_recipe_cases(start: int) -> list[dict[str, Any]]:
    cases = []
    for offset in range(8):
        index = start + offset
        target = "花生酱"
        replacement = "葵花籽酱"
        cases.append({
            "id": f"recipe-multi-{index:03d}", "target": "recipe_graph",
            "input": {"user_profile": profile(allergies=["花生"]), "request_text": "花生过敏，其他菜不要改", "meal_pack": pack([meal("safe", ["番茄", "鸡蛋"], ["炒锅"], 15, "番茄炒蛋"), meal("risk", [target, "鸡肉"], ["炒锅"], 20, "酱香鸡肉")]), "locale": "zh"},
            "reference": {
                "expected_action": "adapt", "expected_constraints": [{"kind": "allergy", "value": "花生", "hard": True}], "affected_recipe_ids": ["risk"], "affected_ingredients": [target],
                "tool_policy": {"should_call": True, "tool": "search_substitutions", "argument_requirements": {"ingredient": target, "excluded_allergens": ["花生"]}, "fixture_results": [{"substitute": replacement, "ratio": "1:1", "reason": "不含花生", "allergens": []}], "max_calls": 8},
                "expected_patch": [{"op": "replace_ingredient", "meal_id": "risk", "target": target, "value": replacement, "reason": "避开花生"}, {"op": "replace_steps", "meal_id": "risk", "target": "", "value": [f"清洗并准备{replacement}和鸡肉。", f"将炒锅加热，加入{replacement}和鸡肉翻炒至熟。"], "reason": "同步步骤"}],
                "required_invariants": ["preserve_recipe_ids", "preserve_recipe_count", "safe_substitutions_from_tool", "max_one_repair"], "semantic_checks": ["identity_preserved", "ingredient_step_consistent"],
            },
            "metadata": metadata(index, "multi_recipe", "manual"),
        })
    return cases


def selected_pool(count: int, prefix: str) -> list[dict[str, Any]]:
    ingredients = [("番茄", "鸡蛋"), ("土豆", "青椒"), ("鸡肉", "香菇"), ("豆腐", "白菜"), ("牛肉", "西兰花"), ("南瓜", "小米"), ("鱼", "姜"), ("茄子", "蒜")]
    values = []
    for index in range(count):
        pair = ingredients[index % len(ingredients)]
        values.append({
            "post_id": f"{prefix}-post-{index + 1}",
            "title": f"候选菜 {index + 1}",
            "recipe": meal(f"{prefix}-recipe-{index + 1}", list(pair), ["炒锅"], 15 + index * 3, f"候选菜 {index + 1}"),
        })
    return values


def planning_cases(start: int) -> list[dict[str, Any]]:
    cases = []
    for offset in range(40):
        index = start + offset
        days = 2 + offset % 4
        is_stop = offset >= 32
        count = days - 1 if is_stop else min(14, days + 1 + offset % 3)
        target = "parent_graph" if offset >= 24 else "planning_graph"
        cases.append({
            "id": f"planning-{index:03d}", "target": target,
            "input": {"user_profile": profile(), "request_text": "安排家常、采购方便且每天工作量适中的菜单", "selected_recipes": selected_pool(count, f"case-{index}"), "days": days, "locale": "zh"},
            "reference": {
                "expected_action": "stop" if is_stop else "pass",
                "tool_policy": {"should_call": False, "max_calls": 8},
                "required_invariants": [] if is_stop else ["selected_pool_only", "no_duplicate_posts", "continuous_days", "one_to_three_dishes", "max_one_repair"],
                "semantic_checks": [] if is_stop else ["preference_fit", "plan_quality"],
            },
            "metadata": metadata(index, "planning", "manual"),
        })
    return cases


def build() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    recipe = [
        *seed_recipe_cases(1),
        *no_change_cases(33),
        *clarification_cases(49),
        *direct_adjustment_cases(61),
        *multi_recipe_cases(73),
    ]
    planning = planning_cases(81)
    assert len(recipe) == 80
    assert len(planning) == 40
    all_cases = [*recipe, *planning]
    assert sum(item["metadata"]["split"] == "development" for item in all_cases) == 80
    assert sum(item["metadata"]["split"] == "holdout" for item in all_cases) == 40
    assert sum(item["metadata"]["smoke"] for item in all_cases) == 12
    return recipe, planning


def judge_calibration() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    good_recipes = [
        ("酱香鸡肉", ["花生酱", "鸡肉"], ["葵花籽酱", "鸡肉"]),
        ("奶香南瓜", ["牛奶", "南瓜"], ["燕麦奶", "南瓜"]),
        ("芝麻拌面", ["芝麻酱", "面条"], ["南瓜籽酱", "面条"]),
        ("鲜虾炒饭", ["虾仁", "米饭"], ["杏鲍菇", "米饭"]),
        ("蛋香豆腐", ["鸡蛋", "豆腐"], ["鹰嘴豆液", "豆腐"]),
    ]
    for index, (name, before, after) in enumerate(good_recipes):
        rows.append({
            "id": f"judge-recipe-good-{index + 1}",
            "checks": ["identity_preserved", "culinary_feasible", "ingredient_step_consistent"],
            "input": {"meal": meal("main", before, ["炒锅"], 20, name), "request": "替换不适合的食材"},
            "output": {"meal": meal("main", after, ["炒锅"], 20, name)},
            "expected": {"identity_preserved": True, "culinary_feasible": True, "ingredient_step_consistent": True},
        })
    incomplete_recipes = [
        ("番茄炒蛋", ["番茄", "鸡蛋"]), ("青椒土豆丝", ["青椒", "土豆"]),
        ("香菇鸡肉", ["香菇", "鸡肉"]), ("蒜蓉茄子", ["茄子", "蒜"]),
        ("白菜豆腐", ["白菜", "豆腐"]),
    ]
    for index, (name, ingredients) in enumerate(incomplete_recipes):
        bad = meal("main", ingredients, ["炒锅"], 15, name)
        bad["steps"] = [f"清洗{ingredients[0]}。"]
        rows.append({
            "id": f"judge-recipe-missing-steps-{index + 1}",
            "checks": ["identity_preserved", "culinary_feasible", "ingredient_step_consistent"],
            "input": {"meal": meal("main", ingredients, ["炒锅"], 15, name)},
            "output": {"meal": bad},
            "expected": {"identity_preserved": True, "culinary_feasible": False, "ingredient_step_consistent": False},
        })
    identity_changes = [
        ("土豆炒牛肉", ["牛肉", "土豆"], "番茄炒蛋", ["番茄", "鸡蛋"]),
        ("清蒸鱼", ["鱼", "姜"], "青椒土豆丝", ["青椒", "土豆"]),
        ("白菜豆腐汤", ["白菜", "豆腐"], "香菇鸡肉", ["香菇", "鸡肉"]),
        ("青椒肉丝", ["青椒", "猪肉"], "蒜蓉茄子", ["茄子", "蒜"]),
        ("蒜蓉茄子", ["茄子", "蒜"], "番茄炒蛋", ["番茄", "鸡蛋"]),
    ]
    for index, (before_name, before_ingredients, after_name, after_ingredients) in enumerate(identity_changes):
        rows.append({
            "id": f"judge-recipe-identity-change-{index + 1}",
            "checks": ["identity_preserved", "culinary_feasible", "ingredient_step_consistent"],
            "input": {"meal": meal("main", before_ingredients, ["炒锅"], 25, before_name)},
            "output": {"meal": meal("main", after_ingredients, ["炒锅"], 25, after_name)},
            "expected": {"identity_preserved": False, "culinary_feasible": True, "ingredient_step_consistent": True},
        })
    for index in range(3):
        rows.append({
            "id": f"judge-plan-good-{index + 1}",
            "checks": ["preference_fit", "plan_quality"],
            "input": {"request": "两天家常菜单，候选菜允许不全部使用", "candidate_count": 5},
            "output": {"days": [{"day_index": 1, "dishes": ["番茄炒蛋"]}, {"day_index": 2, "dishes": ["香菇鸡肉"]}], "shopping_list": ["番茄", "鸡蛋", "香菇", "鸡肉"]},
            "expected": {"preference_fit": True, "plan_quality": True},
        })
    for index in range(2):
        rows.append({
            "id": f"judge-plan-bad-{index + 1}",
            "checks": ["preference_fit", "plan_quality"],
            "input": {"request": "两天菜单，不吃花生"},
            "output": {"days": [{"day_index": 1, "dishes": ["花生鸡肉"]}, {"day_index": 1, "dishes": ["花生鸡肉"]}], "shopping_list": []},
            "expected": {"preference_fit": False, "plan_quality": False},
        })
    assert len(rows) == 20
    return rows


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    CALIBRATION_OUTPUT.mkdir(parents=True, exist_ok=True)
    recipe, planning = build()
    for name, rows in (("recipe_adaptation.jsonl", recipe), ("meal_planning.jsonl", planning)):
        payload = "\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) + "\n"
        (OUTPUT / name).write_text(payload, encoding="utf-8")
    calibration = judge_calibration()
    (CALIBRATION_OUTPUT / "semantic_judge.jsonl").write_text(
        "\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in calibration) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"recipe": len(recipe), "planning": len(planning), "calibration": len(calibration), "total": len(recipe) + len(planning)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
