from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from forkfit.api.deps import current_user, get_run_service
from forkfit.api.schemas import CreateRunRequest, CreateRunResponse, RunStatusResponse
from forkfit.auth.models import CurrentUser
from forkfit.services import RunService
from forkfit.stores.base import RunRecord

router = APIRouter(prefix="/runs", tags=["runs"])


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
    )
    return CreateRunResponse(run_id=run.id, status=run.status)


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
