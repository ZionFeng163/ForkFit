from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

ReviewStatus = Literal["pass", "warn", "block"]
Severity = Literal["low", "medium", "high"]


@dataclass(slots=True)
class Meal:
    id: str
    day: str
    name: str
    ingredients: list[str]
    equipment: list[str]
    cook_time_minutes: int
    estimated_cost: float
    tags: list[str] = field(default_factory=list)
    notes: str = ""
    steps: list[str] = field(default_factory=list)

    def clone(self) -> "Meal":
        return deepcopy(self)

    def searchable_text(self) -> str:
        parts = [
            self.day,
            self.name,
            self.notes,
            *self.ingredients,
            *self.equipment,
            *self.tags,
            *self.steps,
        ]
        return " ".join(parts).lower()


@dataclass(slots=True)
class MealPack:
    id: str
    title: str
    theme: str
    meals: list[Meal]

    def clone(self) -> "MealPack":
        return deepcopy(self)

    @property
    def estimated_cost(self) -> float:
        return round(sum(meal.estimated_cost for meal in self.meals), 2)

    def find_meal(self, meal_id_or_label: str) -> Meal | None:
        target = meal_id_or_label.lower()
        for meal in self.meals:
            if meal.id.lower() == target or meal.day.lower() == target:
                return meal
        return None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class UserProfile:
    people_count: int
    likes: list[str] = field(default_factory=list)
    dislikes: list[str] = field(default_factory=list)
    allergies: list[str] = field(default_factory=list)
    diet_rules: list[str] = field(default_factory=list)
    equipment: list[str] = field(default_factory=list)
    max_cook_time_minutes: int = 30
    soft_preferences: list[str] = field(default_factory=list)


@dataclass(slots=True)
class PreferenceProfile:
    likes: list[str]
    dislikes: list[str]
    allergies: list[str]
    diet_rules: list[str]
    equipment: list[str]
    soft_preferences: list[str]

    def to_constraints(self, user_profile: UserProfile) -> "ConstraintSet":
        return ConstraintSet(
            allergies=list(self.allergies),
            diet_rules=list(self.diet_rules),
            equipment=list(self.equipment),
            max_cook_time_minutes=user_profile.max_cook_time_minutes,
            people_count=user_profile.people_count,
        )


@dataclass(slots=True)
class AgentFinding:
    type: str
    severity: Severity
    affected_items: list[str]
    message: str
    suggested_action: str = ""
    required_action: str = ""

    def action(self) -> str:
        return self.required_action or self.suggested_action


@dataclass(slots=True)
class PreferenceReview:
    status: Literal["pass", "warn"]
    fit_score: float
    findings: list[AgentFinding] = field(default_factory=list)


@dataclass(slots=True)
class UserAgentOutput:
    agent: Literal["user"]
    preference_profile: PreferenceProfile
    preference_review: PreferenceReview


@dataclass(slots=True)
class ConstraintSet:
    allergies: list[str]
    diet_rules: list[str]
    equipment: list[str]
    max_cook_time_minutes: int
    people_count: int


@dataclass(slots=True)
class AgentReview:
    agent: str
    status: ReviewStatus
    findings: list[AgentFinding] = field(default_factory=list)
    scores: dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class ChangeLogEntry:
    affected_item: str
    from_value: str
    to_value: str
    reason: str
    source_agent: str


@dataclass(slots=True)
class AdapterOutput:
    forked_meal_pack: MealPack
    change_log: list[ChangeLogEntry]
    unresolved_items: list[AgentFinding]
    summary: str
    description: str = ""
    original_meal_pack_translated: MealPack | None = None


@dataclass(slots=True)
class ForkFitResult:
    success: bool
    user_agent_output: UserAgentOutput
    reviews: list[AgentReview]
    adapter_output: AdapterOutput
    final_review: AgentReview
    trace: "RunTrace | None" = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class LLMCallTrace:
    agent: str
    model: str
    duration_ms: float
    prompt_tokens: int | None
    completion_tokens: int | None
    status: Literal["success", "error"]
    error: str = ""


@dataclass(slots=True)
class StepTrace:
    node: str
    duration_ms: float
    status: Literal["success", "error"]
    error: str = ""


@dataclass(slots=True)
class RunTrace:
    steps: list[StepTrace] = field(default_factory=list)
    llm_calls: list[LLMCallTrace] = field(default_factory=list)

    @property
    def llm_call_count(self) -> int:
        return len(self.llm_calls)

    @property
    def total_duration_ms(self) -> float:
        return round(sum(step.duration_ms for step in self.steps), 2)
