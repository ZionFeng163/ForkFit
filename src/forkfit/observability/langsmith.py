from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from uuid import NAMESPACE_URL, uuid5

from langsmith import Client

from forkfit.config import Settings
from forkfit.stores.base import RunRecord

logger = logging.getLogger(__name__)


class LangSmithRunExporter:
    def __init__(self, settings: Settings, client: Client | None = None) -> None:
        self.settings = settings
        self.client = client

    @property
    def enabled(self) -> bool:
        return self.settings.langsmith_tracing and bool(self.settings.langsmith_api_key)

    def export_run(self, run: RunRecord) -> None:
        if not self.enabled:
            return
        try:
            client = self.client or Client(
                api_key=self.settings.langsmith_api_key,
                api_url=self.settings.langsmith_endpoint or None,
            )
            metrics = _metrics(run)
            client.create_run(
                id=uuid5(NAMESPACE_URL, f"forkfit:{run.id}"),
                name="forkfit.workflow",
                run_type="chain",
                project_name=self.settings.langsmith_project,
                inputs={
                    "run_id": run.id,
                    "meal_pack_id": run.original_meal_pack.id,
                    "meal_count": len(run.original_meal_pack.meals),
                },
                outputs={
                    "status": run.status,
                    "success": run.status == "succeeded",
                    "llm_call_count": metrics["llm_call_count"],
                    "total_duration_ms": metrics["total_duration_ms"],
                },
                start_time=run.started_at or _estimated_start(run),
                end_time=run.finished_at or datetime.now(timezone.utc),
                tags=["forkfit", run.status],
                extra={
                    "metadata": {
                        "run_id": run.id,
                        "user_id": run.user_id,
                        "status": run.status,
                        "error_message": run.error.message if run.error else "",
                        **metrics,
                    }
                },
            )
        except Exception as exc:
            logger.warning("LangSmith export failed for run %s: %s", run.id, exc)


def _estimated_start(run: RunRecord) -> datetime:
    total_ms = run.trace.total_duration_ms if run.trace else 0
    finished_at = run.finished_at or datetime.now(timezone.utc)
    return finished_at - timedelta(milliseconds=total_ms)


def _metrics(run: RunRecord) -> dict:
    trace = run.trace
    if trace is None:
        return {
            "total_duration_ms": 0,
            "llm_call_count": 0,
            "step_durations_ms": {},
            "llm_calls": [],
        }
    return {
        "total_duration_ms": trace.total_duration_ms,
        "llm_call_count": trace.llm_call_count,
        "step_durations_ms": {
            step.node: step.duration_ms for step in trace.steps
        },
        "llm_calls": [
            {
                "agent": call.agent,
                "model": call.model,
                "duration_ms": call.duration_ms,
                "prompt_tokens": call.prompt_tokens,
                "completion_tokens": call.completion_tokens,
                "status": call.status,
            }
            for call in trace.llm_calls
        ],
    }
