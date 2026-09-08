from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .models import EvalCase


DATASET_VERSION = "forkfit-agent-evals-v1"


def default_dataset_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "evals" / "datasets"


def load_cases(
    dataset_dir: Path | None = None,
    *,
    split: str = "all",
    smoke_only: bool = False,
) -> list[EvalCase]:
    root = dataset_dir or default_dataset_dir()
    cases: list[EvalCase] = []
    for path in sorted(root.glob("*.jsonl")):
        with path.open("r", encoding="utf-8") as handle:
            for line_number, raw in enumerate(handle, start=1):
                if not raw.strip():
                    continue
                try:
                    case = EvalCase.model_validate_json(raw)
                except Exception as exc:
                    raise ValueError(f"Invalid eval case at {path}:{line_number}: {exc}") from exc
                if split not in {"all", case.metadata.split}:
                    continue
                if smoke_only and not case.metadata.smoke:
                    continue
                cases.append(case)
    ids = [case.id for case in cases]
    if len(ids) != len(set(ids)):
        duplicates = sorted({case_id for case_id in ids if ids.count(case_id) > 1})
        raise ValueError(f"Duplicate eval case ids: {duplicates}")
    if not cases:
        raise ValueError(f"No evaluation cases found in {root}")
    return cases


def dataset_digest(cases: list[EvalCase]) -> str:
    canonical = "\n".join(
        case.model_dump_json(exclude_none=True) for case in sorted(cases, key=lambda item: item.id)
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]
