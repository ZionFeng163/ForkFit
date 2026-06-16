from __future__ import annotations

import copy
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from forkfit.api.deps import current_user, get_post_store, get_run_service
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.api.schemas import CreateRunRequest, CreateRunResponse, PostResponse, RunFeedbackRequest, RunStatusResponse
from forkfit.auth.models import CurrentUser
from forkfit.services import RunService
from forkfit.stores.base import RunRecord

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("", response_model=list[RunStatusResponse])
async def list_runs(
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> list[RunStatusResponse]:
    runs = service.store.list_runs_for_user(user.id)
    return [_run_response(run) for run in runs]


@router.get("/saved", response_model=list[RunStatusResponse])
async def list_saved_runs(
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> list[RunStatusResponse]:
    runs = service.store.list_saved_runs_for_user(user.id)
    return [_run_response(run) for run in runs]


class ResolveRequest(BaseModel):
    substitutions: dict  # {unresolved_item_index: chosen_substitute}


@router.post("/{run_id}/resolve", response_model=RunStatusResponse)
async def resolve_run(
    run_id: str,
    body: ResolveRequest,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> RunStatusResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status != "needs_input":
        raise HTTPException(status_code=400, detail="Run is not waiting for input.")

    input_data = run.input_payload
    meal_pack_dict = copy.deepcopy(input_data["meal_pack"])
    user_profile_dict = input_data["user_profile"]
    locale = input_data.get("locale", "en")

    if body.substitutions:
        for idx_str, substitute in body.substitutions.items():
            idx = int(idx_str)
            items = run.unresolved_payload.get("items", []) if run.unresolved_payload else []
            if idx < len(items):
                item = items[idx]
                for meal in meal_pack_dict.get("meals", []):
                    if meal.get("id") in item.get("affected_items", []):
                        if item.get("type") in {"allergy", "diet_rule"}:
                            blocked_terms = list(user_profile_dict.get("allergies", []))
                            blocked_terms.extend(
                                rule.removeprefix("no ").strip()
                                for rule in user_profile_dict.get("diet_rules", [])
                            )
                            _replace_blocked_terms(meal, blocked_terms, str(substitute))
                        elif item.get("type") == "equipment":
                            meal["equipment"] = [str(substitute)]

    from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict

    meal_pack = meal_pack_from_dict(meal_pack_dict)
    user_profile = user_profile_from_dict(user_profile_dict)
    record = await service.requeue_run(
        run_id=run_id,
        user_profile=user_profile,
        meal_pack=meal_pack,
        locale=locale,
    )
    return _run_response(record)


@router.post("/{run_id}/save", response_model=RunStatusResponse)
async def save_run(
    run_id: str,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> RunStatusResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status != "succeeded":
        raise HTTPException(status_code=400, detail="Only succeeded runs can be saved.")
    updated = service.store.mark_saved(run_id)
    return _run_response(updated)


@router.delete("/{run_id}/save", response_model=RunStatusResponse)
async def unsave_run(
    run_id: str,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> RunStatusResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    updated = service.store.mark_unsaved(run_id)
    return _run_response(updated)


@router.post("", response_model=CreateRunResponse)
async def create_run(
    request: CreateRunRequest,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> CreateRunResponse:
    enforce_rate_limit(
        f"fork:{user.id}",
        max_requests=5,
        window_seconds=60,
        detail="Too many fork requests. Please wait a minute.",
    )

    run = await service.create_run(
        user_id=user.id,
        user_profile=request.user_profile,
        meal_pack=request.meal_pack,
        locale=request.locale,
    )
    queue_position, wait_seconds, user_message = _run_progress_fields(run, service)
    return CreateRunResponse(
        run_id=run.id,
        status=run.status,
        queue_position=queue_position,
        estimated_wait_seconds=wait_seconds,
        user_message=user_message,
    )


@router.post("/{run_id}/feedback")
async def submit_run_feedback(
    run_id: str,
    body: RunFeedbackRequest,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> dict[str, bool]:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status != "succeeded":
        raise HTTPException(status_code=400, detail="Only succeeded runs can receive feedback.")
    save_feedback = getattr(service.store, "save_feedback", None)
    if save_feedback is None:
        raise HTTPException(status_code=501, detail="Feedback storage is not available.")
    save_feedback(run_id=run_id, user_id=user.id, rating=body.rating, reason=body.reason or "")
    return {"ok": True}


class PublishRequest(BaseModel):
    title: str = ""
    description: str = ""
    image_urls: list[str] = Field(default_factory=list)
    recipe_name: str = ""
    ingredients: list[str] = Field(default_factory=list)
    equipment: list[str] = Field(default_factory=list)
    cook_time_minutes: int = 30
    estimated_cost: float = 10
    tags: list[str] = Field(default_factory=list)
    notes: str = ""
    steps: list[str] = Field(default_factory=list)


@router.post("/{run_id}/publish", response_model=PostResponse)
async def publish_run(
    run_id: str,
    body: PublishRequest | None = None,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> PostResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status != "succeeded" or not run.result:
        raise HTTPException(status_code=400, detail="Run has no result to publish.")

    result = run.result
    forked = result.forked_meal_pack
    if not forked.meals:
        raise HTTPException(status_code=400, detail="Forked pack has no meals.")

    meal = forked.meals[0]
    post_store = get_post_store()

    from forkfit.api.schemas import CreatePostRequest
    from forkfit.models import Meal as MealModel

    req = body or PublishRequest()
    request = CreatePostRequest(
        title=req.title or forked.title or meal.name,
        theme=forked.theme or "community recipe",
        location="unknown",
        image_urls=req.image_urls or ["https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85"],
        description=req.description or result.summary or "Forked from a community recipe.",
        recipe=MealModel(
            id="main",
            day="post",
            name=req.recipe_name or meal.name,
            ingredients=req.ingredients or meal.ingredients,
            equipment=req.equipment or meal.equipment,
            cook_time_minutes=req.cook_time_minutes if req.cook_time_minutes is not None else meal.cook_time_minutes,
            estimated_cost=req.estimated_cost if req.estimated_cost is not None else meal.estimated_cost,
            tags=req.tags or meal.tags,
            notes=req.notes or meal.notes,
            steps=req.steps or meal.steps,
        ),
    )

    post = post_store.create_post(user_id=user.id, author=user.display_name, request=request)
    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        author=post.author,
        title=post.title,
        theme=post.theme,
        location=post.location,
        image_urls=post.image_urls,
        description=post.description,
        recipe=post.recipe,
        saves=post.saves,
        likes=post.likes,
        forks=post.forks,
        created_at=post.created_at.isoformat(),
    )


@router.get("/{run_id}", response_model=RunStatusResponse)
async def get_run(
    run_id: str,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> RunStatusResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    return _run_response(run)


def _run_response(run: RunRecord) -> RunStatusResponse:
    queue_position, wait_seconds, user_message = _run_progress_fields(run)
    return RunStatusResponse(
        run_id=run.id,
        user_id=run.user_id,
        status=run.status,
        created_at=run.created_at.isoformat(),
        started_at=run.started_at.isoformat() if run.started_at else None,
        finished_at=run.finished_at.isoformat() if run.finished_at else None,
        result=run.result,
        error=run.error,
        trace=run.trace,
        unresolved_payload=run.unresolved_payload,
        saved=run.saved,
        queue_position=queue_position,
        estimated_wait_seconds=wait_seconds,
        user_message=user_message,
    )


def _run_progress_fields(run: RunRecord, service: RunService | None = None) -> tuple[int | None, int | None, str]:
    queue_position: int | None = None
    estimated_wait_seconds: int | None = None
    if run.status == "queued":
        queued_ahead = 0
        if service is not None:
            count_queued_ahead = getattr(service.store, "count_queued_ahead", None)
            if count_queued_ahead is not None:
                queued_ahead = count_queued_ahead(run.id)
        queue_position = queued_ahead + 1
        estimated_wait_seconds = max(15, queue_position * 30)
        return queue_position, estimated_wait_seconds, "已加入队列，ForkFit 会按顺序开始定制。"
    if run.status == "running":
        return 0, 20, "AI 正在理解需求、检查限制并整理替代方案。"
    if run.status == "needs_input":
        return None, None, "有些限制需要你选择替代项，然后可以继续定制。"
    if run.status == "failed":
        return None, None, "这次定制失败了。你可以保留输入，换一种说法或稍后重试。"
    if run.status == "succeeded":
        return None, None, "定制完成，可以保存、反馈或发布为菜谱。"
    return None, None, ""


def _replace_blocked_terms(meal: dict, terms: list[str], substitute: str) -> None:
    patterns = [re.compile(re.escape(term), re.IGNORECASE) for term in terms if term]

    def replace(value: str) -> str:
        for pattern in patterns:
            value = pattern.sub(substitute, value)
        return value

    meal["name"] = replace(meal.get("name", ""))
    meal["notes"] = replace(meal.get("notes", ""))
    meal["ingredients"] = [replace(value) for value in meal.get("ingredients", [])]
    meal["tags"] = [replace(value) for value in meal.get("tags", [])]
