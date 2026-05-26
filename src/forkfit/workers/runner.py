from __future__ import annotations

from forkfit.api.schemas import PublicRunError, result_payload_from_forkfit
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.langgraph_workflow import ForkFitLangGraphWorkflow
from forkfit.observability import LangSmithRunExporter
from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict
from forkfit.stores import PostgresRunStore


def run_forkfit_job(run_id: str, user_profile_payload: dict, meal_pack_payload: dict) -> None:
    settings = get_settings()
    store = PostgresRunStore(make_session_factory(settings.database_url))
    meal_pack = meal_pack_from_dict(meal_pack_payload)
    user_profile = user_profile_from_dict(user_profile_payload)

    store.mark_running(run_id)
    exporter = LangSmithRunExporter(settings)
    try:
        result = ForkFitLangGraphWorkflow().run(user_profile, meal_pack)
        if result.success:
            record = store.mark_succeeded(
                run_id,
                result=result_payload_from_forkfit(meal_pack, result),
                trace=result.trace,
            )
        else:
            record = store.mark_failed(
                run_id,
                error=PublicRunError(
                    message="该饭包无法安全适配，请调整过敏源、厨具或食材后重试。"
                ),
                trace=result.trace,
            )
        exporter.export_run(record)
    except Exception:
        record = store.mark_failed(
            run_id,
            error=PublicRunError(message="运行失败，请稍后重试。"),
        )
        exporter.export_run(record)
