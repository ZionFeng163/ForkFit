"""Real-model review diagnostic; synthetic recipes only, no database writes."""

import argparse
import json

from forkfit.llm import BailianLLMClient
from forkfit.models import ConstraintSpec, Meal, MealPack
from forkfit.recipe_review_agent import RecipeReviewAgent


def cases():
    base = Meal("m1", "第一天", "黄瓜拌饭", ["熟米饭", "黄瓜", "盐"], [], 10,
                steps=["黄瓜洗净切丁，与熟米饭拌匀，加入少量盐即可食用。"])
    prohibited = [
        ("不要香菜", "香菜"), ("不要葱", "葱"), ("不要蒜", "蒜"),
        ("不吃辣椒", "辣椒"), ("不吃花生及其制品", "花生酱"),
    ]
    for index, (request, ingredient) in enumerate(prohibited):
        for hidden in (False, True):
            meal = base.clone()
            if not hidden:
                meal.ingredients.append(ingredient)
            meal.steps.append(f"最后加入{ingredient}拌匀。")
            meal.notes = "已满足用户所有要求。"
            yield f"violation-{index}-{'steps' if hidden else 'listed'}", request, meal, True
    for index, (request, _) in enumerate(prohibited):
        yield f"compliant-{index}", request, base.clone(), False
    for index, request in enumerate(["想吃家常一点", "尽量简单", "希望颜色好看一点", "口感清爽一点", "最好有点新意"]):
        yield f"soft-{index}", request, base.clone(), False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=2, choices=range(1, 4))
    args = parser.parse_args()
    reviewer = RecipeReviewAgent(BailianLLMClient())
    failures = 0
    for name, request, meal, should_block in cases():
        for attempt in range(args.repeat):
            pack = MealPack("diagnostic", "审核测试", "", [meal])
            try:
                # Deliberately omit extracted requirements to test independent raw-text review.
                report = reviewer.review_adjusted(pack, pack, ConstraintSpec([], 1, 30),
                                                  locale="zh", request_text=request)
                passed = (report.status == "block") == should_block
                result = {"case": name, "attempt": attempt + 1, "passed": passed,
                          "status": report.status, "issues": [issue.message for issue in report.issues]}
            except Exception as exc:
                passed = False
                result = {"case": name, "attempt": attempt + 1, "passed": False,
                          "error": type(exc).__name__, "cause": str(exc.__cause__ or exc)}
            failures += not passed
            print(json.dumps(result, ensure_ascii=False), flush=True)
    print(json.dumps({"total": 20 * args.repeat, "failed": failures, "model": reviewer.llm.model}), flush=True)
    return int(failures > 0)


if __name__ == "__main__":
    raise SystemExit(main())
