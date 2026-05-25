from __future__ import annotations

import json
from dataclasses import asdict
from typing import Protocol

from .llm import LLMClient
from .models import (
    AdapterOutput,
    AgentFinding,
    AgentReview,
    ConstraintSet,
    MealPack,
    UserAgentOutput,
    UserProfile,
    RunTrace,
)
from .serialization import adapter_output_from_dict, user_agent_output_from_dict
from .serialization import agent_review_from_dict


class ReviewerAgent(Protocol):
    agent_name: str

    def review(
        self,
        meal_pack: MealPack,
        constraints: ConstraintSet,
        trace: RunTrace | None = None,
    ) -> AgentReview:
        ...


def _norm(value: str) -> str:
    return " ".join(value.lower().replace("-", " ").split())


def _contains_term(text: str, term: str) -> bool:
    normalized_text = _norm(text)
    normalized_term = _norm(term)
    if not normalized_term:
        return False
    if normalized_term in normalized_text:
        return True
    words = [word for word in normalized_term.split() if len(word) > 2]
    return bool(words) and all(word in normalized_text for word in words)


def _status_from_findings(findings: list[AgentFinding]) -> str:
    if any(finding.severity == "high" for finding in findings):
        return "block"
    if findings:
        return "warn"
    return "pass"


class UserAgent:
    agent_name = "user"

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm_client = llm_client

    def run(
        self,
        user_profile: UserProfile,
        meal_pack: MealPack,
        trace: RunTrace | None = None,
    ) -> UserAgentOutput:
        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit UserAgent. Interpret the explicit user profile "
                "and review taste fit for a community meal pack. Return only JSON "
                "matching the requested schema. Do not modify the meal pack and do "
                "not decide hard feasibility."
            ),
            user=json.dumps(
                {
                    "task": "Return UserAgentOutput JSON.",
                    "schema": {
                        "agent": "user",
                        "preference_profile": {
                            "likes": [],
                            "dislikes": [],
                            "allergies": [],
                            "diet_rules": [],
                            "equipment": [],
                            "soft_preferences": [],
                        },
                        "preference_review": {
                            "status": "pass | warn",
                            "fit_score": 0.0,
                            "findings": [
                                {
                                    "type": "taste_mismatch",
                                    "severity": "low | medium | high",
                                    "affected_items": ["meal id"],
                                    "message": "string",
                                    "suggested_action": "string",
                                    "required_action": "",
                                }
                            ],
                        },
                    },
                    "rules": [
                        "Copy explicit allergies, diet_rules, equipment, likes, dislikes, and soft_preferences from user_profile.",
                        "Use findings only for taste or preference mismatch.",
                        "affected_items must use meal ids from meal_pack.",
                        "status must be warn when findings is non-empty, otherwise pass.",
                    ],
                    "user_profile": asdict(user_profile),
                    "meal_pack": meal_pack.to_dict(),
                },
                ensure_ascii=True,
            ),
            trace=trace,
        )
        output = user_agent_output_from_dict(payload)
        return self._normalize_output(user_profile, meal_pack, output)

    def _normalize_output(
        self,
        user_profile: UserProfile,
        meal_pack: MealPack,
        output: UserAgentOutput,
    ) -> UserAgentOutput:
        output.preference_profile.likes = list(user_profile.likes)
        output.preference_profile.dislikes = list(user_profile.dislikes)
        output.preference_profile.allergies = list(user_profile.allergies)
        output.preference_profile.diet_rules = list(user_profile.diet_rules)
        output.preference_profile.equipment = list(user_profile.equipment)
        output.preference_profile.soft_preferences = list(user_profile.soft_preferences)

        valid_ids = {meal.id for meal in meal_pack.meals}
        output.preference_review.findings = [
            finding
            for finding in output.preference_review.findings
            if any(item in valid_ids for item in finding.affected_items)
        ]
        output.preference_review.status = (
            "warn" if output.preference_review.findings else "pass"
        )
        output.preference_review.fit_score = max(
            0.0, min(1.0, output.preference_review.fit_score)
        )
        return output

