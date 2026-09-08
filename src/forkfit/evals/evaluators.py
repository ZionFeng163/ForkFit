from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from typing import Any

from forkfit.llm import BailianLLMClient

from .models import CaseResult, EvalCase, EvalReport, MetricResult


HARD_INVARIANTS = {
    "preserve_recipe_ids",
    "preserve_recipe_count",
    "safe_substitutions_from_tool",
    "selected_pool_only",
    "no_duplicate_posts",
    "continuous_days",
    "one_to_three_dishes",
    "max_one_repair",
}


class SemanticJudge:
    def __init__(self, model: str | None = None) -> None:
        self.client = BailianLLMClient(
            model=model or os.getenv("EVAL_JUDGE_MODEL", "qwen3.7-max-2026-06-08")
        )

    def grade(self, case: EvalCase, output: dict[str, Any]) -> dict[str, Any]:
        return self.grade_payload(
            checks=case.reference.semantic_checks,
            inputs=case.input.model_dump(mode="json"),
            output=output,
        )

    def grade_payload(
        self, *, checks: list[str], inputs: dict[str, Any], output: dict[str, Any]
    ) -> dict[str, Any]:
        return self.client.complete_json(
            agent="eval_judge",
            system=(
                "你是菜谱与饮食规划评测员。只评价给定检查项，不判断过敏安全。"
                "identity_preserved 表示菜品类型、主要做法和用途仍是原菜；为满足过敏要求替换一种食材，或同步清理菜名中的禁忌食材，不能自动判为身份改变。"
                "culinary_feasible 表示给定食材、厨具、时间和步骤能够完成；"
                "ingredient_step_consistent 表示步骤使用的食材与清单一致；preference_fit 表示结果没有违背明确偏好；"
                "plan_quality 表示菜单来自候选池、跨天安排合理且没有明显的执行冲突，不要求证明它是所有候选中的全局最优。"
                "候选菜谱允许不全部使用，购物清单只需要覆盖实际排入菜单的菜，不能因此判为遗漏。"
                "各项必须独立评分，不能因为一项失败就连带把其他项判为失败。"
                "例如菜名、食材和做法目标未变但步骤缺少烹饪动作时，identity_preserved=true、culinary_feasible=false；"
                "输出换成了另一道菜但新菜自身步骤完整时，identity_preserved=false、culinary_feasible=true。"
                "只评价 checks 中列出的项目；每项返回布尔值，并在 comment 中写一句简短依据。只返回 JSON。"
            ),
            user=json.dumps({
                "checks": checks,
                "input": inputs,
                "actual_output": output,
                "schema": {
                    "identity_preserved": "boolean",
                    "culinary_feasible": "boolean",
                    "ingredient_step_consistent": "boolean",
                    "preference_fit": "boolean",
                    "plan_quality": "boolean",
                    "comment": "string",
                },
            }, ensure_ascii=False),
            max_tokens=700,
        )


def run_judge_calibration(path: str | os.PathLike[str]) -> dict[str, Any]:
    judge = SemanticJudge()
    total = 0
    matched = 0
    examples = 0
    failures: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for raw in handle:
            if not raw.strip():
                continue
            examples += 1
            item = json.loads(raw)
            grade = judge.grade_payload(
                checks=list(item["checks"]),
                inputs=dict(item["input"]),
                output=dict(item["output"]),
            )
            for check in item["checks"]:
                total += 1
                if bool(grade.get(check)) == bool(item["expected"][check]):
                    matched += 1
                else:
                    failures.append({
                        "id": item["id"], "check": check,
                        "expected": item["expected"][check],
                        "actual": grade.get(check),
                    })
    return {
        "examples": examples,
        "labels": total,
        "matched": matched,
        "agreement": round(matched / total, 4) if total else 0,
        "failures": failures,
    }


