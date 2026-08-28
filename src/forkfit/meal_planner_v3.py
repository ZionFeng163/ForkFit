from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from typing import Any, Callable, Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field, model_validator

from forkfit.constraints import ConstraintNormalizer
from forkfit.langgraph_workflow import ForkFitGraphState, ForkFitLangGraphWorkflow
from forkfit.llm import BailianLLMClient, LLMClient
from forkfit.models import Meal, MealPack, RunTrace, UserProfile
from forkfit.recipe_agent import KNOWLEDGE_VERSION, WORKFLOW_VERSION
from forkfit.serialization import meal_from_dict, user_profile_from_dict


MEAL_PLAN_WORKFLOW_VERSION = "meal-plan-v3"
PlanningMode = Literal["guided", "team"]

AGENT_REGISTRY = {
    "recipe_adapter": {"role": "菜谱调整 Agent", "subgraph": "recipe"},
    "recipe_reviewer": {"role": "单菜审核 Agent", "subgraph": "recipe"},
    "home_balance": {"role": "家常均衡规划 Agent", "subgraph": "planning"},
    "pantry_reuse": {"role": "采购复用规划 Agent", "subgraph": "planning"},
    "quick_rhythm": {"role": "时间节奏规划 Agent", "subgraph": "planning"},
    "comprehensive_plan_reviewer": {"role": "综合评审 Agent", "subgraph": "planning"},
}


