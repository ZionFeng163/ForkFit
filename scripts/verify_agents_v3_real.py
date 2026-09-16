from forkfit.llm import BailianLLMClient, FunctionTool
from forkfit.meal_planner_v3 import MealPlanWorkflow


def verify_function_call(client: BailianLLMClient) -> None:
    tool = FunctionTool(
        "search_substitutions", "查询替代食材。",
        {"type": "object", "additionalProperties": False, "properties": {
            "ingredient": {"type": "string"}, "top_k": {"type": "integer", "minimum": 1, "maximum": 5}},
         "required": ["ingredient", "top_k"]},
        lambda args: [{"substitute": "葵花籽酱", "ratio": "1:1", "query": args["ingredient"]}],
    )
    result = client.complete_with_tools(
        agent="recipe_adapter", system="你是菜谱调整 Agent。必须先调用工具，再返回 JSON。",
        user='请为花生酱找替代品。最终返回 {"selected":"候选名"}。', tools=[tool],
        require_tool=True, max_turns=3, max_tool_calls=2, max_tokens=500,
    )
    assert result.tool_outputs and result.output.get("selected"), result


def meal(index: int, name: str, ingredients: list[str]) -> dict:
    return {"id": f"recipe-{index}", "day": "", "name": name, "ingredients": ingredients,
            "equipment": ["炒锅"], "cook_time_minutes": 20, "tags": ["家常"], "notes": "",
            "steps": ["食材洗净切好。", "放入炒锅炒熟并调味。"], "difficulty": "easy"}


def verify_two_day_plan(client: BailianLLMClient) -> None:
    selected = [
        {"post_id": "post-1", "title": "番茄炒蛋", "description": "家常菜", "image_url": "", "recipe": meal(1, "番茄炒蛋", ["番茄 2 个", "鸡蛋 2 个"])},
        {"post_id": "post-2", "title": "青菜豆腐", "description": "家常菜", "image_url": "", "recipe": meal(2, "青菜豆腐", ["豆腐 1 盒", "青菜 200 克"])},
    ]
    request = {
        "days": 2, "request_text": "", "selected_recipes": selected, "locale": "zh",
        "user_profile": {"people_count": 2, "likes": [], "dislikes": [], "allergies": [],
                         "diet_rules": [], "equipment": [], "max_cook_time_minutes": 45, "soft_preferences": []},
    }
    result = MealPlanWorkflow(llm=client).run(request)
    assert result.workflow_version == "meal-plan-v4.1"
    assert len(result.days) == 2
    used = [dish.source_post_id for day in result.days for dish in day.dishes]
    assert set(used).issubset({"post-1", "post-2"}) and len(used) == len(set(used))
    locked = result.days[0].model_dump(mode="json")
    replanned = MealPlanWorkflow(llm=client).run({**request, "fixed_days": [locked]})
    assert replanned.days[0].model_dump(mode="json") == locked
    used = [dish.source_post_id for day in replanned.days for dish in day.dishes]
    assert len(used) == len(set(used))


if __name__ == "__main__":
    llm = BailianLLMClient()
    verify_function_call(llm)
    verify_two_day_plan(llm)
    print("REAL_V3_VERIFICATION_OK")
