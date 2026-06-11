from __future__ import annotations

import logging
from dataclasses import asdict
from functools import lru_cache

from forkfit.api.schemas import PublicRunError, result_payload_from_forkfit

logger = logging.getLogger(__name__)
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.langgraph_workflow import ForkFitLangGraphWorkflow
from forkfit.observability import LangSmithRunExporter
from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict
from forkfit.stores import PostgresRunStore


@lru_cache(maxsize=1)
def _get_workflow() -> ForkFitLangGraphWorkflow:
    return ForkFitLangGraphWorkflow()


def _build_failure_message(result, locale: str = "zh") -> str:
    """Build a user-friendly error message from constraint findings."""
    findings = []

    if result.final_review and result.final_review.findings:
        findings.extend(result.final_review.findings)
    if result.adapter_output and result.adapter_output.unresolved_items:
        findings.extend(result.adapter_output.unresolved_items)

    is_zh = locale.startswith("zh")

    if not findings:
        return "这道菜暂时无法适配你的偏好，建议换个菜谱试试。" if is_zh else "This dish can't be adapted to your preferences right now. Try another recipe."

    # Use finding messages directly (already user-friendly from ConstraintGuard)
    messages = []
    seen = set()
    for f in findings:
        if f.type in seen:
            continue
        seen.add(f.type)
        if f.message:
            messages.append(f.message)

    if not messages:
        return "这道菜暂时无法适配你的偏好，建议换个菜谱试试。" if is_zh else "This dish can't be adapted to your preferences right now. Try another recipe."

    prefix = "很抱歉，这道菜没法为你适配：\n" if is_zh else "Sorry, this dish couldn't be adapted:\n"
    return prefix + "\n".join(f"• {m}" for m in messages)


def run_forkfit_job(run_id: str, user_profile_payload: dict, meal_pack_payload: dict, locale: str = "en") -> None:
    settings = get_settings()
    store = PostgresRunStore(make_session_factory(settings.database_url))
    meal_pack = meal_pack_from_dict(meal_pack_payload)
    user_profile = user_profile_from_dict(user_profile_payload)

    store.mark_running(run_id)
    exporter = LangSmithRunExporter(settings)
    try:
        def on_step_complete(trace):
            store.update_trace(run_id, trace)

        result = _get_workflow().run(
            user_profile, meal_pack, locale=locale,
            on_step_complete=on_step_complete,
        )
        if result.success:
            record = store.mark_succeeded(
                run_id,
                result=result_payload_from_forkfit(meal_pack, result),
                trace=result.trace,
            )
        elif result.adapter_output and result.adapter_output.unresolved_items:
            # Has unresolved items → needs human input
            partial_result = result_payload_from_forkfit(meal_pack, result)
            unresolved = {
                "items": [asdict(f) for f in result.adapter_output.unresolved_items],
                "message": _build_failure_message(result, locale),
                "partial_result": partial_result.model_dump(mode="json"),
            }
            record = store.mark_needs_input(
                run_id,
                unresolved=unresolved,
                trace=result.trace,
            )
        else:
            # No unresolved items but still failed → true failure
            partial_result = result_payload_from_forkfit(meal_pack, result)
            record = store.mark_failed(
                run_id,
                error=PublicRunError(message=_build_failure_message(result, locale)),
                trace=result.trace,
                result=partial_result,
            )
        exporter.export_run(record)
    except Exception as exc:
        logger.exception("Run %s failed", run_id)
        error_msg = f"运行失败：{type(exc).__name__}: {str(exc)[:200]}"
        record = store.mark_failed(
            run_id,
            error=PublicRunError(message=error_msg),
        )
        exporter.export_run(record)
