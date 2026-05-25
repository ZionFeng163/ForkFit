from __future__ import annotations

import json
from dataclasses import asdict
from typing import Protocol

from .llm import LLMClient
from .models import (
    AdapterOutput,
    AgentFinding,
    AgentReview,
    ChangeLogEntry,
    ConstraintSet,
    Meal,
    MealPack,
    PreferenceProfile,
    PreferenceReview,
    UserAgentOutput,
    UserProfile,
    RunTrace,
)
from .serialization import adapter_output_from_dict, user_agent_output_from_dict


class ReviewerAgent(Protocol):
    agent_name: str

    def review(self, meal_pack: MealPack, constraints: ConstraintSet) -> AgentReview:
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

    def _review_taste_fit(
        self, preference_profile: PreferenceProfile, meal_pack: MealPack
    ) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            text = meal.searchable_text()
            for dislike in preference_profile.dislikes:
                if _contains_term(text, dislike):
                    findings.append(
                        AgentFinding(
                            type="taste_mismatch",
                            severity="medium",
                            affected_items=[meal.id],
                            message=f"User dislikes {dislike}.",
                            suggested_action=f"Reduce or replace {dislike} while keeping the meal theme.",
                        )
                    )
        return findings

    def _count_matches(self, terms: list[str], meal_pack: MealPack) -> int:
        return sum(
            1
            for term in terms
            if any(_contains_term(meal.searchable_text(), term) for meal in meal_pack.meals)
        )


