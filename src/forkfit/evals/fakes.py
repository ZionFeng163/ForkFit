from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from forkfit.llm import ToolAgentResult
from forkfit.models import LLMCallTrace, RunTrace, ToolCallTrace

from .models import EvalCase


class FixtureSubstitutionTool:
    """Deterministic knowledge source used to isolate Agent behaviour in evals."""

    def __init__(self, case: EvalCase) -> None:
        self.case = case

    def lookup(self, ingredient: str, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        configured = self.case.reference.tool_policy.fixture_results
        if configured:
            return configured
        results = []
        for operation in self.case.reference.expected_patch:
            if operation.get("op") == "replace_ingredient" and str(operation.get("target", "")).casefold() == ingredient.casefold():
                results.append({
                    "substitute": str(operation.get("value", "")),
                    "ratio": "1:1",
                    "reason": "评测集确认的可用替代食材",
                    "allergens": [],
                })
        return results


class ReferenceEvalLLM:
    """Produces reference-shaped responses while exercising the real graph."""

    model = "forkfit-reference-eval"

    def __init__(self, case: EvalCase) -> None:
        self.case = case

    def complete_json(
        self, *, agent: str, system: str, user: str,
        trace: RunTrace | None = None, **_kwargs: Any,
    ) -> dict[str, Any]:
        self._record_llm(agent, trace)
        payload = json.loads(user)
        if agent == "recipe_reviewer" and "constraints" in payload.get("schema", {}):
            return self._review_input()
        if agent == "recipe_reviewer":
            return {"status": "pass", "issues": [], "checks": [
                {"requirement_id": requirement, "meal_id": meal["id"], "verdict": "satisfied",
                 "reason": "Reference fixture", "evidence": [{"field": "ingredients", "index": 0}]}
                for requirement in payload.get("requirements", {}) for meal in payload["adjusted"]["meals"]
            ]}
        if agent == "recipe_adapter":
            return self._patch()
        if agent.startswith("meal_planner_"):
            return self._plan(payload)
        if agent == "comprehensive_plan_reviewer":
            return {
                "winner_index": 0,
                "status": "pass",
                "summary": "候选方案满足当前规划要求。",
                "issues": [],
                "assessments": [{"candidate_index": index, "checks": [{"requirement_id": key, "status": "pass", "evidence": "固定测试候选满足该要求", "day_indices": [1], "post_ids": [candidate["days"][0]["dishes"][0]["post_id"]]} for key in payload["requirements"]]} for index, candidate in enumerate(payload["candidates"])],
            }
        if agent == "eval_judge":
            return {
                "identity_preserved": True,
                "culinary_feasible": True,
                "ingredient_step_consistent": True,
                "preference_fit": True,
                "comment": "reference evaluator",
            }
        raise AssertionError(f"Unexpected eval agent: {agent}")

    def complete_with_tools(
        self, *, agent: str, tools: list[Any], trace: RunTrace | None = None,
        **_kwargs: Any,
    ) -> ToolAgentResult:
        self._record_llm(agent, trace)
        outputs: list[dict[str, Any]] = []
        policy = self.case.reference.tool_policy
        if policy.should_call:
            arguments = {
                "ingredient": self.case.reference.affected_ingredients[0] if self.case.reference.affected_ingredients else "食材",
                "excluded_allergens": [],
                "desired_taste": "",
                "desired_texture": "",
                "cooking_use": "",
                "top_k": 3,
                **policy.argument_requirements,
            }
            tool = next(item for item in tools if item.name == policy.tool)
            result = tool.handler(arguments)
            outputs.append({"tool": tool.name, "arguments": arguments, "result": result})
            if trace is not None:
                trace.tool_calls.append(ToolCallTrace(
                    agent=agent,
                    tool=tool.name,
                    duration_ms=0,
                    status="success",
                    result_count=len(result),
                    arguments=arguments,
                ))
        return ToolAgentResult(self._patch(), outputs)

    def _review_input(self) -> dict[str, Any]:
        reference = self.case.reference
        constraints = [item.model_dump() for item in reference.expected_constraints]
        if reference.expected_action == "clarify":
            return {
                "constraints": {
                    "items": constraints,
                    "people_count": self.case.input.user_profile.get("people_count", 1),
                    "max_cook_time_minutes": self.case.input.user_profile.get("max_cook_time_minutes", 30),
                    "clarification": {
                        "code": "ambiguous_constraint",
                        "question": "请确认具体需要避开的食材。",
                        "options": [],
                    },
                },
                "review": {"status": "pass", "findings": []},
            }
        findings = []
        if reference.expected_action == "adapt":
            finding_type = reference.expected_constraints[0].kind if reference.expected_constraints else "preference"
            if finding_type == "excluded_equipment":
                finding_type = "equipment"
            findings.append({
                "type": finding_type,
                "severity": "high" if finding_type in {"allergy", "diet_rule"} else "medium",
                "affected_items": reference.affected_recipe_ids,
                "affected_ingredients": reference.affected_ingredients,
                "message": "菜谱与用户限制冲突。",
                "required_action": "按用户限制完成最小调整。",
            })
        return {
            "constraints": {
                "items": constraints,
                "people_count": self.case.input.user_profile.get("people_count", 1),
                "max_cook_time_minutes": self.case.input.user_profile.get("max_cook_time_minutes", 30),
                "likes": self.case.input.user_profile.get("likes", []),
                "dislikes": self.case.input.user_profile.get("dislikes", []),
                "soft_preferences": self.case.input.user_profile.get("soft_preferences", []),
                "clarification": None,
            },
            "review": {
                "status": "block" if findings and findings[0]["severity"] == "high" else "warn" if findings else "pass",
                "findings": findings,
            },
        }

    def _patch(self) -> dict[str, Any]:
        return {
            "operations": self.case.reference.expected_patch,
            "summary": "按评测要求完成最小调整。" if self.case.reference.expected_patch else "无需调整。",
            "description": "",
            "unresolved_items": [],
        }

    @staticmethod
    def _plan(payload: dict[str, Any]) -> dict[str, Any]:
        pool = payload["recipe_pool"]
        days = int(payload["days"])
        planned = [
            {
                "day_index": index + 1,
                "label": f"第 {index + 1} 天",
                "dishes": [{"post_id": pool[index]["post_id"], "reason": "符合当天安排"}],
                "reason": "在候选菜谱中进行均衡安排",
            }
            for index in range(days)
        ]
        for index, recipe in enumerate(pool[days:]):
            target = index % days
            if len(planned[target]["dishes"]) < 3:
                planned[target]["dishes"].append({
                    "post_id": recipe["post_id"],
                    "reason": "补充当天搭配",
                })
        return {
            "title": "个性化饮食计划",
            "summary": "从用户选入的菜谱中完成跨天组合。",
            "days": planned,
            "prep_notes": ["可提前处理跨天复用的食材。"],
        }

    def _record_llm(self, agent: str, trace: RunTrace | None) -> None:
        if trace is not None:
            trace.llm_calls.append(LLMCallTrace(
                agent=agent,
                model=self.model,
                duration_ms=0,
                prompt_tokens=0,
                completion_tokens=0,
                status="success",
            ))
