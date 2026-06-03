from __future__ import annotations

import logging
from dataclasses import asdict

from forkfit.api.schemas import PublicRunError, result_payload_from_forkfit

logger = logging.getLogger(__name__)
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.langgraph_workflow import ForkFitLangGraphWorkflow
from forkfit.observability import LangSmithRunExporter
from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict
from forkfit.stores import PostgresRunStore


def _broadcast(run_id: str, status: str, settings, extra: dict | None = None) -> None:
    """Broadcast run status update via Redis pub/sub."""
    try:
        from forkfit.redis_utils import get_pubsub
        pubsub = get_pubsub(settings.redis_url)
        if pubsub:
            pubsub.broadcast_run_update(run_id, status, extra=extra)
    except Exception:
        pass  # Broadcasting is best-effort


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

    # Map finding types to friendly messages
    friendly = {
        "allergy": (
            lambda f: f.message if is_zh and "含有" in f.message
            else f"这道菜含有你的过敏源，没法安全替换。" if is_zh
            else f.message,
        ),
        "diet_rule": (
            lambda f: f.message if is_zh and "冲突" in f.message
            else f"这道菜不符合你的饮食规则。" if is_zh
            else f.message,
        ),
        "equipment": (
            lambda f: f.message if is_zh and "厨具" in f.message
            else f"这道菜需要你没有的厨具，但可以尝试换个做法。" if is_zh
            else f.message,
        ),
        "budget": (
            lambda f: f.message if is_zh and "预算" in f.message
            else f"即使替换后仍然超出预算。" if is_zh
            else f.message,
        ),
        "time": (
            lambda f: f.message if is_zh and "分钟" in f.message
            else f"即使调整后仍然超过你的烹饪时间限制。" if is_zh
            else f.message,
        ),
    }

    messages = []
    seen = set()
    for f in findings:
        if f.type in seen:
            continue
        seen.add(f.type)
        fn = friendly.get(f.type)
        if fn:
            messages.append(fn(f))

    if not messages:
        return "这道菜暂时无法适配你的偏好，建议换个菜谱试试。" if is_zh else "This dish can't be adapted to your preferences right now. Try another recipe."

    prefix = "很抱歉，这道菜没法为你适配：\n" if is_zh else "Sorry, this dish couldn't be adapted for you:\n"
    return prefix + "\n".join(f"• {m}" for m in messages)


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
        def on_step_complete(trace):
            store.update_trace(run_id, trace)
            trace_dict = asdict(trace)
            _broadcast(run_id, "running", settings, extra={"trace": trace_dict})

        result = ForkFitLangGraphWorkflow().run(
            user_profile, meal_pack, locale=locale,
            on_step_complete=on_step_complete,
        )
        if result.success:
            record = store.mark_succeeded(
                run_id,
                result=result_payload_from_forkfit(meal_pack, result),
                trace=result.trace,
            )
            _broadcast(run_id, "succeeded", settings)
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
            _broadcast(run_id, "needs_input", settings)
        else:
            # No unresolved items but still failed → true failure
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
