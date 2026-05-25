from __future__ import annotations

from .agents import AdapterAgent, ConstraintAgent, ReviewerAgent, UserAgent
from .models import AgentReview, ConstraintSet, ForkFitResult, MealPack, UserProfile


class ForkFitWorkflow:
    """Small state-machine facade for the three-agent MVP."""

    def __init__(
        self,
        user_agent: UserAgent | None = None,
        reviewer_agents: list[ReviewerAgent] | None = None,
        adapter_agent: AdapterAgent | None = None,
    ) -> None:
        self.user_agent = user_agent or UserAgent()
        self.reviewer_agents = reviewer_agents or [ConstraintAgent()]
        self.adapter_agent = adapter_agent or AdapterAgent()
        self.final_constraint_agent = ConstraintAgent()

    def run(self, user_profile: UserProfile, meal_pack: MealPack) -> ForkFitResult:
        user_output = self.user_agent.run(user_profile, meal_pack)
        constraints = user_output.preference_profile.to_constraints(user_profile)
        reviews = [
            reviewer.review(meal_pack, constraints) for reviewer in self.reviewer_agents
        ]
        adapter_output = self.adapter_agent.run(meal_pack, user_output, reviews)
        final_review = self.final_constraint_agent.review(
            adapter_output.forked_meal_pack, constraints
        )
        success = (
            not adapter_output.unresolved_items
            and final_review.status != "block"
            and self._all_required_blocks_addressed(reviews, final_review, constraints)
        )
        return ForkFitResult(
            success=success,
            user_agent_output=user_output,
            reviews=reviews,
            adapter_output=adapter_output,
            final_review=final_review,
        )

    def _all_required_blocks_addressed(
        self,
        original_reviews: list[AgentReview],
        final_review: AgentReview,
        constraints: ConstraintSet,
    ) -> bool:
        had_blocks = any(review.status == "block" for review in original_reviews)
        if not had_blocks:
            return True
        return final_review.status != "block" and bool(constraints.equipment or constraints.allergies or constraints.diet_rules)