def evaluate_case(
    case: EvalCase,
    output: dict[str, Any],
    *,
    judge: SemanticJudge | None = None,
    error: str = "",
) -> CaseResult:
    metrics: list[MetricResult] = []
    metrics.append(_metric(
        "expected_action",
        output.get("action") == case.reference.expected_action,
        f"expected={case.reference.expected_action}, actual={output.get('action')}",
        hard=True,
    ))
    metrics.extend(_constraint_metrics(case, output))
    metrics.extend(_affected_metrics(case, output))
    metrics.extend(_tool_metrics(case, output))
    for invariant in case.reference.required_invariants:
        metrics.append(_invariant_metric(invariant, case, output))
    if case.reference.semantic_checks:
        if judge is None:
            metrics.append(MetricResult(
                key="semantic_not_run", score=1, comment="semantic judge disabled"
            ))
        else:
            grade = judge.grade(case, output)
            for check in case.reference.semantic_checks:
                metrics.append(_metric(
                    f"semantic_{check}",
                    bool(grade.get(check)),
                    str(grade.get("comment", "")),
                ))
    passed = not error and all(item.score == 1 for item in metrics if item.hard_gate)
    passed = passed and all(item.score >= 0.5 for item in metrics if item.key.startswith("semantic_"))
    return CaseResult(
        case_id=case.id,
        target=case.target,
        action=str(output.get("action", "error")),
        passed=passed,
        metrics=metrics,
        output=output,
        error=error,
    )


def build_report(results: list[CaseResult], *, mode: str, split: str) -> EvalReport:
    grouped: dict[str, list[float]] = defaultdict(list)
    hard_failures: list[str] = []
    for result in results:
        for metric in result.metrics:
            grouped[metric.key].append(metric.score)
            if metric.hard_gate and metric.score < 1:
                hard_failures.append(f"{result.case_id}:{metric.key}")
    passed = sum(result.passed for result in results)
    return EvalReport(
        dataset_version="forkfit-agent-evals-v1",
        mode=mode,
        split=split,
        case_count=len(results),
        passed=passed,
        failed=len(results) - passed,
        pass_rate=round(passed / len(results), 4) if results else 0,
        metric_averages={key: round(sum(values) / len(values), 4) for key, values in sorted(grouped.items())},
        hard_gate_failures=hard_failures,
        cases=results,
    )


def _constraint_metrics(case: EvalCase, output: dict[str, Any]) -> list[MetricResult]:
    expected = {(item.kind, _normalize(item.value)) for item in case.reference.expected_constraints}
    if not expected:
        return []
    relevant_kinds = {kind for kind, _value in expected}
    actual = {
        (str(item.get("kind", "")), _normalize(item.get("value", "")))
        for item in output.get("constraints", [])
        if str(item.get("kind", "")) in relevant_kinds
    }
    if "time" in relevant_kinds and output.get("max_cook_time_minutes") is not None:
        actual.add(("time", _normalize(output["max_cook_time_minutes"])))
    true_positive = len(expected & actual)
    precision = true_positive / len(actual) if actual else 0
    recall = true_positive / len(expected) if expected else 1
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    hard_recall = all(
        (item.kind, _normalize(item.value)) in actual
        for item in case.reference.expected_constraints
        if item.hard
    )
    return [
        MetricResult(key="constraint_precision", score=round(precision, 4)),
        MetricResult(key="constraint_recall", score=round(recall, 4)),
        MetricResult(key="constraint_f1", score=round(f1, 4)),
        _metric("hard_constraint_recall", hard_recall, hard=True),
    ]


def _affected_metrics(case: EvalCase, output: dict[str, Any]) -> list[MetricResult]:
    results: list[MetricResult] = []
    if case.reference.affected_recipe_ids:
        expected = set(case.reference.affected_recipe_ids)
        actual = set(output.get("affected_recipe_ids", []))
        results.append(_metric("affected_recipe_recall", expected.issubset(actual), f"actual={sorted(actual)}"))
    if case.reference.affected_ingredients:
        expected = {_normalize(value) for value in case.reference.affected_ingredients}
        actual = {_normalize(value) for value in output.get("affected_ingredients", [])}
        results.append(_metric("affected_ingredient_recall", expected.issubset(actual), f"actual={sorted(actual)}"))
    return results


