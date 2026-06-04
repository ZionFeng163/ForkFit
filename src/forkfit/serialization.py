from __future__ import annotations

from .models import (
    AdapterOutput,
    AgentFinding,
    AgentReview,
    ChangeLogEntry,
    LLMCallTrace,
    Meal,
    MealPack,
    PreferenceProfile,
    PreferenceReview,
    RunTrace,
    StepTrace,
    UserAgentOutput,
    UserProfile,
)


def meal_pack_from_dict(data: dict) -> MealPack:
    return MealPack(
        id=data["id"],
        title=data["title"],
        theme=data["theme"],
        meals=[meal_from_dict(item) for item in data["meals"]],
    )


def meal_pack_to_dict(meal_pack: MealPack) -> dict:
    return meal_pack.to_dict()


def user_profile_from_dict(data: dict) -> UserProfile:
    return UserProfile(
        people_count=int(data["people_count"]),
        likes=list(data.get("likes", [])),
        dislikes=list(data.get("dislikes", [])),
        allergies=list(data.get("allergies", [])),
        diet_rules=list(data.get("diet_rules", [])),
        equipment=list(data.get("equipment", [])),
        max_cook_time_minutes=int(data.get("max_cook_time_minutes", 30)),
        soft_preferences=list(data.get("soft_preferences", [])),
    )


def user_profile_to_dict(user_profile: UserProfile) -> dict:
    return {
        "people_count": user_profile.people_count,
        "likes": list(user_profile.likes),
        "dislikes": list(user_profile.dislikes),
        "allergies": list(user_profile.allergies),
        "diet_rules": list(user_profile.diet_rules),
        "equipment": list(user_profile.equipment),
        "max_cook_time_minutes": user_profile.max_cook_time_minutes,
        "soft_preferences": list(user_profile.soft_preferences),
    }


def meal_from_dict(data: dict) -> Meal:
    return Meal(
        id=data["id"],
        day=data["day"],
        name=data["name"],
        ingredients=list(data["ingredients"]),
        equipment=list(data["equipment"]),
        cook_time_minutes=int(data["cook_time_minutes"]),
        estimated_cost=float(data["estimated_cost"]),
        tags=list(data.get("tags", [])),
        notes=data.get("notes", ""),
        steps=list(data.get("steps", [])),
    )


def user_agent_output_from_dict(data: dict) -> UserAgentOutput:
    profile = data["preference_profile"]
    review = data["preference_review"]
    return UserAgentOutput(
        agent="user",
        preference_profile=PreferenceProfile(
            likes=list(profile.get("likes", [])),
            dislikes=list(profile.get("dislikes", [])),
            allergies=list(profile.get("allergies", [])),
            diet_rules=list(profile.get("diet_rules", [])),
            equipment=list(profile.get("equipment", [])),
            soft_preferences=list(profile.get("soft_preferences", [])),
        ),
        preference_review=PreferenceReview(
            status=review["status"],
            fit_score=float(review["fit_score"]),
            findings=[finding_from_dict(item) for item in review.get("findings", [])],
        ),
    )


def adapter_output_from_dict(data: dict) -> AdapterOutput:
    original_translated = None
    if data.get("original_meal_pack_translated"):
        original_translated = meal_pack_from_dict(data["original_meal_pack_translated"])
    return AdapterOutput(
        forked_meal_pack=meal_pack_from_dict(data["forked_meal_pack"]),
        change_log=[
            ChangeLogEntry(
                affected_item=item["affected_item"],
                from_value=item["from_value"],
                to_value=item["to_value"],
                reason=item["reason"],
                source_agent=normalize_source_agent(item["source_agent"]),
            )
            for item in data.get("change_log", [])
        ],
        unresolved_items=[
            finding_from_dict(item) for item in data.get("unresolved_items", [])
        ],
        summary=data["summary"],
        description=data.get("description", ""),
        original_meal_pack_translated=original_translated,
    )


def agent_review_from_dict(data: dict) -> AgentReview:
    return AgentReview(
        agent=data["agent"],
        status=data["status"],
        findings=[finding_from_dict(item) for item in data.get("findings", [])],
        scores={key: float(value) for key, value in data.get("scores", {}).items()},
    )


def run_trace_from_dict(data: dict | None) -> RunTrace | None:
    if data is None:
        return None
    return RunTrace(
        steps=[
            StepTrace(
                node=item["node"],
                duration_ms=float(item["duration_ms"]),
                status=item["status"],
                error=item.get("error", ""),
            )
            for item in data.get("steps", [])
        ],
        llm_calls=[
            LLMCallTrace(
                agent=item["agent"],
                model=item["model"],
                duration_ms=float(item["duration_ms"]),
                prompt_tokens=item.get("prompt_tokens"),
                completion_tokens=item.get("completion_tokens"),
                status=item["status"],
                error=item.get("error", ""),
            )
            for item in data.get("llm_calls", [])
        ],
    )


def normalize_source_agent(value: str) -> str:
    normalized = value.lower()
    for candidate in ("constraint", "user", "nutrition", "pantry", "knowledge_base"):
        if candidate in normalized:
            return candidate
    return value.strip() or "unknown"


# Equipment translation mapping (English → Chinese)
_EQUIPMENT_ZH = {
    "stovetop": "灶台",
    "oven": "烤箱",
    "microwave": "微波炉",
    "rice cooker": "电饭煲",
    "air fryer": "空气炸锅",
    "pressure cooker": "高压锅",
    "instant pot": "高压锅",
    "blender": "搅拌机",
    "food processor": "料理机",
    "toaster": "烤面包机",
    "grill": "烤架",
    "wok": "炒锅",
    "pot": "锅",
    "pan": "平底锅",
    "baking sheet": "烤盘",
    "cutting board": "砧板",
    "knife": "刀",
    "mixing bowl": "碗",
    "measuring cup": "量杯",
    "spatula": "锅铲",
    "tongs": "夹子",
    "ladle": "汤勺",
    "colander": "漏勺",
    "steamer": "蒸锅",
    "slow cooker": "慢炖锅",
    "dishwasher": "洗碗机",
}


def localize_equipment(equipment: list[str], locale: str) -> list[str]:
    """Translate equipment names to the target locale."""
    if not locale.startswith("zh"):
        return equipment
    return [_EQUIPMENT_ZH.get(item.lower().strip(), item) for item in equipment]


def localize_meal_pack(meal_pack: MealPack, locale: str) -> MealPack:
    """Translate equipment names in a meal pack."""
    if not locale.startswith("zh"):
        return meal_pack
    for meal in meal_pack.meals:
        meal.equipment = localize_equipment(meal.equipment, locale)
    return meal_pack


def localize_adapter_output(output: AdapterOutput, locale: str) -> AdapterOutput:
    """Translate equipment names in the adapter output."""
    if not locale.startswith("zh"):
        return output
    output.forked_meal_pack = localize_meal_pack(output.forked_meal_pack, locale)
    return output


def finding_from_dict(data: dict) -> AgentFinding:
    return AgentFinding(
        type=data["type"],
        severity=data["severity"],
        affected_items=list(data.get("affected_items", [])),
        message=data["message"],
        suggested_action=data.get("suggested_action", ""),
        required_action=data.get("required_action", ""),
    )
