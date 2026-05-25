from __future__ import annotations

from forkfit import ForkFitLangGraphWorkflow, Meal, MealPack, UserProfile


def main() -> int:
    user = UserProfile(
        people_count=1,
        budget=60,
        likes=["rice bowls", "soupy meals", "mild spicy"],
        dislikes=["chicken breast"],
        allergies=["peanut"],
        diet_rules=["no pork"],
        equipment=["rice cooker", "air fryer", "stovetop"],
        max_cook_time_minutes=30,
        soft_preferences=["less dishwashing", "high protein"],
    )
    pack = MealPack(
        id="community-high-protein-week",
        title="High Protein Weeknight Dinners",
        theme="high protein weeknight meals",
        meals=[
            Meal(
                id="tuesday",
                day="Tuesday",
                name="Peanut Chicken Breast Rice Bowl",
                ingredients=["rice", "chicken breast", "peanut sauce", "broccoli"],
                equipment=["oven"],
                cook_time_minutes=35,
                estimated_cost=14,
                tags=["rice bowl", "high protein"],
            )
        ],
    )

    result = ForkFitLangGraphWorkflow().run(user, pack)
    print("success:", result.success)
    print("summary:", result.adapter_output.summary)
    print("llm_calls:", result.trace.llm_call_count if result.trace else 0)
    if result.trace:
        for call in result.trace.llm_calls:
            print(
                f"llm {call.agent}: model={call.model} duration_ms={call.duration_ms} "
                f"prompt_tokens={call.prompt_tokens} completion_tokens={call.completion_tokens} "
                f"status={call.status}"
            )
        for step in result.trace.steps:
            print(f"step {step.node}: duration_ms={step.duration_ms} status={step.status}")
    for change in result.adapter_output.change_log:
        print(
            f"change {change.source_agent}/{change.affected_item}: "
            f"{change.from_value} -> {change.to_value}"
        )
    return 0 if result.success else 1


if __name__ == "__main__":
    raise SystemExit(main())
