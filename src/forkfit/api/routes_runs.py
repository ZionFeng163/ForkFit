from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from forkfit.api.deps import current_user, get_post_store, get_run_service
from forkfit.api.schemas import CreateRunRequest, CreateRunResponse, PostResponse, RunStatusResponse
from forkfit.auth.models import CurrentUser
from forkfit.models import Meal, MealPack
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


@router.post("", response_model=CreateRunResponse)
async def create_run(
    request: CreateRunRequest,
    user: CurrentUser = Depends(current_user),
    service: RunService = Depends(get_run_service),
) -> CreateRunResponse:
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
            cook_time_minutes=req.cook_time_minutes or meal.cook_time_minutes,
            estimated_cost=req.estimated_cost or meal.estimated_cost,
            tags=req.tags or meal.tags,
            notes=req.notes or meal.notes,
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
    )