class ConstraintAgent:
    agent_name = "constraint"

    def review(self, meal_pack: MealPack, constraints: ConstraintSet) -> AgentReview:
        findings: list[AgentFinding] = []
        findings.extend(self._allergy_findings(meal_pack, constraints))
        findings.extend(self._diet_rule_findings(meal_pack, constraints))
        findings.extend(self._equipment_findings(meal_pack, constraints))
        findings.extend(self._time_findings(meal_pack, constraints))
        findings.extend(self._budget_findings(meal_pack, constraints))

        has_block = any(finding.severity == "high" for finding in findings)
        status = "block" if has_block else "warn" if findings else "pass"
        return AgentReview(agent=self.agent_name, status=status, findings=findings)

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
            return self._deterministic_repair(original_meal_pack, user_agent_output, reviews)

        constrained = ConstraintAgent().review(
            output.forked_meal_pack,
            user_agent_output.preference_profile.to_constraints(
                _profile_from_preference(user_agent_output.preference_profile)
            ),
        )
        if constrained.status == "block" and not output.unresolved_items:
            return self._deterministic_repair(original_meal_pack, user_agent_output, reviews)

        return output

    def _deterministic_repair(
        self,
        original_meal_pack: MealPack,
        user_agent_output: UserAgentOutput,
        reviews: list[AgentReview],
    ) -> AdapterOutput:
        forked = original_meal_pack.clone()
        change_log: list[ChangeLogEntry] = []
        unresolved_items: list[AgentFinding] = []

        for review in reviews:
            for finding in review.findings:
                if finding.severity == "high":
                    resolved = self._apply_constraint_fix(
                        forked, finding, user_agent_output.preference_profile, change_log
                    )
                    if not resolved:
                        unresolved_items.append(finding)

        if not unresolved_items:
            self._apply_preference_fixes(
                forked, user_agent_output.preference_review.findings, change_log
            )
            for review in reviews:
                for finding in review.findings:
                    if finding.severity != "high":
                        self._apply_soft_review_fix(forked, finding, change_log)

        summary = self._summary(change_log, unresolved_items)
        return AdapterOutput(
            forked_meal_pack=forked,
            change_log=change_log,
            unresolved_items=unresolved_items,
            summary=summary,
        )

    def _apply_constraint_fix(
        self,
        meal_pack: MealPack,
        finding: AgentFinding,
        preference_profile: PreferenceProfile,
        change_log: list[ChangeLogEntry],
    ) -> bool:
        if finding.type in {"allergy", "diet_rule"}:
            return self._replace_blocked_ingredients(
                meal_pack, finding, preference_profile, change_log
            )
        if finding.type == "equipment":
            return self._replace_equipment_method(
                meal_pack, finding, preference_profile, change_log
            )
        if finding.type == "time":
            return self._shorten_meal(meal_pack, finding, change_log)
        if finding.type == "budget":
            return self._reduce_budget(meal_pack, finding, change_log)
        return False

    def _apply_preference_fixes(
        self,
        meal_pack: MealPack,
        findings: list[AgentFinding],
        change_log: list[ChangeLogEntry],
    ) -> None:
        for finding in findings:
            for meal_id in finding.affected_items:
                meal = meal_pack.find_meal(meal_id)
                if meal is None:
                    continue
                before = ", ".join(meal.ingredients)
                changed = self._replace_matching_ingredient(
                    meal,
                    ["dry chicken breast", "chicken breast"],
                    "saucy chicken thigh",
                )
                if not changed:
                    meal.notes = _append_note(meal.notes, "Add a saucy rice-bowl finish for better taste fit.")
                    changed = True
                if changed:
                    change_log.append(
                        ChangeLogEntry(
                            affected_item=meal.id,
                            from_value=before,
                            to_value=", ".join(meal.ingredients),
                            reason=finding.message,
                            source_agent="user",
                        )
                    )

    def _apply_soft_review_fix(
        self,
        meal_pack: MealPack,
        finding: AgentFinding,
        change_log: list[ChangeLogEntry],
    ) -> bool:
        if finding.type == "budget":
            return self._reduce_budget(meal_pack, finding, change_log)
        if finding.type == "time":
            return self._shorten_meal(meal_pack, finding, change_log)
        return False

    def _replace_blocked_ingredients(
        self,
        meal_pack: MealPack,
        finding: AgentFinding,
        preference_profile: PreferenceProfile,
        change_log: list[ChangeLogEntry],
    ) -> bool:
        blocked_terms = [
            *preference_profile.allergies,
            *[_norm(rule).removeprefix("no ") for rule in preference_profile.diet_rules],
        ]
        replacement_by_term = {
            "peanut": "sesame-lime sauce",
            "pork": "chicken thigh",
            "shellfish": "tofu",
            "shrimp": "tofu",
            "beef": "mushroom tofu",
            "dairy": "oat yogurt",
            "milk": "oat milk",
        }
        resolved_any = False
        for meal_id in finding.affected_items:
            meal = meal_pack.find_meal(meal_id)
            if meal is None:
                continue
            before = ", ".join(meal.ingredients)
            resolved_meal = False
            for term in blocked_terms:
                replacement = replacement_by_term.get(_norm(term))
                if replacement and self._replace_matching_ingredient(meal, [term], replacement):
                    self._replace_blocked_metadata(meal, term, replacement)
                    resolved_meal = True
            if resolved_meal:
                change_log.append(
                    ChangeLogEntry(
                        affected_item=meal.id,
                        from_value=before,
                        to_value=", ".join(meal.ingredients),
                        reason=finding.message,
                        source_agent="constraint",
                    )
                )
                resolved_any = True
        return resolved_any

    def _replace_blocked_metadata(self, meal: Meal, term: str, replacement: str) -> None:
        normalized_term = _norm(term)
        if normalized_term and _contains_term(meal.name, term):
            meal.name = meal.name.replace(term.title(), replacement.title())
            meal.name = meal.name.replace(term.capitalize(), replacement.title())
            meal.name = meal.name.replace(term, replacement)
        meal.tags = [
            replacement if _contains_term(tag, term) else tag for tag in meal.tags
        ]
        if meal.notes and _contains_term(meal.notes, term):
            meal.notes = meal.notes.replace(term, replacement)

    def _replace_equipment_method(
        self,
        meal_pack: MealPack,
        finding: AgentFinding,
        preference_profile: PreferenceProfile,
        change_log: list[ChangeLogEntry],
    ) -> bool:
        available = [_norm(item) for item in preference_profile.equipment]
        preferred = next(
            (item for item in ["air fryer", "stovetop", "rice cooker"] if item in available),
            None,
        )
        if preferred is None:
            return False

        resolved = False
        for meal_id in finding.affected_items:
            meal = meal_pack.find_meal(meal_id)
            if meal is None:
                continue
            before = ", ".join(meal.equipment)
            meal.equipment = [preferred]
            meal.notes = _append_note(meal.notes, f"Converted cooking method to {preferred}.")
            change_log.append(
                ChangeLogEntry(
                    affected_item=meal.id,
                    from_value=before,
                    to_value=", ".join(meal.equipment),
                    reason=finding.message,
                    source_agent="constraint",
                )
            )
            resolved = True
        return resolved

    def _shorten_meal(
        self,
        meal_pack: MealPack,
        finding: AgentFinding,
        change_log: list[ChangeLogEntry],
    ) -> bool:
        resolved = False
        for meal_id in finding.affected_items:
            meal = meal_pack.find_meal(meal_id)
            if meal is None or meal.cook_time_minutes <= 20:
                continue
            before = f"{meal.cook_time_minutes} minutes"
            meal.cook_time_minutes = max(20, meal.cook_time_minutes - 15)
            meal.notes = _append_note(meal.notes, "Use pre-chopped ingredients to shorten prep.")
            change_log.append(
                ChangeLogEntry(
                    affected_item=meal.id,
                    from_value=before,
                    to_value=f"{meal.cook_time_minutes} minutes",
                    reason=finding.message,
                    source_agent="constraint",
                )
            )
            resolved = True
        return resolved

    def _reduce_budget(
        self,
        meal_pack: MealPack,
        finding: AgentFinding,
        change_log: list[ChangeLogEntry],
    ) -> bool:
        expensive_terms = ["salmon", "steak", "shrimp", "beef", "lamb"]
        resolved = False
        for meal in meal_pack.meals:
            before_ingredients = ", ".join(meal.ingredients)
            if self._replace_matching_ingredient(meal, expensive_terms, "tofu and egg"):
                before_cost = meal.estimated_cost
                meal.estimated_cost = max(3.0, meal.estimated_cost - 8.0)
                change_log.append(
                    ChangeLogEntry(
                        affected_item=meal.id,
                        from_value=f"{before_ingredients} (${before_cost:.2f})",
                        to_value=f"{', '.join(meal.ingredients)} (${meal.estimated_cost:.2f})",
                        reason=finding.message,
                        source_agent="constraint",
                    )
                )
                resolved = True
                break
        return resolved

    def _replace_matching_ingredient(
        self, meal: Meal, terms: list[str], replacement: str
    ) -> bool:
        changed = False
        new_ingredients: list[str] = []
        for ingredient in meal.ingredients:
            if any(_contains_term(ingredient, term) for term in terms):
                if replacement not in new_ingredients:
                    new_ingredients.append(replacement)
                changed = True
            else:
                new_ingredients.append(ingredient)
        meal.ingredients = new_ingredients
        return changed

    def _summary(
        self, change_log: list[ChangeLogEntry], unresolved_items: list[AgentFinding]
    ) -> str:
        if unresolved_items:
            return "Could not safely fork the meal pack because hard constraints remain unresolved."
        if change_log:
            return "Adapted the meal pack with minimal changes for constraints and taste fit."
        return "Meal pack already fits the user profile; no changes were required."


def _append_note(existing: str, note: str) -> str:
    if not existing:
        return note
    if note in existing:
        return existing
    return f"{existing} {note}"


def _profile_from_preference(preference_profile: PreferenceProfile) -> UserProfile:
    return UserProfile(
        people_count=1,
        budget=10_000,
        likes=list(preference_profile.likes),
        dislikes=list(preference_profile.dislikes),
        allergies=list(preference_profile.allergies),
        diet_rules=list(preference_profile.diet_rules),
        equipment=list(preference_profile.equipment),
        max_cook_time_minutes=24 * 60,
        soft_preferences=list(preference_profile.soft_preferences),
    )
