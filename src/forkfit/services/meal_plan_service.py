from __future__ import annotations

from dataclasses import asdict, replace

from fastapi import HTTPException

from forkfit.api.schemas import CreateMealPlanMessageRequest, CreateMealPlanRequest
from forkfit.config import Settings
from forkfit.executors.meal_plans import MealPlanExecutor
from forkfit.meal_planner import MEAL_PLAN_WORKFLOW_VERSION, MealPlanWorkflow
from forkfit.stores.meal_plans import MealPlanMessageRecord, MealPlanRecord, PostgresMealPlanStore
from forkfit.stores.posts import PostgresPostStore


class MealPlanService:
    def __init__(
        self,
        *,
        store: PostgresMealPlanStore,
        post_store: PostgresPostStore,
        executor: MealPlanExecutor,
        settings: Settings,
    ) -> None:
        self.store = store
        self.post_store = post_store
        self.executor = executor
        self.settings = settings

    async def create_plan(
        self, *, user_id: str, request: CreateMealPlanRequest
    ) -> MealPlanRecord:
        if self.store.count_active_for_user(user_id) >= 1:
            raise HTTPException(
                status_code=429,
                detail="你已有一份菜单正在规划，请等它完成后再创建。",
            )

        selected = []
        for post_id in request.selected_post_ids:
            post = self.post_store.get_post(post_id)
            if post is None or post.status != "published" or post.quality != "complete":
                raise HTTPException(
                    status_code=400,
                    detail=f"菜谱 {post_id} 当前不可用于规划。",
                )
            selected.append(
                {
                    "post_id": post.id,
                    "title": post.title,
                    "image_url": post.image_urls[0] if post.image_urls else "",
                    "description": post.description,
                    "recipe": asdict(post.recipe),
                }
            )

        profile = replace(request.user_profile, people_count=request.people_count)
        mode = MealPlanWorkflow.classify_request(
            request.days,
            selected,
            request.request_text,
            profile,
        )
        payload = {
            "days": request.days,
            "people_count": request.people_count,
            "request_text": request.request_text.strip(),
            "selected_recipes": selected,
            "locale": request.locale,
            "start_date": request.start_date,
            "user_profile": asdict(profile),
        }
        plan = self.store.create_plan(
            user_id=user_id,
            request_payload=payload,
            mode=mode,
            workflow_version=MEAL_PLAN_WORKFLOW_VERSION,
        )
        try:
            await self.executor.submit()
        except Exception as exc:
            self.store.mark_failed(plan.id, "任务队列暂时不可用，请稍后重试。")
            raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
        return plan

    async def retry_plan(self, *, user_id: str, plan_id: str) -> MealPlanRecord:
        plan = self.store.get_plan(plan_id)
        if plan is None or plan.user_id != user_id:
            raise HTTPException(status_code=404, detail="Meal plan not found.")
        if plan.status != "failed":
            raise HTTPException(status_code=409, detail="这份计划当前不能重试。")
        if plan.attempt_count >= 3:
            raise HTTPException(
                status_code=409,
                detail="这份计划已多次失败，请调整选择后重新创建。",
            )
        plan = self.store.requeue_failed_plan(plan_id)
        try:
            await self.executor.submit()
        except Exception as exc:
            self.store.mark_failed(plan.id, "任务队列暂时不可用，请稍后重试。")
            raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
        return plan

    async def send_message(
        self,
        *,
        user_id: str,
        plan_id: str,
        request: CreateMealPlanMessageRequest,
    ) -> MealPlanMessageRecord:
        try:
            message = self.store.create_message(
                plan_id=plan_id,
                user_id=user_id,
                content=request.text,
                base_version_id=request.base_version_id,
                locale=request.locale,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Meal plan not found.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        try:
            await self.executor.submit()
        except Exception as exc:
            self.store.mark_message_failed(message.id, "对话任务暂时不可用，请稍后重试。")
            raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
        return message

    async def confirm_message(self, *, user_id: str, message_id: str) -> MealPlanMessageRecord:
        try:
            message = self.store.requeue_message(message_id, user_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Conversation message not found.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        try:
            await self.executor.submit()
        except Exception as exc:
            self.store.mark_message_failed(message.id, "对话任务暂时不可用，请稍后重试。")
            raise HTTPException(status_code=503, detail="Job queue unavailable.") from exc
        return message

    def conversation(self, *, user_id: str, plan_id: str) -> list[MealPlanMessageRecord]:
        try:
            return self.store.list_messages(plan_id, user_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Meal plan not found.") from exc

    def restore_version(self, *, user_id: str, plan_id: str, version_id: str) -> MealPlanRecord:
        try:
            return self.store.restore_version(plan_id, user_id, version_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Meal plan version not found.") from exc
