from __future__ import annotations

import unittest
import json

from forkfit.evals.evaluators import build_report, evaluate_case
from forkfit.evals.loader import load_cases
from forkfit.evals.loader import default_dataset_dir
from forkfit.evals.targets import run_case


class AgentEvaluationHarnessTests(unittest.TestCase):
    def test_dataset_has_expected_size_splits_and_smoke_slice(self) -> None:
        cases = load_cases()
        self.assertEqual(len(cases), 120)
        self.assertEqual(sum(item.metadata.split == "development" for item in cases), 80)
        self.assertEqual(sum(item.metadata.split == "holdout" for item in cases), 40)
        self.assertEqual(sum(item.metadata.smoke for item in cases), 12)
        self.assertEqual(sum(item.target in {"constraint_review", "recipe_graph"} for item in cases), 80)
        self.assertEqual(sum(item.target in {"planning_graph", "parent_graph"} for item in cases), 40)
        calibration = default_dataset_dir().parent / "calibration" / "semantic_judge.jsonl"
        with calibration.open(encoding="utf-8") as handle:
            rows = [json.loads(line) for line in handle if line.strip()]
        self.assertEqual(len(rows), 20)

    def test_reference_llm_smoke_cases_pass_hard_gates(self) -> None:
        results = []
        for case in load_cases(smoke_only=True):
            output = run_case(case, mode="fake")
            results.append(evaluate_case(case, output))
        report = build_report(results, mode="fake", split="smoke")
        self.assertEqual(report.case_count, 12)
        self.assertEqual(report.hard_gate_failures, [])
        self.assertEqual(report.failed, 0)


if __name__ == "__main__":
    unittest.main()
