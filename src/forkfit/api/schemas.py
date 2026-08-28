from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from forkfit.meal_planner import MealPlanResult
from forkfit.models import (
    AdapterOutput,
    AgentReview,
    ForkFitResult,
    Meal,
    MealPack,
    RunTrace,
    QualityReport,
    ToolEvidence,
    UserProfile,
)


RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled", "needs_input"]
PostStatus = Literal["draft", "published", "hidden"]


class CreateRunRequest(BaseModel):
    user_profile: UserProfile
    meal_pack: MealPack
    locale: str = "en"
    request_text: str = Field(default="", max_length=1000)


class CreatePostRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    theme: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    image_urls: list[str] = Field(min_length=0, max_length=8)
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
    status: PostStatus = "published"
    source_name: str = ""
    source_url: str = ""
    saves: int
    likes: int
    forks: int
    created_at: str
    liked: bool = False
    saved: bool = False
    comment_count: int = 0


class CreateRunResponse(BaseModel):
    run_id: str
    status: RunStatus
    queue_position: int | None = None
    estimated_wait_seconds: int | None = None
    user_message: str | None = None


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
    unresolved_payload: dict | None = None
    saved: bool = False
    queue_position: int | None = None
    estimated_wait_seconds: int | None = None
    user_message: str | None = None
    stage: str = "queued"
    progress: int = 0
    retryable: bool = False
    workflow_version: str = "v2"
    clarification: dict | None = None


class RunFeedbackRequest(BaseModel):
    rating: Literal["helpful", "not_helpful"]
    reason: str | None = Field(default=None, max_length=500)


class CreateMealPlanRequest(BaseModel):
    days: int = Field(default=5, ge=2, le=7)
    people_count: int = Field(default=1, ge=1, le=12)
    request_text: str = Field(default="", max_length=1500)
    selected_post_ids: list[str] = Field(default_factory=list, max_length=14)
    locale: str = Field(default="zh", max_length=10)
    start_date: str | None = Field(default=None, max_length=10)
    user_profile: UserProfile

    @model_validator(mode="after")
    def validate_source(self) -> "CreateMealPlanRequest":
        self.selected_post_ids = list(dict.fromkeys(self.selected_post_ids))
        if len(self.selected_post_ids) < self.days:
            raise ValueError(f"规划 {self.days} 天至少需要选择 {self.days} 道菜。")
        return self


class CreateMealPlanResponse(BaseModel):
    plan_id: str
    status: RunStatus
    mode: Literal["guided", "team"]
    current_version_id: str | None = None


class MealPlanStatusResponse(BaseModel):
    plan_id: str
    user_id: str
    status: RunStatus
    mode: Literal["guided", "team"]
    stage: str
    progress: int
    workflow_version: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    result: MealPlanResult | None = None
    error: PublicRunError | None = None
    current_version_id: str | None = None
    conversation_id: str | None = None
    pending_message_id: str | None = None
    pending_change: dict | None = None
    locked_days: list[int] = Field(default_factory=list)
    last_change_summary: str = ""
    editable: bool = True


class CreateMealPlanMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    base_version_id: str | None = Field(default=None, max_length=100)
    locale: str = Field(default="zh", max_length=10)


class CreateMealPlanMessageResponse(BaseModel):
    message_id: str
    run_id: str
    status: Literal[
        "queued",
        "processing",
        "applied",
        "needs_clarification",
        "needs_confirmation",
        "failed",
    ]
    base_version_id: str | None = None


class MealPlanMessageResponse(BaseModel):
    message_id: str
    plan_id: str
    base_version_id: str | None = None
    version_id: str | None = None
    role: Literal["user", "assistant", "system"]
    content: str
    intent: str = ""
    status: str
    response: dict | None = None
    error: PublicRunError | None = None
    created_at: str


class MealPlanConversationResponse(BaseModel):
    plan_id: str
    current_version_id: str | None = None
    messages: list[MealPlanMessageResponse] = Field(default_factory=list)
    pending_message_id: str | None = None
    pending_change: dict | None = None


class MealPlanRestoreVersionResponse(BaseModel):
    plan_id: str
    current_version_id: str
    status: RunStatus


class RunResultPayload(BaseModel):
    original_meal_pack: MealPack
    forked_meal_pack: MealPack
    change_log: list
    unresolved_items: list
    final_review: AgentReview
    summary: str
    description: str = ""
    evidence: list[ToolEvidence] = Field(default_factory=list)
    safety_notices: list[str] = Field(default_factory=list)
    quality_report: QualityReport | None = None


def result_payload_from_forkfit(
    original_meal_pack: MealPack, result: ForkFitResult
) -> RunResultPayload:
    # Use translated original if adapter produced one (non-English locale)
    display_original = (
        result.adapter_output.original_meal_pack_translated
        or original_meal_pack
    )
    return RunResultPayload(
        original_meal_pack=display_original,
        forked_meal_pack=result.adapter_output.forked_meal_pack,
        change_log=result.adapter_output.change_log,
        unresolved_items=result.adapter_output.unresolved_items,
        final_review=result.final_review,
        summary=result.adapter_output.summary,
        description=result.adapter_output.description,
        evidence=result.evidence,
        safety_notices=result.safety_notices,
        quality_report=result.quality_report,
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
