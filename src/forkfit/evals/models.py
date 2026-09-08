from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


EvalTarget = Literal[
    "constraint_review",
    "recipe_graph",
    "planning_graph",
    "parent_graph",
]
ExpectedAction = Literal["pass", "adapt", "clarify", "stop"]


class ExpectedConstraint(BaseModel):
    kind: Literal[
        "allergy",
        "diet_rule",
        "equipment",
        "excluded_equipment",
        "time",
        "people_count",
        "preference",
    ]
    value: str = Field(min_length=1, max_length=120)
    hard: bool = True


class ToolPolicy(BaseModel):
    should_call: bool = False
    tool: str = "search_substitutions"
    argument_requirements: dict[str, Any] = Field(default_factory=dict)
    fixture_results: list[dict[str, Any]] = Field(default_factory=list)
    max_calls: int = Field(default=8, ge=0, le=8)


class EvalReference(BaseModel):
    expected_action: ExpectedAction
    expected_constraints: list[ExpectedConstraint] = Field(default_factory=list)
    affected_recipe_ids: list[str] = Field(default_factory=list)
    affected_ingredients: list[str] = Field(default_factory=list)
    tool_policy: ToolPolicy = Field(default_factory=ToolPolicy)
    expected_patch: list[dict[str, Any]] = Field(default_factory=list)
    required_invariants: list[str] = Field(default_factory=list)
    semantic_checks: list[str] = Field(default_factory=list)


class EvalInput(BaseModel):
    user_profile: dict[str, Any]
    request_text: str = ""
    selected_recipes: list[dict[str, Any]] = Field(default_factory=list)
    meal_pack: dict[str, Any] | None = None
    days: int | None = Field(default=None, ge=2, le=7)
    locale: str = "zh"


class EvalMetadata(BaseModel):
    category: str
    difficulty: Literal["basic", "composite", "adversarial"] = "basic"
    split: Literal["development", "holdout"]
    smoke: bool = False
    source: Literal["existing_test", "manual", "badcase", "synthetic_reviewed"]


class EvalCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,79}$")
    target: EvalTarget
    input: EvalInput
    reference: EvalReference
    metadata: EvalMetadata

    @model_validator(mode="after")
    def validate_target_input(self) -> "EvalCase":
        if self.target in {"constraint_review", "recipe_graph"} and not self.input.meal_pack:
            raise ValueError(f"{self.target} requires input.meal_pack")
        if self.target in {"planning_graph", "parent_graph"}:
            if self.input.days is None:
                raise ValueError(f"{self.target} requires input.days")
            if not self.input.selected_recipes:
                raise ValueError(f"{self.target} requires selected_recipes")
        return self


class MetricResult(BaseModel):
    key: str
    score: float = Field(ge=0, le=1)
    comment: str = ""
    hard_gate: bool = False


class CaseResult(BaseModel):
    case_id: str
    target: EvalTarget
    action: str
    passed: bool
    metrics: list[MetricResult]
    output: dict[str, Any]
    error: str = ""


class EvalReport(BaseModel):
    dataset_version: str
    mode: Literal["fake", "live"]
    split: str
    case_count: int
    passed: int
    failed: int
    pass_rate: float
    metric_averages: dict[str, float]
    hard_gate_failures: list[str]
    cases: list[CaseResult]