class ConstraintAgent:
    agent_name = "constraint"

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm_client = llm_client

    def review(
        self,
        meal_pack: MealPack,
        constraints: ConstraintSet,
        trace: RunTrace | None = None,
    ) -> AgentReview:
        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit ConstraintAgent. Audit hard feasibility for a "
                "community meal pack against the provided constraints. Return only "
                "JSON matching AgentReview. Do not modify the meal pack."
            ),
            user=json.dumps(
                {
                    "task": "Return AgentReview JSON.",
                    "schema": {
                        "agent": "constraint",
                        "status": "pass | warn | block",
                        "findings": [
                            {
                                "type": "allergy | diet_rule | equipment | budget | time",
                                "severity": "low | medium | high",
                                "affected_items": ["meal id"],
                                "message": "string",
                                "suggested_action": "string",
                                "required_action": "string",
                            }
                        ],
                        "scores": {},
                    },
                    "rules": [
                        "High severity means the fork cannot be published until fixed.",
                        "Allergy, diet_rule, and unavailable equipment conflicts are high severity.",
                        "Budget and time can be warn unless clearly impossible.",
                        "affected_items must use meal ids from meal_pack.",
                        "status is block if any high-severity finding exists, warn if only low/medium findings exist, otherwise pass.",
                    ],
                    "meal_pack": meal_pack.to_dict(),
                    "constraints": asdict(constraints),
                },
                ensure_ascii=True,
            ),
            trace=trace,
        )
        review = agent_review_from_dict(payload)
        return self._normalize_review(meal_pack, review)

    def _normalize_review(self, meal_pack: MealPack, review: AgentReview) -> AgentReview:
        valid_ids = {meal.id for meal in meal_pack.meals}
        review.agent = self.agent_name
        review.findings = [
            finding
            for finding in review.findings
            if any(item in valid_ids for item in finding.affected_items)
        ]
        review.status = _status_from_findings(review.findings)
        return review


class ConstraintGuard:
    """Deterministic guardrail. This is not an Agent and does not call an LLM."""

    guard_name = "constraint_guard"

    def review(self, meal_pack: MealPack, constraints: ConstraintSet) -> AgentReview:
        findings: list[AgentFinding] = []
        findings.extend(self._allergy_findings(meal_pack, constraints))
        findings.extend(self._diet_rule_findings(meal_pack, constraints))
        findings.extend(self._equipment_findings(meal_pack, constraints))
        findings.extend(self._time_findings(meal_pack, constraints))
        findings.extend(self._budget_findings(meal_pack, constraints))

        has_block = any(finding.severity == "high" for finding in findings)
        status = "block" if has_block else "warn" if findings else "pass"
        return AgentReview(agent=self.guard_name, status=status, findings=findings)

    def _allergy_findings(
        self, meal_pack: MealPack, constraints: ConstraintSet
    ) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            text = meal.searchable_text()
            for allergy in constraints.allergies:
                if _contains_term(text, allergy):
                    findings.append(
                        AgentFinding(
                            type="allergy",
                            severity="high",
                            affected_items=[meal.id],
                            message=f"{meal.name} contains {allergy}, which conflicts with an allergy constraint.",
                            required_action="replace ingredient",
                        )
                    )
        return findings

    def _diet_rule_findings(
        self, meal_pack: MealPack, constraints: ConstraintSet
    ) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            text = meal.searchable_text()
            for rule in constraints.diet_rules:
                blocked_term = _norm(rule).removeprefix("no ")
                if blocked_term and _contains_term(text, blocked_term):
                    findings.append(
                        AgentFinding(
                            type="diet_rule",
                            severity="high",
                            affected_items=[meal.id],
                            message=f"{meal.name} conflicts with diet rule: {rule}.",
                            required_action="replace ingredient",
                        )
                    )
        return findings

    def _equipment_findings(
        self, meal_pack: MealPack, constraints: ConstraintSet
    ) -> list[AgentFinding]:
        available = {_norm(item) for item in constraints.equipment}
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            missing = [item for item in meal.equipment if _norm(item) not in available]
            if missing:
                findings.append(
                    AgentFinding(
                        type="equipment",
                        severity="high",
                        affected_items=[meal.id],
                        message=f"{meal.name} requires unavailable equipment: {', '.join(missing)}.",
                        required_action="replace equipment method",
                    )
                )
        return findings

    def _time_findings(
        self, meal_pack: MealPack, constraints: ConstraintSet
    ) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            over_by = meal.cook_time_minutes - constraints.max_cook_time_minutes
            if over_by <= 0:
                continue
            findings.append(
                AgentFinding(
                    type="time",
                    severity="high" if over_by > 15 else "medium",
                    affected_items=[meal.id],
                    message=f"{meal.name} takes {meal.cook_time_minutes} minutes, over the {constraints.max_cook_time_minutes}-minute limit.",
                    required_action="shorten recipe" if over_by > 15 else "",
                    suggested_action="simplify prep or move to a less busy day",
                )
            )
        return findings

    def _budget_findings(
        self, meal_pack: MealPack, constraints: ConstraintSet
    ) -> list[AgentFinding]:
        if constraints.budget <= 0 or meal_pack.estimated_cost <= constraints.budget:
            return []
        over_ratio = (meal_pack.estimated_cost - constraints.budget) / constraints.budget
        severity = "high" if over_ratio > 0.15 else "medium"
        return [
            AgentFinding(
                type="budget",
                severity=severity,
                affected_items=[meal.id for meal in meal_pack.meals],
                message=f"Estimated cost ${meal_pack.estimated_cost:.2f} exceeds budget ${constraints.budget:.2f}.",
                required_action="reduce cost" if severity == "high" else "",
                suggested_action="replace expensive ingredients or reduce duplicate purchases",
            )
        ]


