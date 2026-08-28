from __future__ import annotations

import logging
import urllib.error
from functools import lru_cache

from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.meal_planner import MealPlanNeedsInput, MealPlanWorkflow
from forkfit.meal_plan_conversation import MealPlanConversationWorkflow
from forkfit.stores.meal_plans import PostgresMealPlanStore

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_workflow() -> MealPlanWorkflow:
    return MealPlanWorkflow()


def run_meal_plan_job(plan_id: str, request_payload: dict) -> None:
    settings = get_settings()
    store = PostgresMealPlanStore(make_session_factory(settings.database_url))

    try:
        result = _get_workflow().run(
            request_payload,
            on_stage=lambda stage, progress: store.update_stage(
                plan_id, stage=stage, progress=progress
            ),
        )
        store.mark_succeeded(plan_id, result)
    except MealPlanNeedsInput as exc:
        store.mark_needs_input(plan_id, exc.message, exc.issues)
    except Exception:
        logger.exception("Meal plan %s failed", plan_id)
        locale = str(request_payload.get("locale", "zh"))
        message = (
            "菜单规划暂时失败，你的选择已经保留，请稍后重试。"
            if locale.startswith("zh")
            else "Meal planning failed temporarily. Your selections are still available."
        )
        store.mark_failed(plan_id, message)


def run_meal_plan_message_job(
    message_id: str,
    plan_id: str,
    content: str,
    confirmed: bool = False,
) -> None:
    settings = get_settings()
    store = PostgresMealPlanStore(make_session_factory(settings.database_url))
    plan = store.get_plan(plan_id)
    if plan is None:
        store.mark_message_failed(message_id, "这份菜单已经不存在，请返回计划列表。")
        return
    try:
        workflow = MealPlanConversationWorkflow()
        intent = workflow.parse_intent(content, plan)
        if intent.kind == "undo":
            previous = store.get_previous_result(plan.id, plan.current_version_id)
            if previous is None:
                raise ValueError("当前还没有可以恢复的上一版菜单。")
            result = previous[1]
            response = {
                "message": "已恢复上一版菜单，当前修改仍保留在历史记录中。",
                "summary": "已撤销上一次修改。",
                "changes": _change_preview(plan.result, result),
            }
            store.complete_message(
                message_id,
                result=result,
                intent="undo",
                response=response,
                patch={"restore_version_id": previous[0]},
                request_text=content,
                created_by=plan.user_id,
            )
            return
        outcome = workflow.process(plan, content, confirmed=confirmed)
        response = {"message": outcome.message, "summary": outcome.summary}
        if outcome.status == "needs_clarification":
            store.mark_message_needs_clarification(
                message_id, intent=outcome.intent.kind, response=response
            )
            return
        if outcome.status == "needs_confirmation":
            store.mark_message_needs_confirmation(
                message_id,
                intent=outcome.intent.kind,
                response={**response, "requires_confirmation": True},
                patch=outcome.patch.model_dump(mode="json") if outcome.patch else None,
            )
            return
        if outcome.result is None:
            raise ValueError("修改没有生成新的菜单结果。")
        response["changes"] = _change_preview(plan.result, outcome.result)
        store.complete_message(
            message_id,
            result=outcome.result,
            intent=outcome.intent.kind,
            response=response,
            patch=outcome.patch.model_dump(mode="json") if outcome.patch else None,
            request_text=content,
            created_by=plan.user_id,
            create_version=outcome.intent.kind != "explain",
            locked_days=outcome.locked_days,
        )
    except urllib.error.HTTPError as exc:
        logger.exception("Meal plan message %s failed with an LLM HTTP error", message_id)
        if exc.code in {401, 403, 429} or exc.code >= 500:
            error_message = "AI 服务暂时不可用，这次修改没有应用。请稍后重试，当前菜单保持不变。"
        else:
            error_message = "AI 服务没有接受这次修改，当前菜单保持不变，请换一种说法重试。"
        store.mark_message_failed(message_id, error_message)
    except ValueError as exc:
        logger.exception("Meal plan message %s failed validation", message_id)
        store.mark_message_failed(
            message_id,
            str(exc) or "这次修改没有通过菜单校验，当前菜单保持不变，请换一种说法重试。",
        )
    except Exception:
        logger.exception("Meal plan message %s failed", message_id)
        store.mark_message_failed(message_id, "这次修改没有应用，当前菜单保持不变，请换一种说法重试。")


def _change_preview(before, after) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    before_by_day = {day.day_index: day for day in before.days}
    for day in after.days:
        previous = before_by_day.get(day.day_index)
        if previous is None:
            continue
        before_payload = [item.model_dump(mode="json") for item in previous.dishes]
        after_payload = [item.model_dump(mode="json") for item in day.dishes]
        if before_payload != after_payload:
            changes.append(
                {
                    "day_index": day.day_index,
                    "before": "、".join(item.meal.name for item in previous.dishes),
                    "after": "、".join(item.meal.name for item in day.dishes),
                    "changed_fields": ["菜品组合"],
                }
            )
    return changes
