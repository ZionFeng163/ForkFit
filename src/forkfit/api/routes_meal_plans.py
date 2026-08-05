from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from forkfit.api.deps import current_user, get_meal_plan_service
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.api.schemas import (
    CreateMealPlanMessageRequest,
    CreateMealPlanMessageResponse,
    CreateMealPlanRequest,
    CreateMealPlanResponse,
    MealPlanConversationResponse,
    MealPlanMessageResponse,
    MealPlanRestoreVersionResponse,
    MealPlanStatusResponse,
)
from forkfit.auth.models import CurrentUser
from forkfit.services import MealPlanService
from forkfit.stores.meal_plans import MealPlanRecord

router = APIRouter(prefix="/meal-plans", tags=["meal-plans"])


@router.get("", response_model=list[MealPlanStatusResponse])
async def list_meal_plans(
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> list[MealPlanStatusResponse]:
    return [
        _plan_response(plan)
        for plan in service.store.list_plans_for_user(user.id)
    ]


@router.post("", response_model=CreateMealPlanResponse)
async def create_meal_plan(
    request: CreateMealPlanRequest,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> CreateMealPlanResponse:
    enforce_rate_limit(
        f"meal-plan:{user.id}",
        max_requests=3,
        window_seconds=600,
        detail="菜单规划请求太频繁，请稍后再试。",
    )
    plan = await service.create_plan(user_id=user.id, request=request)
    return CreateMealPlanResponse(
        plan_id=plan.id,
        status=plan.status,
        mode=plan.mode,
        current_version_id=plan.current_version_id,
    )


@router.post("/{plan_id}/retry", response_model=CreateMealPlanResponse)
async def retry_meal_plan(
    plan_id: str,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> CreateMealPlanResponse:
    enforce_rate_limit(
        f"meal-plan-retry:{user.id}",
        max_requests=3,
        window_seconds=600,
        detail="菜单规划重试太频繁，请稍后再试。",
    )
    plan = await service.retry_plan(user_id=user.id, plan_id=plan_id)
    return CreateMealPlanResponse(
        plan_id=plan.id,
        status=plan.status,
        mode=plan.mode,
        current_version_id=plan.current_version_id,
    )


@router.post("/{plan_id}/conversation/messages", response_model=CreateMealPlanMessageResponse)
async def create_conversation_message(
    plan_id: str,
    request: CreateMealPlanMessageRequest,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> CreateMealPlanMessageResponse:
    enforce_rate_limit(
        f"meal-plan-message:{user.id}",
        max_requests=20,
        window_seconds=600,
        detail="菜单修改请求太频繁，请稍后再试。",
    )
    message = await service.send_message(user_id=user.id, plan_id=plan_id, request=request)
    return CreateMealPlanMessageResponse(
        message_id=message.id,
        run_id=message.id,
        status=message.status,
        base_version_id=message.base_version_id,
    )


@router.get("/{plan_id}/conversation", response_model=MealPlanConversationResponse)
async def get_conversation(
    plan_id: str,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> MealPlanConversationResponse:
    plan = service.store.get_plan(plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Meal plan not found.")
    messages = service.conversation(user_id=user.id, plan_id=plan_id)
    return MealPlanConversationResponse(
        plan_id=plan_id,
        current_version_id=plan.current_version_id,
        messages=[_message_response(message) for message in messages],
        pending_message_id=plan.pending_message_id,
        pending_change=plan.pending_change,
    )


@router.post(
    "/{plan_id}/conversation/messages/{message_id}/confirm",
    response_model=CreateMealPlanMessageResponse,
)
async def confirm_conversation_message(
    plan_id: str,
    message_id: str,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> CreateMealPlanMessageResponse:
    message = service.store.get_message(message_id)
    if message is None or message.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Conversation message not found.")
    confirmed = await service.confirm_message(user_id=user.id, message_id=message_id)
    return CreateMealPlanMessageResponse(
        message_id=confirmed.id,
        run_id=confirmed.id,
        status=confirmed.status,
        base_version_id=confirmed.base_version_id,
    )


@router.post(
    "/{plan_id}/versions/{version_id}/restore",
    response_model=MealPlanRestoreVersionResponse,
)
async def restore_meal_plan_version(
    plan_id: str,
    version_id: str,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> MealPlanRestoreVersionResponse:
    plan = service.restore_version(user_id=user.id, plan_id=plan_id, version_id=version_id)
    return MealPlanRestoreVersionResponse(
        plan_id=plan.id,
        current_version_id=plan.current_version_id or version_id,
        status=plan.status,
    )


@router.get("/{plan_id}", response_model=MealPlanStatusResponse)
async def get_meal_plan(
    plan_id: str,
    user: CurrentUser = Depends(current_user),
    service: MealPlanService = Depends(get_meal_plan_service),
) -> MealPlanStatusResponse:
    plan = service.store.get_plan(plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status_code=404, detail="Meal plan not found.")
    return _plan_response(plan)


def _plan_response(plan: MealPlanRecord) -> MealPlanStatusResponse:
    return MealPlanStatusResponse(
        plan_id=plan.id,
        user_id=plan.user_id,
        status=plan.status,
        mode=plan.mode,
        stage=plan.current_stage,
        progress=plan.progress,
        workflow_version=plan.workflow_version,
        created_at=plan.created_at.isoformat(),
        started_at=plan.started_at.isoformat() if plan.started_at else None,
        finished_at=plan.finished_at.isoformat() if plan.finished_at else None,
        result=plan.result,
        error=plan.error,
        current_version_id=plan.current_version_id,
        conversation_id=plan.id,
        pending_message_id=plan.pending_message_id,
        pending_change=plan.pending_change,
        locked_days=plan.locked_days,
        last_change_summary=plan.last_change_summary,
        editable=plan.status == "succeeded" and plan.result is not None,
    )


def _message_response(message) -> MealPlanMessageResponse:
    return MealPlanMessageResponse(
        message_id=message.id,
        plan_id=message.plan_id,
        base_version_id=message.base_version_id,
        version_id=message.version_id,
        role=message.role,
        content=message.content,
        intent=message.intent,
        status=message.status,
        response=message.response_payload,
        error=message.error,
        created_at=message.created_at.isoformat(),
    )
