from __future__ import annotations

import logging

from forkfit.api.schemas import PublicRunError, result_payload_from_forkfit

logger = logging.getLogger(__name__)
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.langgraph_workflow import ForkFitLangGraphWorkflow
from forkfit.observability import LangSmithRunExporter
from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict
from forkfit.stores import PostgresRunStore


def _broadcast(run_id: str, status: str, settings) -> None:
    """Broadcast run status update via Redis pub/sub."""
    try:
        from forkfit.redis_utils import get_pubsub
        pubsub = get_pubsub(settings.redis_url)
        if pubsub:
            pubsub.broadcast_run_update(run_id, status)
    except Exception:
        pass  # Broadcasting is best-effort


def _build_failure_message(result, locale: str = "zh") -> str:
    """Build a user-friendly error message from actual constraint findings."""
    findings = []

    # Collect findings from final_review
    if result.final_review and result.final_review.findings:
        findings.extend(result.final_review.findings)

    # Collect unresolved items from adapter output
    if result.adapter_output and result.adapter_output.unresolved_items:
        findings.extend(result.adapter_output.unresolved_items)

    is_zh = locale.startswith("zh")
    if not findings:
        return "该餐包无法安全适配，请调整厨具或食材后重试。" if is_zh else "Cannot safely adapt this meal pack. Please adjust equipment or ingredients."

    # Group findings by type
    by_type: dict[str, list[str]] = {}
    type_labels = {
        "allergy": ("过敏源", "Allergen"),
        "diet_rule": ("饮食规则", "Diet rule"),
        "equipment": ("厨具", "Equipment"),
        "budget": ("预算", "Budget"),
        "time": ("烹饪时间", "Cooking time"),
        "meal_identity": ("餐食结构", "Meal structure"),
    }
    for f in findings:
        label = type_labels.get(f.type, (f.type, f.type))[0 if is_zh else 1]
        by_type.setdefault(label, []).append(f.message)

    sep = "；" if is_zh else "; "
    parts = []
    for label, messages in by_type.items():
        parts.append(f"**{label}**：" + sep.join(messages) if is_zh else f"**{label}**: " + sep.join(messages))

    prefix = "该餐包无法安全适配：\n" if is_zh else "Cannot safely adapt this meal pack:\n"
    return prefix + "\n".join(parts)


def run_forkfit_job(run_id: str, user_profile_payload: dict, meal_pack_payload: dict, locale: str = "en") -> None:
    settings = get_settings()
    store = PostgresRunStore(make_session_factory(settings.database_url))
    meal_pack = meal_pack_from_dict(meal_pack_payload)
    user_profile = user_profile_from_dict(user_profile_payload)

    # Broadcast: running
    _broadcast(run_id, "running", settings)

    store.mark_running(run_id)
    exporter = LangSmithRunExporter(settings)
    try:
        result = ForkFitLangGraphWorkflow().run(user_profile, meal_pack, locale=locale)
        if result.success:
            record = store.mark_succeeded(
                run_id,
                result=result_payload_from_forkfit(meal_pack, result),
                trace=result.trace,
            )
            _broadcast(run_id, "succeeded", settings)
        else:
            # Store partial result so frontend can show what went wrong
            partial_result = result_payload_from_forkfit(meal_pack, result)
            record = store.mark_failed(
                run_id,
                error=PublicRunError(message=_build_failure_message(result, locale)),
                trace=result.trace,
                result=partial_result,
            )
            _broadcast(run_id, "failed", settings)
        exporter.export_run(record)
    except Exception as exc:
        logger.exception("Run %s failed", run_id)
        error_msg = f"运行失败：{type(exc).__name__}: {str(exc)[:200]}"
        record = store.mark_failed(
            run_id,
            error=PublicRunError(message=error_msg),
        )
        _broadcast(run_id, "failed", settings)
        exporter.export_run(record)
