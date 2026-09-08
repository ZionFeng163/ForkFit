from __future__ import annotations

from dataclasses import asdict
from typing import Any

from forkfit.langgraph_workflow_v3 import ForkFitLangGraphWorkflow
from forkfit.llm import BailianLLMClient, LLMClient
from forkfit.meal_planner_v3 import MealPlanNeedsInput, MealPlanWorkflow
from forkfit.models import RunTrace
from forkfit.recipe_review_agent import RecipeReviewAgent
from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict

from .fakes import FixtureSubstitutionTool, ReferenceEvalLLM
from .models import EvalCase


def build_llm(case: EvalCase, mode: str) -> LLMClient:
    if mode == "fake":
        return ReferenceEvalLLM(case)
    if mode == "live":
        return BailianLLMClient()
    raise ValueError(f"Unsupported eval mode: {mode}")


def run_case(case: EvalCase, *, mode: str) -> dict[str, Any]:
    llm = build_llm(case, mode)
    if case.target == "constraint_review":
        return _run_constraint_review(case, llm)
    if case.target == "recipe_graph":
        return _run_recipe_graph(case, llm)
    if case.target == "planning_graph":
        return _run_planning_graph(case, llm)
    return _run_parent_graph(case, llm)


def _run_constraint_review(case: EvalCase, llm: LLMClient) -> dict[str, Any]:
    trace = RunTrace(workflow_version="eval-constraint-review")
    spec, review = RecipeReviewAgent(llm).understand_and_review(
        user_profile_from_dict(case.input.user_profile),
        case.input.request_text,
        meal_pack_from_dict(case.input.meal_pack or {}),
        locale=case.input.locale,
        trace=trace,
    )
    action = "clarify" if spec.clarification else "adapt" if review.findings else "pass"
    return {
        "action": action,
        "constraints": [asdict(item) for item in spec.items],
        "max_cook_time_minutes": spec.max_cook_time_minutes,
        "people_count": spec.people_count,
        "affected_recipe_ids": sorted({value for finding in review.findings for value in finding.affected_items}),
        "affected_ingredients": sorted({value for finding in review.findings for value in finding.affected_ingredients}),
        "trace": asdict(trace),
    }


def _run_recipe_graph(case: EvalCase, llm: LLMClient) -> dict[str, Any]:
    workflow = ForkFitLangGraphWorkflow(
        llm_client=llm,
        substitution_tool=FixtureSubstitutionTool(case),
    )
    result = workflow.run(
        user_profile_from_dict(case.input.user_profile),
        meal_pack_from_dict(case.input.meal_pack or {}),
        locale=case.input.locale,
        request_text=case.input.request_text,
    )
    action = "clarify" if not result.success else "adapt" if result.adapter_output.change_log else "pass"
    parsed = result.user_agent_output.preference_profile
    constraints = [
        *({"kind": "allergy", "value": value, "hard": True} for value in parsed.allergies),
        *({"kind": "diet_rule", "value": value, "hard": True} for value in parsed.diet_rules),
        *({"kind": "equipment", "value": value, "hard": True} for value in parsed.equipment),
    ]
    return {
        "action": action,
        "constraints": constraints,
        "max_cook_time_minutes": case.input.user_profile.get("max_cook_time_minutes"),
        "affected_recipe_ids": sorted({
            value for review in result.reviews for finding in review.findings for value in finding.affected_items
        }),
        "affected_ingredients": sorted({
            value for review in result.reviews for finding in review.findings for value in finding.affected_ingredients
        }),
        "meal_pack": result.adapter_output.forked_meal_pack.to_dict(),
        "change_log": [asdict(item) for item in result.adapter_output.change_log],
        "trace": asdict(result.trace) if result.trace else {},
        "success": result.success,
        "final_review": asdict(result.final_review),
        "quality_report": asdict(result.quality_report) if result.quality_report else None,
        "unresolved_items": [asdict(item) for item in result.adapter_output.unresolved_items],
    }


def _run_planning_graph(case: EvalCase, llm: LLMClient) -> dict[str, Any]:
    recipe_workflow = ForkFitLangGraphWorkflow(
        llm_client=llm,
        substitution_tool=FixtureSubstitutionTool(case),
    )
    workflow = MealPlanWorkflow(llm=llm, recipe_workflow=recipe_workflow)
    profile = user_profile_from_dict(case.input.user_profile)
    try:
        state = workflow.planning_graph.invoke({
            "days": case.input.days,
            "request_text": case.input.request_text,
            "selected": case.input.selected_recipes,
            "profile": profile,
            "locale": case.input.locale,
            "constraints": None,
            "reports": [],
            "revision_count": 0,
        })
        result = state["result"]
        return {
            "action": "pass",
            "result": result.model_dump(mode="json"),
            "revision_count": state.get("revision_count", 0),
        }
    except MealPlanNeedsInput as exc:
        return {"action": "stop", "issues": exc.issues, "error": exc.message}


def _run_parent_graph(case: EvalCase, llm: LLMClient) -> dict[str, Any]:
    recipe_workflow = ForkFitLangGraphWorkflow(
        llm_client=llm,
        substitution_tool=FixtureSubstitutionTool(case),
    )
    workflow = MealPlanWorkflow(llm=llm, recipe_workflow=recipe_workflow)
    payload = {
        "days": case.input.days,
        "request_text": case.input.request_text,
        "selected_recipes": case.input.selected_recipes,
        "user_profile": case.input.user_profile,
        "locale": case.input.locale,
    }
    try:
        result = workflow.run(payload)
        return {"action": "pass", "result": result.model_dump(mode="json")}
    except MealPlanNeedsInput as exc:
        return {"action": "stop", "issues": exc.issues, "error": exc.message}
