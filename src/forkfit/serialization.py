from __future__ import annotations

from .models import (
    AdapterOutput,
    AgentFinding,
    ChangeLogEntry,
    Meal,
    MealPack,
    PreferenceProfile,
    PreferenceReview,
    UserAgentOutput,
)


def meal_pack_from_dict(data: dict) -> MealPack:
    return MealPack(
        id=data["id"],
        title=data["title"],
        theme=data["theme"],
        meals=[meal_from_dict(item) for item in data["meals"]],
    )


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
    )


def normalize_source_agent(value: str) -> str:
    normalized = value.lower()
    for candidate in ("constraint", "user", "nutrition", "budget", "pantry"):
        if candidate in normalized:
            return candidate
    return value.strip() or "unknown"


def finding_from_dict(data: dict) -> AgentFinding:
    return AgentFinding(
        type=data["type"],
        severity=data["severity"],
        affected_items=list(data.get("affected_items", [])),
        message=data["message"],
        suggested_action=data.get("suggested_action", ""),
        required_action=data.get("required_action", ""),
    )
