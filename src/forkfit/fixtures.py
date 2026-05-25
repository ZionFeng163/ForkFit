from __future__ import annotations

from .models import Meal, MealPack, UserProfile


def demo_user_profile() -> UserProfile:
    return UserProfile(
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


def demo_meal_pack() -> MealPack:
    return MealPack(
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
