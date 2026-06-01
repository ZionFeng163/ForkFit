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


def _equipment_available(required: str, available: set[str]) -> bool:
    """Check if a required equipment item is covered by any available item.

    Uses substring matching so "stove" matches "stovetop" and vice versa.
    """
    if required in available:
        return True
    for avail in available:
        if required in avail or avail in required:
            return True
    return False


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
                "not decide hard feasibility. Keep all strings concise. Do not "
                "include markdown, explanation, or hidden reasoning."
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
                ensure_ascii=False,
            ),
            trace=trace,
            max_tokens=700,
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

    def __init__(self, llm_client: LLMClient, nutrition_tool=None) -> None:
        self.llm_client = llm_client
        self.nutrition_tool = nutrition_tool

    def review(
        self,
        meal_pack: MealPack,
        constraints: ConstraintSet,
        trace: RunTrace | None = None,
    ) -> AgentReview:
        # Build nutrition context if tool available
        nutrition_context = ""
        if self.nutrition_tool:
            all_ingredients = []
            for meal in meal_pack.meals:
                all_ingredients.extend(meal.ingredients)
            nutrition_context = self.nutrition_tool.get_nutrition_context(all_ingredients)

        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit ConstraintAgent. Audit hard feasibility for a "
                "community meal pack against the provided constraints. Return only "
                "JSON matching AgentReview. Do not modify the meal pack. Keep all "
                "strings concise. Do not include markdown, explanation, or hidden "
                "reasoning. "
                "When nutrition_information is provided, also flag meals that are "
                "extremely high in calories (>800 per serving) or very low in protein "
                "(<5g) for a main dish."
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
                    **({"nutrition_information": nutrition_context} if nutrition_context else {}),
                },
                ensure_ascii=False,
            ),
            trace=trace,
            max_tokens=700,
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
            missing = [
                item
                for item in meal.equipment
                if not _equipment_available(_norm(item), available)
            ]
            if missing:
                findings.append(
                    AgentFinding(
                        type="equipment",
                        severity="medium",
                        affected_items=[meal.id],
                        message=f"{meal.name} suggests equipment you don't have: {', '.join(missing)}. The adapter will try to find an alternative method.",
                        suggested_action="The adapter will adapt the cooking method if possible.",
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

    def __init__(self, llm_client: LLMClient, substitution_tool=None, nutrition_tool=None) -> None:
        self.llm_client = llm_client
        self.substitution_tool = substitution_tool
        self.nutrition_tool = nutrition_tool

    def run(
        self,
        original_meal_pack: MealPack,
        user_agent_output: UserAgentOutput,
        reviews: list[AgentReview],
        trace: RunTrace | None = None,
        locale: str = "en",
        people_count: int = 1,
    ) -> AdapterOutput:
        lang_hint = "Chinese (中文)" if locale.startswith("zh") else "English"

        # Pre-fetch substitution suggestions using the tool
        substitution_context = ""
        if self.substitution_tool:
            # Collect all ingredients from all meals
            all_ingredients = []
            for meal in original_meal_pack.meals:
                all_ingredients.extend(meal.ingredients)
            # Collect allergens to exclude
            allergies = user_agent_output.preference_profile.allergies
            diet_rules = user_agent_output.preference_profile.diet_rules
            exclude = allergies + [d.replace("no ", "", 1).strip() for d in diet_rules]
            substitution_context = self.substitution_tool.get_substitution_context(
                all_ingredients, exclude_allergens=exclude
            )

        # Pre-fetch nutrition context using the tool
        nutrition_context = ""
        if self.nutrition_tool:
            all_ingredients = []
            for meal in original_meal_pack.meals:
                all_ingredients.extend(meal.ingredients)
            nutrition_context = self.nutrition_tool.get_nutrition_context(all_ingredients)

        user_message = {
            "task": "Return AdapterOutput JSON.",
            "schema": {
                "forked_meal_pack": original_meal_pack.to_dict(),
                "change_log": [
                    {
                        "affected_item": "meal id",
                        "from_value": "string",
                        "to_value": "string",
                        "reason": "string",
                        "source_agent": "constraint | user | nutrition | budget | pantry | knowledge_base",
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
                "When substitution_suggestions are provided, prefer them over your own guesses.",
                f"When people_count > 1, scale ingredient quantities proportionally (e.g., people_count=2 means double the ingredients).",
                f"The current people_count is {people_count}.",
            ],
            "original_meal_pack": original_meal_pack.to_dict(),
            "user_agent_output": asdict(user_agent_output),
            "reviews": [asdict(review) for review in reviews],
            "people_count": people_count,
        }

        if substitution_context:
            user_message["substitution_suggestions"] = substitution_context

        if nutrition_context:
            user_message["nutrition_information"] = nutrition_context

        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit AdapterAgent. Create a personalized fork of a "
                "community meal pack using minimal necessary changes. Return only "
                "JSON matching the schema. You must fix high-severity hard blocks "
                "before soft preferences, preserve the original theme, and explain "
                "each change with source_agent. Keep summary, reasons, and notes "
                "concise. Do not include markdown, explanation, or hidden reasoning. "
                f"IMPORTANT: All text fields (name, ingredients, equipment, tags, notes, summary, "
                f"reasons) MUST be written in {lang_hint}. "
                f"When nutrition_information is provided, consider the nutritional impact "
                f"of substitutions — prefer ingredients with similar protein/fat/carb profiles. "
                f"When the output language is not English, also provide "
                f"'original_meal_pack_translated' — a translated copy of the original meal pack "
                f"so both original and forked versions are in the same language."
            ),
            user=json.dumps(user_message, ensure_ascii=False),
            trace=trace,
            max_tokens=1400,
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


class CookingStepsAgent:
    """Generates structured cooking steps for each meal in the forked pack.

    Uses a knowledge base of cooking method templates and the LLM to produce
    meal-specific, step-by-step cooking instructions.
    """

    agent_name = "cooking_steps"

    def __init__(self, llm_client: LLMClient, cooking_steps_tool=None) -> None:
        self.llm_client = llm_client
        self.cooking_steps_tool = cooking_steps_tool

    def run(
        self,
        meal_pack: MealPack,
        user_agent_output: UserAgentOutput,
        trace: RunTrace | None = None,
        locale: str = "en",
    ) -> MealPack:
        """Generate cooking steps for each meal and return the updated MealPack."""
        lang_hint = "Chinese (中文)" if locale.startswith("zh") else "English"

        # Pre-fetch cooking method context from knowledge base
        steps_context = ""
        if self.cooking_steps_tool:
            meal_dicts = [asdict(m) for m in meal_pack.meals]
            steps_context = self.cooking_steps_tool.get_steps_context(meal_dicts)

        user_message = {
            "task": "Generate concise cooking steps for each meal.",
            "meals": [
                {
                    "id": meal.id,
                    "name": meal.name,
                    "ingredients": meal.ingredients,
                    "equipment": meal.equipment,
                    "cook_time_minutes": meal.cook_time_minutes,
                    "current_steps": meal.steps,
                }
                for meal in meal_pack.meals
            ],
            "rules": [
                "Each step should be a single, clear action (one sentence).",
                "Steps should be in logical cooking order.",
                "Include prep steps (wash, cut, measure) at the beginning.",
                "Include a final plating or serving step.",
                "Keep steps concise — no more than 15-20 words each.",
                "Typically 4-8 steps per meal depending on complexity.",
                "Adapt steps to the actual ingredients and equipment listed.",
                "If a meal already has good steps, keep them or refine them.",
            ],
        }

        if steps_context:
            user_message["cooking_method_templates"] = steps_context

        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit CookingStepsAgent. Generate clear, concise "
                "cooking steps for each meal. Return JSON with a 'meals' array, "
                "each containing 'id' and 'steps' (list of strings). "
                "Every step must be a short, actionable instruction. "
                "Do not include markdown, explanation, or hidden reasoning. "
                f"All text MUST be written in {lang_hint}."
            ),
            user=json.dumps(user_message, ensure_ascii=False),
            trace=trace,
            max_tokens=800,
        )

        # Apply generated steps to the meal pack
        steps_by_id = {m["id"]: m.get("steps", []) for m in payload.get("meals", [])}
        for meal in meal_pack.meals:
            generated = steps_by_id.get(meal.id)
            if generated and isinstance(generated, list) and len(generated) > 0:
                meal.steps = generated

        return meal_pack


class UserPreferenceExtractor:
    """Extracts user preferences from their cooking history (posts, likes, saves).

    This is an independent agent — runs on-demand when user clicks "Extract",
    not during every fork. Results are cached in the database.
    """

    agent_name = "user_preference_extractor"

    def __init__(self, llm_client: LLMClient, db_query_tool=None) -> None:
        self.llm_client = llm_client
        self.db_query_tool = db_query_tool

    def run(self, user_id: str, locale: str = "en", trace: RunTrace | None = None) -> dict:
        """Extract preferences from user's cooking history. Returns a dict with:
        likes, dislikes, allergies, diet_rules, equipment, soft_preferences,
        cooking_style, preferred_ingredients, summary
        """
        lang_hint = "Chinese (中文)" if locale.startswith("zh") else "English"

        if not self.db_query_tool:
            return {"summary": "No database access available.", "extracted": False}

        history = self.db_query_tool.get_user_cooking_history(user_id)

        if history == "No cooking history found for this user.":
            return {"summary": "No posts, likes, or saves found.", "extracted": False}

        is_zh = locale.startswith("zh")
        user_message = {
            "task": "Extract user cooking preferences from their history.",
            "output_language": lang_hint,
            "cooking_history": history,
            "schema": {
                "likes": ["鸡肉"] if is_zh else ["chicken"],
                "dislikes": ["香菜"] if is_zh else ["cilantro"],
                "diet_rules": ["高蛋白"] if is_zh else ["high protein"],
                "equipment": ["烤箱"] if is_zh else ["oven"],
                "soft_preferences": ["快手菜"] if is_zh else ["quick meals"],
                "preferred_ingredients": ["鸡胸肉"] if is_zh else ["chicken breast"],
                "cooking_style": "快手健康菜" if is_zh else "quick healthy meals",
                "summary": "用户喜欢快手高蛋白菜" if is_zh else "User likes quick high-protein meals",
            },
            "rules": [
                "Analyze the user's recipes, liked recipes, and saved recipes.",
                "Infer preferences from patterns: repeated ingredients = liked, cooking methods used, price ranges, time ranges.",
                "Likes: ingredients and styles that appear frequently in their posts/likes/saves.",
                "Dislikes: ingredients that are notably absent or replaced in their recipes.",
                "Diet rules: infer from patterns (e.g., no pork if never appears, vegetarian if no meat).",
                "Equipment: infer from cooking methods used in their recipes.",
                "Soft preferences: cooking style patterns (quick meals, elaborate dishes, etc.).",
                "Preferred ingredients: top 5-8 ingredients they use most.",
                "Summary: 1-2 sentence description of their cooking profile.",
                "Do NOT include allergies — those must come from explicit user input.",
                "Return concise lists, not long explanations.",
            ],
        }

        payload = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                "You are ForkFit UserPreferenceExtractor. Analyze a user's cooking "
                "history (recipes they posted, liked, and saved) to extract their "
                "cooking preferences. Return JSON matching the schema. Be concise. "
                "Do not include markdown, explanation, or hidden reasoning. "
                f"OUTPUT LANGUAGE: {lang_hint}. You MUST write ALL values in this language. "
                f"If the output language is Chinese, translate everything to Chinese: "
                f"ingredient names (chicken breast→鸡胸肉, broccoli→西兰花, rice→米饭), "
                f"diet terms (high protein→高蛋白, healthy→健康), "
                f"equipment (oven→烤箱, stove→灶台), "
                f"preferences (quick meals→快手菜, budget conscious→注重性价比). "
                f"If the output language is English, keep everything in English. "
                f"NEVER mix languages in the output."
            ),
            user=json.dumps(user_message, ensure_ascii=False),
            trace=trace,
            max_tokens=600,
        )

        # Ensure required keys exist with defaults
        result = {
            "likes": payload.get("likes", []),
            "dislikes": payload.get("dislikes", []),
            "diet_rules": payload.get("diet_rules", []),
            "equipment": payload.get("equipment", []),
            "soft_preferences": payload.get("soft_preferences", []),
            "preferred_ingredients": payload.get("preferred_ingredients", []),
            "cooking_style": payload.get("cooking_style", ""),
            "summary": payload.get("summary", ""),
            "extracted": True,
        }

        # If target language is not English, translate the output
        if not locale.startswith("en"):
            result = self._translate_result(result, locale, trace)

        return result

    def _translate_result(self, result: dict, locale: str, trace: RunTrace | None = None) -> dict:
        """Translate extracted preferences to the target language."""
        lang_hint = "Chinese (中文)" if locale.startswith("zh") else locale
        translate_msg = {
            "task": "Translate these cooking preferences to the target language.",
            "target_language": lang_hint,
            "preferences": result,
        }
        translated = self.llm_client.complete_json(
            agent=self.agent_name,
            system=(
                f"Translate all text values in the JSON to {lang_hint}. "
                f"Keep the same structure and keys. Only translate the string values. "
                f"For ingredient names, use the common Chinese name "
                f"(e.g., chicken breast→鸡胸肉, broccoli→西兰花, rice→米饭, "
                f"peanut sauce→花生酱, oven→烤箱, high protein→高蛋白). "
                f"Do not add or remove any items. Return only the translated JSON."
            ),
            user=json.dumps(translate_msg, ensure_ascii=False),
            trace=trace,
            max_tokens=400,
        )
        return {
            "likes": translated.get("likes", result.get("likes", [])),
            "dislikes": translated.get("dislikes", result.get("dislikes", [])),
            "diet_rules": translated.get("diet_rules", result.get("diet_rules", [])),
            "equipment": translated.get("equipment", result.get("equipment", [])),
            "soft_preferences": translated.get("soft_preferences", result.get("soft_preferences", [])),
            "preferred_ingredients": translated.get("preferred_ingredients", result.get("preferred_ingredients", [])),
            "cooking_style": translated.get("cooking_style", result.get("cooking_style", "")),
            "summary": translated.get("summary", result.get("summary", "")),
            "extracted": True,
        }
