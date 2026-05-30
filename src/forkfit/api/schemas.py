from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forkfit.models import (
    AdapterOutput,
    AgentReview,
    ForkFitResult,
    Meal,
    MealPack,
    RunTrace,
    UserProfile,
)


RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]


class CreateRunRequest(BaseModel):
    user_profile: UserProfile
    meal_pack: MealPack
    locale: str = "en"


class CreatePostRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    theme: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    image_urls: list[str] = Field(min_length=1, max_length=8)
    description: str = Field(min_length=1, max_length=1200)
    recipe: Meal


class UpdatePostRequest(CreatePostRequest):
    pass


class PostResponse(BaseModel):
    id: str
    user_id: str
    author: str
    title: str
    theme: str
    location: str
    image_urls: list[str]
    description: str
    recipe: Meal
    saves: int
    forks: int
    created_at: str
    liked: bool = False
    saved: bool = False
    comment_count: int = 0


class CreateRunResponse(BaseModel):
    run_id: str
    status: RunStatus


class PublicRunError(BaseModel):
    message: str


class RunStatusResponse(BaseModel):
    run_id: str
    user_id: str
    status: RunStatus
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    result: "RunResultPayload | None" = None
    error: PublicRunError | None = None
    trace: RunTrace | None = None


class RunResultPayload(BaseModel):
    original_meal_pack: MealPack
    forked_meal_pack: MealPack
    change_log: list
    unresolved_items: list
    final_review: AgentReview
    summary: str


def result_payload_from_forkfit(
    original_meal_pack: MealPack, result: ForkFitResult
) -> RunResultPayload:
    return RunResultPayload(
        original_meal_pack=original_meal_pack,
        forked_meal_pack=result.adapter_output.forked_meal_pack,
        change_log=result.adapter_output.change_log,
        unresolved_items=result.adapter_output.unresolved_items,
        final_review=result.final_review,
        summary=result.adapter_output.summary,
    )


for model in (
    AdapterOutput,
    AgentReview,
    Meal,
    MealPack,
    RunTrace,
    UserProfile,
):
    model_config = ConfigDict(arbitrary_types_allowed=True)