class PlannedDish(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    source_post_id: str = Field(min_length=1, max_length=120)
    meal: Meal
    reason: str = Field(default="", max_length=300)


class PlannedDay(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    day_index: int = Field(ge=1, le=7)
    label: str = Field(min_length=1, max_length=40)
    dishes: list[PlannedDish] = Field(min_length=1, max_length=3)
    reason: str = Field(default="", max_length=300)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_day(cls, value: Any) -> Any:
        if isinstance(value, dict) and "dishes" not in value and "meal" in value:
            payload = dict(value)
            meal = payload.pop("meal")
            source = payload.pop("source_post_id", None)
            source = source or f"legacy-day-{payload.get('day_index', 1)}"
            payload["dishes"] = [{
                "source_post_id": source,
                "meal": meal,
                "reason": str(payload.get("reason", "")),
            }]
            return payload
        return value


class ShoppingItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    amount: str = Field(default="", max_length=160)
    used_on: list[int] = Field(default_factory=list)


class AgentReport(BaseModel):
    agent: str
    role: str
    status: Literal["completed", "failed", "skipped"]
    summary: str = ""
    duration_ms: int = 0


class MealPlanResult(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=600)
    mode: PlanningMode = "team"
    days: list[PlannedDay]
    shopping_list: list[ShoppingItem] = Field(default_factory=list)
    prep_notes: list[str] = Field(default_factory=list)
    decision_summary: str = Field(default="", max_length=800)
    agent_reports: list[AgentReport] = Field(default_factory=list)
    workflow_version: str = MEAL_PLAN_WORKFLOW_VERSION


class CandidateDish(BaseModel):
    post_id: str = Field(min_length=1, max_length=120)
    reason: str = Field(default="", max_length=240)


class CandidateDay(BaseModel):
    day_index: int = Field(ge=1, le=7)
    label: str = Field(min_length=1, max_length=40)
    dishes: list[CandidateDish] = Field(min_length=1, max_length=3)
    reason: str = Field(default="", max_length=300)


class CandidatePlan(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=600)
    days: list[CandidateDay]
    prep_notes: list[str] = Field(default_factory=list)
    strategy: str = Field(default="", max_length=80)


class PlanReview(BaseModel):
    winner_index: int = Field(ge=0)
    status: Literal["pass", "warn", "block"]
    summary: str = Field(min_length=1, max_length=600)
    issues: list[str] = Field(default_factory=list, max_length=12)


class MealPlanNeedsInput(RuntimeError):
    def __init__(self, message: str, issues: list[str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.issues = issues or []


StageCallback = Callable[[str, int], None]


class MealPlanGraphState(ForkFitGraphState, total=False):
    request_payload: dict[str, Any]
    on_stage: StageCallback | None
    days: int
    selected: list[dict[str, Any]]
    selected_recipe_ids: list[str]
    profile: UserProfile
    constraints: Any
    reports: list[AgentReport]
    candidates: list[CandidatePlan]
    review: PlanReview
    revision_count: int
    result: MealPlanResult


class PlanningGraphState(TypedDict, total=False):
    days: int
    request_text: str
    selected: list[dict[str, Any]]
    profile: UserProfile
    locale: str
    constraints: Any
    reports: list[AgentReport]
    on_stage: StageCallback | None
    candidates: list[CandidatePlan]
    review: PlanReview
    revision_count: int
    result: MealPlanResult


class MealPlanWorkflow:
    """Six-role, two-subgraph planning over selected community recipes only."""

    _strategies = (
        ("home_balance", "家常均衡规划 Agent", "优先菜品类型、口味和荤素变化。"),
        ("pantry_reuse", "采购复用规划 Agent", "优先跨天复用食材并减少浪费。"),
        ("quick_rhythm", "时间节奏规划 Agent", "优先平衡每天烹饪时间和工作量。"),
    )

    def __init__(
        self,
        llm: LLMClient | None = None,
        recipe_workflow: ForkFitLangGraphWorkflow | None = None,
    ) -> None:
        self.llm = llm or BailianLLMClient()
        self.normalizer = ConstraintNormalizer()
        self.recipe_workflow = recipe_workflow or ForkFitLangGraphWorkflow(
            llm_client=self.llm
        )
        self.planning_graph = self._build_planning_graph()
        self.graph = self._build_parent_graph()

    def run(
        self,
        request_payload: dict[str, Any],
        on_stage: StageCallback | None = None,
    ) -> MealPlanResult:
        state = self.graph.invoke({"request_payload": request_payload, "on_stage": on_stage})
        return state["result"]

    def _build_parent_graph(self) -> Any:
        graph = StateGraph(MealPlanGraphState)
        graph.add_node("prepare", self._prepare)
        graph.add_node("adapt_recipes", self.recipe_workflow.graph)
        graph.add_node("sync_recipes", self._sync_selected)
        graph.add_node("plan_menu", self.planning_graph)
        graph.add_edge(START, "prepare")
        graph.add_edge("prepare", "adapt_recipes")
        graph.add_edge("adapt_recipes", "sync_recipes")
        graph.add_edge("sync_recipes", "plan_menu")
        graph.add_edge("plan_menu", END)
        return graph.compile()

    def _build_planning_graph(self) -> Any:
        graph = StateGraph(PlanningGraphState)
        graph.add_node("draft_candidates", self._draft_candidates_node)
        graph.add_node("review_candidates", self._review_candidates_node)
        graph.add_node("revise_candidate", self._revise_candidate_node)
        graph.add_node("materialize", self._materialize_node)
        graph.add_node("stop", self._stop_node)
        graph.add_edge(START, "draft_candidates")
        graph.add_edge("draft_candidates", "review_candidates")
        graph.add_conditional_edges(
            "review_candidates",
            self._route_after_review,
            {"revise": "revise_candidate", "finish": "materialize", "stop": "stop"},
        )
        graph.add_edge("revise_candidate", "review_candidates")
        graph.add_edge("materialize", END)
        graph.add_edge("stop", END)
        return graph.compile()

    def _prepare(self, state: MealPlanGraphState) -> MealPlanGraphState:
        payload = state["request_payload"]
        notify = state.get("on_stage") or (lambda _stage, _progress: None)
        days = int(payload["days"])
        selected = list(payload.get("selected_recipes", []))
        if len(selected) < days:
            raise MealPlanNeedsInput(
                f"规划 {days} 天至少需要选择 {days} 道菜。",
                [f"当前已选择 {len(selected)} 道，请继续选择菜谱。"],
            )
        if len(selected) > 14:
            raise MealPlanNeedsInput("一次最多选择 14 道菜。")
        request_text = str(payload.get("request_text", "")).strip()
        profile = user_profile_from_dict(payload["user_profile"])
        locale = str(payload.get("locale", "zh"))
        notify("adapting_recipes", 8)
        constraints = self.normalizer.normalize(profile, request_text)
        if constraints.clarification:
            raise MealPlanNeedsInput(
                constraints.clarification.question,
                [constraints.clarification.code],
            )
        meals: list[Meal] = []
        original_ids: list[str] = []
        for index, item in enumerate(selected):
            meal = meal_from_dict(item["recipe"])
            original_ids.append(meal.id)
            meal.id = f"selected-{index + 1}"
            meals.append(meal)
        return {
            "days": days,
            "request_text": request_text,
            "selected": selected,
            "selected_recipe_ids": original_ids,
            "profile": profile,
            "user_profile": profile,
            "locale": locale,
            "constraints": constraints,
            "reports": [],
            "meal_pack": MealPack(
                id="selected-recipes", title="用户选入菜谱", theme="meal-plan-input", meals=meals
            ),
            "repair_count": 0,
            "revision_count": 0,
            "trace": RunTrace(
                workflow_version=WORKFLOW_VERSION, knowledge_version=KNOWLEDGE_VERSION
            ),
        }

    def _sync_selected(self, state: MealPlanGraphState) -> MealPlanGraphState:
        output = state.get("adapter_output")
        if not state.get("success") or output is None:
            unresolved = [] if output is None else output.unresolved_items
            raise MealPlanNeedsInput(
                "选入的菜谱无法满足当前限制，请调整要求后重试。",
                [item.message for item in unresolved][:8],
            )
        adapted = output.forked_meal_pack.meals
        selected = state["selected"]
        if len(adapted) != len(selected):
            raise RuntimeError("单菜调整子图改变了候选菜谱数量。")
        updated: list[dict[str, Any]] = []
        for index, (item, meal) in enumerate(zip(selected, adapted, strict=True)):
            if meal.id != f"selected-{index + 1}":
                raise RuntimeError("单菜调整子图改变了候选菜谱顺序或身份。")
            restored = meal.clone()
            restored.id = state["selected_recipe_ids"][index]
            updated.append({**item, "recipe": asdict(restored)})
        reports = list(state.get("reports", []))
        reports.extend([
            AgentReport(
                agent="recipe_adapter", role="菜谱调整 Agent", status="completed",
                summary=output.summary or "已完成候选菜谱约束调整。",
            ),
            AgentReport(
                agent="recipe_reviewer", role="单菜审核 Agent", status="completed",
                summary="候选菜谱已通过单菜约束与烹饪合理性审核。",
            ),
        ])
        return {"selected": updated, "reports": reports}

    def _draft_candidates_node(self, state: PlanningGraphState) -> PlanningGraphState:
        notify = state.get("on_stage") or (lambda _stage, _progress: None)
        notify("generating_combinations", 34)
        candidates: list[CandidatePlan] = []
        reports = list(state.get("reports", []))
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(self._draft_one, spec, state): spec for spec in self._strategies}
            for future in as_completed(futures):
                spec = futures[future]
                try:
                    candidate, duration = future.result()
                    candidates.append(candidate)
                    reports.append(AgentReport(
                        agent=spec[0], role=spec[1], status="completed",
                        summary=candidate.summary, duration_ms=duration,
                    ))
                except Exception as exc:
                    reports.append(AgentReport(
                        agent=spec[0], role=spec[1], status="failed", summary=str(exc)[:180]
                    ))
        if not candidates:
            raise RuntimeError("三个规划 Agent 都没有生成有效组合。")
        return {"candidates": candidates, "reports": reports}

    def _draft_one(
        self, spec: tuple[str, str, str], state: PlanningGraphState
    ) -> tuple[CandidatePlan, int]:
        started = time.perf_counter()
        payload = self.llm.complete_json(
            agent=f"meal_planner_{spec[0]}",
            system=self._planner_prompt(spec[1], spec[2], state["locale"]),
            user=json.dumps({
                "days": state["days"],
                "request": state["request_text"],
                "user_profile": asdict(state["profile"]),
                "recipe_pool": [self._recipe_summary(item) for item in state["selected"]],
            }, ensure_ascii=False),
            max_tokens=2600,
        )
        payload["strategy"] = spec[0]
        return CandidatePlan.model_validate(payload), int((time.perf_counter() - started) * 1000)

    @staticmethod
    def _planner_prompt(role: str, strategy: str, locale: str) -> str:
        language = "中文" if locale.startswith("zh") else "English"
        return f"""
你是 ForkFit 的{role}。{strategy}
你只能从 recipe_pool 选择 post_id，绝对不能创造新菜、修改菜谱或编造编号。
输出单个 JSON，不要 Markdown，不要解释推理。使用{language}：
{{"title":"菜单标题","summary":"两句话内概括","days":[{{"day_index":1,"label":"第 1 天","dishes":[{{"post_id":"来自候选池","reason":"选择理由"}}],"reason":"当天组合理由"}}],"prep_notes":["跨天备菜建议"]}}
规则：天数准确；每天 1 至 3 道；同一 post_id 整份菜单最多一次；候选可以不全部使用；不得改写食材、时间或厨具。
""".strip()

    def _review_candidates_node(self, state: PlanningGraphState) -> PlanningGraphState:
        notify = state.get("on_stage") or (lambda _stage, _progress: None)
        notify("reviewing_combinations", 68)
        issues = [self._validate_candidate(item, state["days"], state["selected"]) for item in state["candidates"]]
        started = time.perf_counter()
        payload = self.llm.complete_json(
            agent="comprehensive_plan_reviewer",
            system=(
                "你是 ForkFit 综合评审 Agent。评价菜品搭配、食材复用、每天工作量和用户限制，"
                "从已有候选中选择一份。不能生成菜单。只返回 JSON："
                '{"winner_index":0,"status":"pass|warn|block","summary":"结论","issues":["问题"]}。'
            ),
            user=json.dumps({
                "request": state["request_text"],
                "recipe_pool": [self._recipe_summary(item) for item in state["selected"]],
                "candidates": [item.model_dump(mode="json") for item in state["candidates"]],
                "deterministic_issues": issues,
            }, ensure_ascii=False),
            max_tokens=1400,
        )
        review = PlanReview.model_validate(payload)
        if review.winner_index >= len(state["candidates"]):
            review.winner_index = min(range(len(issues)), key=lambda index: len(issues[index]))
            review.status = "warn"
        winner_issues = issues[review.winner_index]
        if winner_issues:
            review.status = "block"
            review.issues = list(dict.fromkeys([*review.issues, *winner_issues]))[:12]
        reports = [r for r in state.get("reports", []) if r.agent != "comprehensive_plan_reviewer"]
        reports.append(AgentReport(
            agent="comprehensive_plan_reviewer", role="综合评审 Agent", status="completed",
            summary=review.summary, duration_ms=int((time.perf_counter() - started) * 1000),
        ))
        return {"review": review, "reports": reports}

    @staticmethod
    def _route_after_review(state: PlanningGraphState) -> str:
        if state["review"].status != "block":
            return "finish"
        return "revise" if state.get("revision_count", 0) == 0 else "stop"

    def _revise_candidate_node(self, state: PlanningGraphState) -> PlanningGraphState:
        notify = state.get("on_stage") or (lambda _stage, _progress: None)
        notify("revising_combination", 82)
        review = state["review"]
        candidate = state["candidates"][review.winner_index]
        spec = next((item for item in self._strategies if item[0] == candidate.strategy), self._strategies[0])
        payload = self.llm.complete_json(
            agent=f"meal_planner_{spec[0]}",
            system=self._planner_prompt(spec[1], spec[2], state["locale"]) + "\n仅修正一次，只处理评审问题。",
            user=json.dumps({
                "current_candidate": candidate.model_dump(mode="json"),
                "review_issues": review.issues,
                "recipe_pool": [self._recipe_summary(item) for item in state["selected"]],
                "days": state["days"],
            }, ensure_ascii=False),
            max_tokens=2600,
        )
        payload["strategy"] = spec[0]
        candidates = list(state["candidates"])
        candidates[review.winner_index] = CandidatePlan.model_validate(payload)
        return {"candidates": candidates, "revision_count": 1}

    def _materialize_node(self, state: PlanningGraphState) -> PlanningGraphState:
        review = state["review"]
        candidate = state["candidates"][review.winner_index]
        issues = self._validate_candidate(candidate, state["days"], state["selected"])
        if issues:
            raise MealPlanNeedsInput("当前选择无法组成满足要求的菜单。", issues[:8])
        by_post = {str(item["post_id"]): item for item in state["selected"]}
        days = [PlannedDay(
            day_index=day.day_index,
            label=day.label,
            dishes=[PlannedDish(
                source_post_id=dish.post_id,
                meal=meal_from_dict(by_post[dish.post_id]["recipe"]),
                reason=dish.reason,
            ) for dish in day.dishes],
            reason=day.reason,
        ) for day in candidate.days]
        notify = state.get("on_stage") or (lambda _stage, _progress: None)
        notify("finalizing", 96)
        return {"result": MealPlanResult(
            title=candidate.title,
            summary=candidate.summary,
            mode="team",
            days=days,
            shopping_list=self._shopping_list(days),
            prep_notes=candidate.prep_notes,
            decision_summary=review.summary,
            agent_reports=state.get("reports", []),
        )}

    @staticmethod
    def _stop_node(state: PlanningGraphState) -> PlanningGraphState:
        raise MealPlanNeedsInput(
            "当前选择无法组成满足要求的菜单，请调整候选菜谱。",
            state["review"].issues[:8],
        )

    @staticmethod
    def _validate_candidate(
        candidate: CandidatePlan, expected_days: int, selected: list[dict[str, Any]], *_unused: Any
    ) -> list[str]:
        issues: list[str] = []
        if len(candidate.days) != expected_days:
            issues.append(f"计划应有 {expected_days} 天，实际为 {len(candidate.days)} 天")
        if [day.day_index for day in candidate.days] != list(range(1, expected_days + 1)):
            issues.append("day_index 必须从 1 连续递增")
        allowed = {str(item["post_id"]) for item in selected}
        used: list[str] = []
        for day in candidate.days:
            for dish in day.dishes:
                if dish.post_id not in allowed:
                    issues.append(f"菜谱 {dish.post_id} 不在用户选入的候选池中")
                used.append(dish.post_id)
        duplicates = sorted({post_id for post_id in used if used.count(post_id) > 1})
        if duplicates:
            issues.append("同一道菜不能跨天重复：" + "、".join(duplicates))
        return list(dict.fromkeys(issues))

    @staticmethod
    def _recipe_summary(item: dict[str, Any]) -> dict[str, Any]:
        recipe = item["recipe"]
        return {
            "post_id": item["post_id"],
            "title": item.get("title") or recipe.get("name"),
            "ingredients": recipe.get("ingredients", []),
            "equipment": recipe.get("equipment", []),
            "cook_time_minutes": recipe.get("cook_time_minutes"),
            "tags": recipe.get("tags", []),
        }

    @staticmethod
    def _shopping_list(days: list[PlannedDay]) -> list[ShoppingItem]:
        grouped: dict[str, dict[str, Any]] = {}
        for day in days:
            for dish in day.dishes:
                for raw in dish.meal.ingredients:
                    amount, name = _split_ingredient(raw)
                    item = grouped.setdefault(name, {"amounts": [], "days": []})
                    if amount:
                        item["amounts"].append(amount)
                    if day.day_index not in item["days"]:
                        item["days"].append(day.day_index)
        return [ShoppingItem(
            name=name, amount=" + ".join(item["amounts"]) or "适量", used_on=item["days"]
        ) for name, item in grouped.items()]

    @staticmethod
    def classify_request(
        days: int, selected: list[dict[str, Any]], request_text: str, profile: UserProfile
    ) -> PlanningMode:
        del days, selected, request_text, profile
        return "team"


def _split_ingredient(value: str) -> tuple[str, str]:
    units = r"克|千克|个|杯|茶匙|汤匙|包|片|块|根|张|盎司|毫升|ml|g"
    prefix = re.match(rf"^\s*(适量|少许|[\d./]+\s*(?:{units})?)\s*(.*)$", value, re.I)
    if prefix and prefix.group(2).strip():
        return prefix.group(1).strip(), prefix.group(2).strip()
    suffix = re.match(rf"^\s*(.*?)\s+(适量|少许|[\d./]+\s*(?:{units})?)\s*$", value, re.I)
    if suffix and suffix.group(1).strip():
        return suffix.group(2).strip(), suffix.group(1).strip()
    return "", value.strip()
