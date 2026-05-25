from forkfit import ForkFitWorkflow, Meal, MealPack, UserProfile


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

result = ForkFitWorkflow().run(user, pack)

print("success:", result.success)
print("user review:", result.user_agent_output.preference_review.status)
for review in result.reviews:
    print(f"{review.agent} review:", review.status)
    for finding in review.findings:
        print(f"  - {finding.type}: {finding.message}")
print("summary:", result.adapter_output.summary)
for change in result.adapter_output.change_log:
    print(f"- {change.affected_item}: {change.from_value} -> {change.to_value}")
print("final meal:", result.adapter_output.forked_meal_pack.meals[0].name)
print("ingredients:", result.adapter_output.forked_meal_pack.meals[0].ingredients)