class AdapterAgent:
    agent_name = "adapter"

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm_client = llm_client

    def run(
        self,
        original_meal_pack: MealPack,
        user_agent_output: UserAgentOutput,
        reviews: list[AgentReview],
        trace: RunTrace | None = None,
    ) -> AdapterOutput:
        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit AdapterAgent. Create a personalized fork of a "
                "community meal pack using minimal necessary changes. Return only "
                "JSON matching the schema. You must fix high-severity hard blocks "
                "before soft preferences, preserve the original theme, and explain "
                "each change with source_agent."
            ),
            user=json.dumps(
                {
                    "task": "Return AdapterOutput JSON.",
                    "schema": {
                        "forked_meal_pack": original_meal_pack.to_dict(),
                        "change_log": [
                            {
                                "affected_item": "meal id",
                                "from_value": "string",
                                "to_value": "string",
                                "reason": "string",
                                "source_agent": "constraint | user | nutrition | budget | pantry",
                            }
                        ],
                        "unresolved_items": [],
                        "summary": "string",
                    },
                    "rules": [
                        "Do not fully rewrite the meal pack.",
                        "Keep meal ids stable.",
                        "Every change must trace to user_agent_output or reviews.",
                        "If a high-severity hard block cannot be fixed, put that finding in unresolved_items.",
                        "Remove blocked allergy/diet terms from ingredients, name, tags, and notes.",
                    ],
                    "original_meal_pack": original_meal_pack.to_dict(),
                    "user_agent_output": asdict(user_agent_output),
                    "reviews": [asdict(review) for review in reviews],
                },
                ensure_ascii=True,
            ),
            trace=trace,
        )
        output = adapter_output_from_dict(payload)
        return self._guard_adapter_output(
            original_meal_pack, user_agent_output, reviews, output
        )

    def _guard_adapter_output(
        self,
        original_meal_pack: MealPack,
        user_agent_output: UserAgentOutput,
        reviews: list[AgentReview],
        output: AdapterOutput,
    ) -> AdapterOutput:
        original_ids = {meal.id for meal in original_meal_pack.meals}
        forked_ids = {meal.id for meal in output.forked_meal_pack.meals}
        if original_ids != forked_ids:
            output.unresolved_items.append(
                AgentFinding(
                    type="meal_identity",
                    severity="high",
                    affected_items=list(original_ids.symmetric_difference(forked_ids)),
                    message="Adapter output changed meal ids; minimal fork contract was violated.",
                    required_action="preserve original meal ids",
                )
            )
            output.summary = "Could not safely fork the meal pack because adapter output changed meal ids."
            return output

        constrained = ConstraintGuard().review(
            output.forked_meal_pack,
            _constraints_from_reviews(user_agent_output, reviews),
        )
        if constrained.status == "block" and not output.unresolved_items:
            output.unresolved_items = constrained.findings
            output.summary = "Could not safely fork the meal pack because guard validation found unresolved hard constraints."
            return output

        return output


def _constraints_from_reviews(
    user_agent_output: UserAgentOutput, reviews: list[AgentReview]
) -> ConstraintSet:
    return ConstraintSet(
        allergies=list(user_agent_output.preference_profile.allergies),
        diet_rules=list(user_agent_output.preference_profile.diet_rules),
        equipment=list(user_agent_output.preference_profile.equipment),
        budget=10_000,
        max_cook_time_minutes=24 * 60,
        people_count=1,
    )
