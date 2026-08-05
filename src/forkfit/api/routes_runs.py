from __future__ import annotations

import copy

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from forkfit.api.deps import current_user, get_post_store, get_run_service
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.api.schemas import CreateRunRequest, CreateRunResponse, PostResponse, RunFeedbackRequest, RunStatusResponse
from forkfit.auth.models import CurrentUser
from forkfit.services import RunService
from forkfit.stores.base import RunRecord
from forkfit.constraints import ConstraintGuard, contains_constraint_term
from forkfit.models import RecipePatch, RecipePatchOperation, ToolEvidence
from forkfit.recipe_agent import PatchApplier, PatchValidationError

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
    substitutions: dict[str, str] = Field(default_factory=dict)


class ResumeSubstitution(BaseModel):
    meal_id: str = Field(min_length=1, max_length=120)
    target: str = Field(min_length=1, max_length=300)
    replacement: str = Field(min_length=1, max_length=300)


class ResumeRequest(BaseModel):
    request_text: str = Field(default="", max_length=1000)
    substitutions: list[ResumeSubstitution] = Field(default_factory=list, max_length=16)


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

    substitutions = _legacy_substitutions(run, body.substitutions)
    return await _resume_run(run, ResumeRequest(substitutions=substitutions), service)


@router.post("/{run_id}/resume", response_model=RunStatusResponse)
async def resume_run(
    run_id: str,
    body: ResumeRequest,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> RunStatusResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status != "needs_input":
        raise HTTPException(status_code=400, detail="Run is not waiting for input.")
    if not body.request_text.strip() and not body.substitutions:
        raise HTTPException(status_code=400, detail="A clarification or substitution is required.")
    return await _resume_run(run, body, service)


@router.post("/{run_id}/retry", response_model=RunStatusResponse)
async def retry_run(
    run_id: str,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> RunStatusResponse:
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed runs can be retried.")
    from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict
    payload = run.input_payload
    record = await service.requeue_run(
        run_id=run.id,
        user_profile=user_profile_from_dict(payload["user_profile"]),
        meal_pack=meal_pack_from_dict(payload["meal_pack"]),
        locale=payload.get("locale", "en"),
        request_text=payload.get("request_text", ""),
    )
    return _run_response(record, service)


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
    idempotency_key: str = Header(default="", alias="Idempotency-Key", max_length=200),
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
        request_text=request.request_text,
        idempotency_key=idempotency_key,
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
    title: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4000)
    image_urls: list[str] = Field(default_factory=list, max_length=8)
    recipe_name: str = Field(default="", max_length=160)
    ingredients: list[str] = Field(default_factory=list, max_length=80)
    equipment: list[str] = Field(default_factory=list, max_length=20)
    cook_time_minutes: int | None = Field(default=None, ge=1, le=360)
    tags: list[str] = Field(default_factory=list, max_length=12)
    notes: str = Field(default="", max_length=2000)
    steps: list[str] = Field(default_factory=list, max_length=30)


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
    return _run_response(run, service)


def _run_response(run: RunRecord, service: RunService | None = None) -> RunStatusResponse:
    queue_position, wait_seconds, user_message = _run_progress_fields(run, service)
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
        stage=run.current_stage,
        progress=_stage_progress(run.current_stage, run.status),
        retryable=run.status == "failed",
        workflow_version=run.workflow_version,
        clarification=run.unresolved_payload if run.status == "needs_input" else None,
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


def _stage_progress(stage: str, status: str) -> int:
    if status == "succeeded":
        return 100
    if status in {"failed", "needs_input"}:
        return 100
    return {
        "queued": 0, "starting": 5, "normalize": 15, "assess": 30,
        "retrieve": 45, "draft": 60, "apply_validate": 75,
        "review": 85, "repair": 75, "finalize": 95,
    }.get(stage, 10)


async def _resume_run(run: RunRecord, body: ResumeRequest, service: RunService) -> RunStatusResponse:
    from forkfit.serialization import meal_pack_from_dict, user_profile_from_dict
    payload = copy.deepcopy(run.input_payload)
    meal_pack = meal_pack_from_dict(payload["meal_pack"])
    if body.substitutions:
        evidence = []
        operations = []
        for index, item in enumerate(body.substitutions):
            evidence_id = f"user-confirmation:{index}"
            evidence.append(ToolEvidence(
                id=evidence_id, source="user_confirmation", source_ref=run.id,
                summary=f"{item.target} -> {item.replacement}", confidence=1.0, approved=True,
            ))
            operations.append(RecipePatchOperation(
                op="replace_ingredient", meal_id=item.meal_id, target=item.target,
                value=item.replacement, reason="User selected this replacement.",
                evidence_refs=[evidence_id],
            ))
        try:
            meal_pack, _ = PatchApplier().apply(
                meal_pack,
                RecipePatch(operations=operations, summary="User-confirmed substitutions.", evidence=evidence),
            )
        except PatchValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    request_text = " ".join(
        value for value in (payload.get("request_text", ""), body.request_text.strip()) if value
    )
    record = await service.requeue_run(
        run_id=run.id,
        user_profile=user_profile_from_dict(payload["user_profile"]),
        meal_pack=meal_pack,
        locale=payload.get("locale", "en"),
        request_text=request_text,
    )
    return _run_response(record, service)


def _legacy_substitutions(run: RunRecord, selected: dict[str, str]) -> list[ResumeSubstitution]:
    payload = run.input_payload
    meals = payload.get("meal_pack", {}).get("meals", [])
    profile = payload.get("user_profile", {})
    blocked = list(profile.get("allergies", []))
    for rule in profile.get("diet_rules", []):
        blocked.extend(ConstraintGuard.blocked_terms_for_rule(rule))
    unresolved = run.unresolved_payload.get("items", []) if run.unresolved_payload else []
    result: list[ResumeSubstitution] = []
    for index_text, replacement in selected.items():
        try:
            finding = unresolved[int(index_text)]
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid unresolved item index.")
        for meal in meals:
            if meal.get("id") not in finding.get("affected_items", []):
                continue
            target = next(
                (ingredient for ingredient in meal.get("ingredients", []) if any(
                    contains_constraint_term(ingredient, term) for term in blocked
                )),
                None,
            )
            if target:
                result.append(ResumeSubstitution(
                    meal_id=meal["id"], target=target, replacement=replacement,
                ))
    if selected and not result:
        raise HTTPException(status_code=400, detail="No matching ingredient can be replaced safely.")
    return result
