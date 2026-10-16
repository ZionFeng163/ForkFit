from datetime import datetime
from functools import lru_cache
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from forkfit.api.deps import current_user, require_admin
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.db.session import make_session_factory
from forkfit.stores.feedback import FeedbackStore

router = APIRouter(tags=["feedback"])
FeedbackStatus = Literal["open", "resolved"]
FeedbackCategory = Literal["bug", "suggestion", "data_request"]


@lru_cache(maxsize=1)
def get_feedback_store() -> FeedbackStore:
    return FeedbackStore(make_session_factory(get_settings().database_url))


class CreateFeedback(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    request_id: UUID
    category: FeedbackCategory
    content: str = Field(min_length=1, max_length=2000)


class UpdateFeedback(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    status: FeedbackStatus
    reply: str = Field(max_length=2000)


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    category: FeedbackCategory
    content: str
    status: FeedbackStatus
    reply: str
    created_at: datetime
    updated_at: datetime


class FeedbackList(BaseModel):
    items: list[FeedbackResponse]
    total: int


@router.post("/feedback", response_model=FeedbackResponse)
def create_feedback(body: CreateFeedback, user: CurrentUser = Depends(current_user), store: FeedbackStore = Depends(get_feedback_store)):
    enforce_rate_limit(f"feedback:{user.id}", max_requests=5, window_seconds=600)
    try:
        return store.create(user.id, body.request_id, body.category, body.content)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/feedback", response_model=FeedbackList)
def my_feedback(limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0), user: CurrentUser = Depends(current_user), store: FeedbackStore = Depends(get_feedback_store)):
    rows, total = store.list(user_id=user.id, limit=limit, offset=offset)
    return {"items": rows, "total": total}


@router.get("/admin/feedback", response_model=FeedbackList)
def admin_feedback(status: FeedbackStatus | None = None, limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0), admin: CurrentUser = Depends(require_admin), store: FeedbackStore = Depends(get_feedback_store)):
    rows, total = store.list(status=status, limit=limit, offset=offset)
    return {"items": rows, "total": total}


@router.patch("/admin/feedback/{feedback_id}", response_model=FeedbackResponse)
def update_feedback(feedback_id: str, body: UpdateFeedback, admin: CurrentUser = Depends(require_admin), store: FeedbackStore = Depends(get_feedback_store)):
    row = store.update(feedback_id, admin_id=admin.id, status=body.status, reply=body.reply)
    if row is None:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return row