def _tool_metrics(case: EvalCase, output: dict[str, Any]) -> list[MetricResult]:
    policy = case.reference.tool_policy
    calls = output.get("trace", {}).get("tool_calls", [])
    matching = [call for call in calls if call.get("tool") == policy.tool]
    correct_decision = bool(matching) if policy.should_call else not calls
    metrics = [_metric("tool_decision", correct_decision, f"calls={len(calls)}", hard=policy.should_call)]
    metrics.append(_metric(
        "tool_permission",
        all(call.get("tool") == policy.tool for call in calls),
        hard=True,
    ))
    metrics.append(_metric("tool_call_limit", len(calls) <= policy.max_calls, hard=True))
    if policy.should_call:
        arguments_ok = bool(matching) and any(
            _arguments_match(call.get("arguments", {}), policy.argument_requirements)
            for call in matching
        )
        metrics.append(_metric("tool_arguments", arguments_ok, hard=True))
    return metrics


def _invariant_metric(invariant: str, case: EvalCase, output: dict[str, Any]) -> MetricResult:
    passed = True
    comment = ""
    if invariant in {"preserve_recipe_ids", "preserve_recipe_count"}:
        original = (case.input.meal_pack or {}).get("meals", [])
        adjusted = output.get("meal_pack", {}).get("meals", [])
        if invariant == "preserve_recipe_ids":
            passed = [item.get("id") for item in original] == [item.get("id") for item in adjusted]
        else:
            passed = len(original) == len(adjusted)
    elif invariant == "safe_substitutions_from_tool":
        allowed = {
            _normalize(item.get("substitute", ""))
            for item in case.reference.tool_policy.fixture_results
        }
        safety_targets = {_normalize(value) for value in case.reference.affected_ingredients}
        replacements = [
            item for item in output.get("change_log", [])
            if _normalize(item.get("from_value", "")) in safety_targets
        ]
        passed = bool(replacements) and all(_normalize(item.get("to_value", "")) in allowed for item in replacements)
    elif invariant == "max_one_repair":
        passed = int(output.get("trace", {}).get("repair_count", output.get("revision_count", 0))) <= 1
    elif invariant in {"selected_pool_only", "no_duplicate_posts", "continuous_days", "one_to_three_dishes"}:
        days = output.get("result", {}).get("days", [])
        selected = {str(item.get("post_id")) for item in case.input.selected_recipes}
        used = [str(dish.get("source_post_id")) for day in days for dish in day.get("dishes", [])]
        if invariant == "selected_pool_only":
            passed = bool(used) and set(used).issubset(selected)
        elif invariant == "no_duplicate_posts":
            passed = len(used) == len(set(used))
        elif invariant == "continuous_days":
            passed = [day.get("day_index") for day in days] == list(range(1, len(days) + 1))
        else:
            passed = bool(days) and all(1 <= len(day.get("dishes", [])) <= 3 for day in days)
    else:
        comment = "unknown invariant"
        passed = False
    return _metric(invariant, passed, comment, hard=invariant in HARD_INVARIANTS)


def _arguments_match(actual: dict[str, Any], requirements: dict[str, Any]) -> bool:
    for key, expected in requirements.items():
        value = actual.get(key)
        if isinstance(expected, list):
            if not isinstance(value, list) or not {_normalize(item) for item in expected}.issubset({_normalize(item) for item in value}):
                return False
        elif isinstance(expected, str):
            if _normalize(expected) not in _normalize(value):
                return False
        elif value != expected:
            return False
    return True


def _normalize(value: Any) -> str:
    return re.sub(r"\s+", "", str(value)).casefold()


def _metric(key: str, passed: bool, comment: str = "", *, hard: bool = False) -> MetricResult:
    return MetricResult(key=key, score=1 if passed else 0, comment=comment, hard_gate=hard)
