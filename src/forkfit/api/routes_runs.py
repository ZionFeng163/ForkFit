from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from forkfit.api.deps import current_user, get_post_store, get_run_service, optional_current_user
from forkfit.api.schemas import CreateRunRequest, CreateRunResponse, PostResponse, RunStatusResponse
from forkfit.auth.models import CurrentUser
from forkfit.services import RunService
from forkfit.stores.base import RunRecord

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("/{run_id}/stream")
async def stream_run(
    run_id: str,
    token: str | None = None,
    user: CurrentUser = Depends(optional_current_user),
):
    """SSE endpoint for real-time run status updates. Supports token query param for EventSource."""
    from forkfit.config import get_settings
    from forkfit.redis_utils import get_pubsub
    from fastapi.responses import StreamingResponse
    import json

    # Auth via query param (EventSource can't set headers)
    if not user and token:
        from forkfit.auth.jwt import decode_access_token
        from forkfit.api.deps import get_user_store
        user_id = decode_access_token(token)
        if user_id:
            user_store = get_user_store()
            ur = user_store.get_user_by_id(user_id)
            if ur:
                from forkfit.auth.models import CurrentUser
                user = CurrentUser(id=ur.id, display_name=ur.display_name, avatar_url=ur.avatar_url, username=ur.username, role=ur.role)

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    settings = get_settings()
    pubsub = get_pubsub(settings.redis_url)
    if not pubsub:
        raise HTTPException(status_code=503, detail="Real-time updates not available.")

    # Verify run exists and belongs to user
    service = get_run_service()
    run = service.get_run(run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found.")

    # If already in terminal state, return immediately
    if run.status in ("succeeded", "failed", "cancelled"):
        async def final_event():
            yield f"data: {json.dumps({'status': run.status})}\n\n"
        return StreamingResponse(final_event(), media_type="text/event-stream")

    subscriber = pubsub.get_subscriber(run_id)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'status': run.status})}\n\n"
            for message in subscriber.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    yield f"data: {json.dumps(data)}\n\n"
                    if data.get("status") in ("succeeded", "failed", "cancelled"):
                        break
        finally:
            subscriber.unsubscribe()
            subscriber.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
    # Rate limit: 5 fork requests per minute per user
    from forkfit.config import get_settings
    from forkfit.redis_utils import get_rate_limiter
    settings = get_settings()
    if settings.rate_limit_enabled:
        limiter = get_rate_limiter(settings.redis_url)
        if limiter:
            allowed, remaining = limiter.is_allowed(f"fork:{user.id}", max_requests=5, window_seconds=60)
            if not allowed:
                raise HTTPException(status_code=429, detail="Too many fork requests. Please wait a minute.")

    run = await service.create_run(
        user_id=user.id,
        user_profile=request.user_profile,
        meal_pack=request.meal_pack,
        locale=request.locale,
    )
    return CreateRunResponse(run_id=run.id, status=run.status)


class PublishRequest(BaseModel):
    title: str = ""
    description: str = ""
    image_urls: list[str] = []
    recipe_name: str = ""
    ingredients: list[str] = []
    equipment: list[str] = []
    cook_time_minutes: int = 30
    estimated_cost: float = 10
    tags: list[str] = []
    notes: str = ""
    steps: list[str] = []


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
        saved=run.saved,
    )
