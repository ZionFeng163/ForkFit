from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from forkfit.config import load_env

from .evaluators import SemanticJudge, build_report, evaluate_case, run_judge_calibration
from .loader import DATASET_VERSION, dataset_digest, default_dataset_dir, load_cases
from .models import EvalCase
from .targets import run_case


def run_local(
    cases: list[EvalCase], *, mode: str, repetitions: int,
    with_judge: bool, split: str,
):
    judge = SemanticJudge() if with_judge and mode == "live" else None
    results = []
    for _repeat in range(repetitions):
        for case in cases:
            try:
                output = run_case(case, mode=mode)
                results.append(evaluate_case(case, output, judge=judge))
            except Exception as exc:
                results.append(evaluate_case(
                    case,
                    {"action": "error"},
                    judge=None,
                    error=f"{type(exc).__name__}: {exc}",
                ))
    return build_report(results, mode=mode, split=split)


def run_langsmith(
    cases: list[EvalCase], *, mode: str, repetitions: int, with_judge: bool,
) -> Any:
    from langsmith import Client

    client = Client()
    digest = dataset_digest(cases)
    dataset_name = f"{DATASET_VERSION}-{digest}"
    if not client.has_dataset(dataset_name=dataset_name):
        dataset = client.create_dataset(
            dataset_name=dataset_name,
            description="ForkFit 双子图 Agent 分层评测集；本地 JSONL 为唯一来源。",
        )
        client.create_examples(
            dataset_id=dataset.id,
            examples=[{
                "inputs": {"case_id": case.id},
                "outputs": {"case": case.model_dump(mode="json")},
                "metadata": case.metadata.model_dump(mode="json"),
            } for case in cases],
        )
    by_id = {case.id: case for case in cases}
    judge = SemanticJudge() if with_judge and mode == "live" else None

    def target(inputs: dict[str, Any]) -> dict[str, Any]:
        return run_case(by_id[str(inputs["case_id"])], mode=mode)

    def overall(outputs: dict[str, Any], reference_outputs: dict[str, Any]) -> dict[str, Any]:
        case = EvalCase.model_validate(reference_outputs["case"])
        result = evaluate_case(case, outputs, judge=judge)
        failed = [metric.key for metric in result.metrics if metric.hard_gate and metric.score < 1]
        return {
            "key": "forkfit_eval_pass",
            "score": result.passed,
            "comment": ", ".join(failed) if failed else "passed",
        }

    return client.evaluate(
        target,
        data=dataset_name,
        evaluators=[overall],
        experiment_prefix=f"forkfit-{mode}",
        num_repetitions=repetitions,
        max_concurrency=2,
        metadata={
            "models": [
                os.getenv("BAILIAN_MODEL", "deepseek-v4-flash-0731"),
                *([os.getenv("EVAL_JUDGE_MODEL", "qwen3.7-max-2026-06-08")] if with_judge else []),
            ],
            "prompts": ["recipe-review-v3", "recipe-adaptation-v3", "meal-plan-v4"],
            "tools": ["search_substitutions"],
            "dataset_digest": digest,
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ForkFit Agent evaluations")
    parser.add_argument("--split", choices=["all", "development", "holdout"], default="all")
    parser.add_argument("--smoke", action="store_true", help="run only the 12 smoke cases")
    parser.add_argument("--mode", choices=["fake", "live"], default="fake")
    parser.add_argument("--repetitions", type=int, default=1)
    parser.add_argument("--with-judge", action="store_true")
    parser.add_argument("--upload-langsmith", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--summary-only", action="store_true")
    parser.add_argument("--case-id", action="append", default=[])
    parser.add_argument("--calibrate-judge", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.repetitions <= 5:
        parser.error("--repetitions must be between 1 and 5")
    load_env()
    if args.calibrate_judge:
        calibration_path = default_dataset_dir().parent / "calibration" / "semantic_judge.jsonl"
        result = run_judge_calibration(calibration_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["agreement"] >= 0.9 else 1
    cases = load_cases(split=args.split, smoke_only=args.smoke)
    if args.case_id:
        selected_ids = set(args.case_id)
        cases = [case for case in cases if case.id in selected_ids]
        missing = selected_ids - {case.id for case in cases}
        if missing:
            parser.error("unknown --case-id values: " + ", ".join(sorted(missing)))
    if args.upload_langsmith:
        run_langsmith(cases, mode=args.mode, repetitions=args.repetitions, with_judge=args.with_judge)
        return 0
    report = run_local(
        cases,
        mode=args.mode,
        repetitions=args.repetitions,
        with_judge=args.with_judge,
        split="smoke" if args.smoke else args.split,
    )
    payload = report.model_dump_json(indent=2)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    if args.summary_only:
        print(json.dumps({
            "dataset_version": report.dataset_version,
            "case_count": report.case_count,
            "passed": report.passed,
            "failed": report.failed,
            "pass_rate": report.pass_rate,
            "metric_averages": report.metric_averages,
            "hard_gate_failures": report.hard_gate_failures,
            "failed_cases": [{
                "case_id": item.case_id,
                "action": item.action,
                "error": item.error,
                "failed_metrics": [{
                    "key": metric.key,
                    "score": metric.score,
                    "comment": metric.comment,
                } for metric in item.metrics if metric.score < 1],
                "affected_recipe_ids": item.output.get("affected_recipe_ids", []),
                "affected_ingredients": item.output.get("affected_ingredients", []),
                "tool_calls": item.output.get("trace", {}).get("tool_calls", []),
                "final_review": item.output.get("final_review"),
                "quality_report": item.output.get("quality_report"),
                "unresolved_items": item.output.get("unresolved_items", []),
            } for item in report.cases if not item.passed],
        }, ensure_ascii=False, indent=2))
    else:
        print(payload)
    semantic_scores = [
        metric.score for item in report.cases for metric in item.metrics
        if metric.key.startswith("semantic_") and metric.key != "semantic_not_run"
    ]
    semantic_pass = not semantic_scores or sum(semantic_scores) / len(semantic_scores) >= 0.85
    expected_action = report.metric_averages.get("expected_action", 1)
    constraint_f1 = report.metric_averages.get("constraint_f1", 1)
    tool_decision = report.metric_averages.get("tool_decision", 1)
    gates_pass = (
        not report.hard_gate_failures
        and expected_action >= 0.9
        and constraint_f1 >= 0.9
        and tool_decision >= 0.9
        and semantic_pass
    )
    return 0 if gates_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
