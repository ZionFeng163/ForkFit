from __future__ import annotations

import logging
import re
import time
from typing import Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context

from .constraints import ConstraintGuard, ConstraintNormalizer, contains_constraint_term
from .llm import BailianLLMClient, LLMClient
from .models import (
    AdapterOutput,
    AgentFinding,
    AgentReview,
    ClarificationRequest,
    ConstraintSpec,
    ForkFitResult,
    MealPack,
    PreferenceProfile,
    PreferenceReview,
    QualityIssue,
    QualityReport,
    RecipePatch,
    RunTrace,
    StepTrace,
    ToolEvidence,
    UserAgentOutput,
    UserProfile,
)
from .recipe_agent import (
    AdaptationAgent,
    CulinaryCritic,
    KNOWLEDGE_VERSION,
    PatchApplier,
    PatchValidationError,
    RecipeKnowledgeService,
    WORKFLOW_VERSION,
)

logger = logging.getLogger(__name__)


class ForkFitGraphState(TypedDict, total=False):
    user_profile: UserProfile
    meal_pack: MealPack
    request_text: str
    locale: str
    constraint_spec: ConstraintSpec
    user_agent_output: UserAgentOutput
    precheck: AgentReview
    findings: list[AgentFinding]
    candidates: dict
    evidence: list[ToolEvidence]
    patch: RecipePatch
    adapter_output: AdapterOutput
    final_review: AgentReview
    quality_report: QualityReport
    repair_issues: list[QualityIssue]
    repair_count: int
    success: bool
    trace: RunTrace
    on_step_complete: Callable[[RunTrace], None] | None


class ForkFitLangGraphWorkflow:
    """A bounded, deterministic-first recipe adaptation workflow."""

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        substitution_tool=None,
    ) -> None:
        llm_client = llm_client or BailianLLMClient()
        if substitution_tool is None:
            substitution_tool = self._build_substitution_tool()
        self.normalizer = ConstraintNormalizer()
        self.guard = ConstraintGuard()
        self.knowledge = RecipeKnowledgeService(substitution_tool)
        self.adaptation_agent = AdaptationAgent(llm_client)
        self.critic = CulinaryCritic(llm_client)
        self.applier = PatchApplier()
        self.graph = self._build_graph()

    @staticmethod
    def _build_substitution_tool():
        try:
            from forkfit.config import get_settings
            from forkfit.knowledge.embeddings import EmbeddingClient
            from forkfit.knowledge.store import SubstitutionStore
            from forkfit.redis_utils import get_cache
            from forkfit.tools.substitution import SubstitutionTool

            store = SubstitutionStore()
            store.load(EmbeddingClient())
            return SubstitutionTool(store, cache=get_cache(get_settings().redis_url))
        except Exception as exc:
            logger.warning("Trusted substitution knowledge is unavailable: %s", exc)
            return None

    def run(
        self,
        user_profile: UserProfile,
        meal_pack: MealPack,
        locale: str = "en",
        on_step_complete: Callable[[RunTrace], None] | None = None,
        request_text: str = "",
    ) -> ForkFitResult:
        trace = RunTrace(
            workflow_version=WORKFLOW_VERSION,
            knowledge_version=KNOWLEDGE_VERSION,
        )
        with tracing_context(enabled=False):
            state = self.graph.invoke({
                "user_profile": user_profile,
                "meal_pack": meal_pack,
                "request_text": request_text,
                "locale": locale,
                "repair_count": 0,
                "trace": trace,
                "on_step_complete": on_step_complete,
            })
        return ForkFitResult(
            success=state["success"],
            user_agent_output=state["user_agent_output"],
            reviews=[state["precheck"]],
            adapter_output=state["adapter_output"],
            final_review=state["final_review"],
            trace=state["trace"],
            evidence=state.get("evidence", []),
            quality_report=state.get("quality_report"),
            safety_notices=[
                "ForkFit 不能判断食材加工和厨房环境中的交叉接触风险。请核对实际包装标签。"
                if locale.startswith("zh")
                else "ForkFit cannot assess cross-contact in packaged ingredients or kitchens. Check product labels."
            ],
        )

    def _build_graph(self) -> Any:
        graph = StateGraph(ForkFitGraphState)
        for name, node in (
            ("normalize", self._normalize),
            ("assess", self._assess),
            ("retrieve", self._retrieve),
            ("draft", self._draft),
            ("apply_validate", self._apply_validate),
            ("review", self._review),
            ("repair", self._repair),
            ("clarify", self._clarify),
            ("finalize", self._finalize),
        ):
            graph.add_node(name, self._traced_node(name, node))
        graph.add_edge(START, "normalize")
        graph.add_edge("normalize", "assess")
        graph.add_conditional_edges("assess", self._route_after_assess, {
            "clarify": "clarify", "finalize": "finalize", "retrieve": "retrieve",
        })
        graph.add_conditional_edges("retrieve", self._route_after_retrieve, {
            "clarify": "clarify", "draft": "draft",
        })
        graph.add_edge("draft", "apply_validate")
        graph.add_conditional_edges("apply_validate", self._route_after_validation, {
            "repair": "repair", "clarify": "clarify", "review": "review",
        })
        graph.add_conditional_edges("review", self._route_after_review, {
            "repair": "repair", "clarify": "clarify", "finalize": "finalize",
        })
        graph.add_edge("repair", "apply_validate")
        graph.add_edge("clarify", END)
        graph.add_edge("finalize", END)
        return graph.compile()

    def _normalize(self, state: ForkFitGraphState) -> ForkFitGraphState:
        if not state["meal_pack"].meals:
            raise ValueError("Meal pack must contain at least one meal.")
        spec = self.normalizer.normalize(state["user_profile"], state.get("request_text", ""))
        profile = state["user_profile"]
        user_output = UserAgentOutput(
            agent="user",
            preference_profile=PreferenceProfile(
                likes=list(spec.likes), dislikes=list(spec.dislikes),
                allergies=list(profile.allergies), diet_rules=list(profile.diet_rules),
                equipment=list(profile.equipment), soft_preferences=list(spec.soft_preferences),
            ),
            preference_review=PreferenceReview(status="pass", fit_score=1.0),
        )
        return {"constraint_spec": spec, "user_agent_output": user_output}

    def _assess(self, state: ForkFitGraphState) -> ForkFitGraphState:
        spec = state["constraint_spec"]
        review = self.guard.review(state["meal_pack"], spec, state["locale"])
        preferences = self._preference_findings(state["meal_pack"], spec)
        identity_risks = self._identity_risk_findings(
            state["meal_pack"], spec, state.get("request_text", ""), state["locale"]
        )
        findings = [*review.findings, *identity_risks, *preferences]
        user_output = state["user_agent_output"]
        user_output.preference_review.findings = preferences
        user_output.preference_review.status = "warn" if preferences else "pass"
        user_output.preference_review.fit_score = 0.6 if preferences else 1.0
        return {"precheck": review, "findings": findings, "user_agent_output": user_output}

    @staticmethod
    def _identity_risk_findings(
        meal_pack: MealPack, spec: ConstraintSpec, request_text: str, locale: str
    ) -> list[AgentFinding]:
        if ForkFitLangGraphWorkflow._identity_change_allowed(request_text):
            return []
        slow_dish_terms = ("派", "蛋糕", "面包", "炖", "焖", "烤", "pie", "cake", "bread", "braise")
        findings = []
        for meal in meal_pack.meals:
            if (
                spec.max_cook_time_minutes * 2 < meal.cook_time_minutes
                and any(term in meal.name.casefold() for term in slow_dish_terms)
            ):
                zh = locale.startswith("zh")
                findings.append(AgentFinding(
                    type="identity_risk", severity="high", affected_items=[meal.id],
                    message=(
                        f"{meal.name} 很难在 {spec.max_cook_time_minutes} 分钟内完成；硬压时间会变成另一道菜。"
                        if zh else f"{meal.name} cannot realistically be preserved within {spec.max_cook_time_minutes} minutes."
                    ),
                    required_action=(
                        "请放宽时间，或明确告诉我可以改成哪类快手菜。"
                        if zh else "Allow more time or confirm a different quick dish."
                    ),
                ))
        return findings

    @staticmethod
    def _identity_change_allowed(request_text: str) -> bool:
        return any(term in request_text for term in ("改成", "换成", "另一道", "不必保留"))

    @staticmethod
    def _preference_findings(meal_pack: MealPack, spec: ConstraintSpec) -> list[AgentFinding]:
        findings = []
        for meal in meal_pack.meals:
            for dislike in spec.dislikes:
                if contains_constraint_term(meal.searchable_text(), dislike):
                    findings.append(AgentFinding(
                        type="taste_mismatch", severity="low", affected_items=[meal.id],
                        message=f"Contains disliked ingredient: {dislike}",
                        suggested_action="replace ingredient",
                    ))
        return findings

    def _retrieve(self, state: ForkFitGraphState) -> ForkFitGraphState:
        candidates, evidence = self.knowledge.candidates(
            state["meal_pack"], state["constraint_spec"], state["findings"]
        )
        missing = []
        for finding in state["findings"]:
            if finding.type not in {"allergy", "diet_rule"}:
                continue
            if not any(candidates.get(meal_id) for meal_id in finding.affected_items):
                missing.append(AgentFinding(
                    type="no_trusted_substitution", severity="high",
                    affected_items=finding.affected_items,
                    message="No reviewed substitution is available for this ingredient.",
                    required_action="choose a substitution",
                ))
        return {
            "candidates": candidates,
            "evidence": evidence,
            "findings": [*state["findings"], *missing],
        }

    def _draft(self, state: ForkFitGraphState) -> ForkFitGraphState:
        patch = self.adaptation_agent.generate(
            state["meal_pack"], state["constraint_spec"], state["findings"],
            state.get("candidates", {}), state.get("evidence", []),
            locale=state["locale"], trace=state["trace"],
            repair_issues=state.get("repair_issues"),
        )
        return {"patch": patch}

    def _apply_validate(self, state: ForkFitGraphState) -> ForkFitGraphState:
        try:
            safety_targets = {
                ingredient.casefold()
                for ingredients in state.get("candidates", {}).values()
                for ingredient in ingredients
            }
            meal_pack, changes = self.applier.apply(
                state["meal_pack"], state["patch"], safety_targets=safety_targets
            )
        except (PatchValidationError, KeyError, TypeError, ValueError) as exc:
            issue = QualityIssue(
                code="invalid_patch", severity="high", meal_id="",
                message="The generated recipe patch was invalid.", repair_instruction=str(exc),
            )
            return {"repair_issues": [issue], "final_review": AgentReview(
                agent="constraint_guard", status="block", findings=[]
            )}
        final_review = self.guard.review(meal_pack, state["constraint_spec"], state["locale"])
        adapter = AdapterOutput(
            forked_meal_pack=meal_pack,
            change_log=changes,
            unresolved_items=list(state["patch"].unresolved_items),
            summary=state["patch"].summary,
            description=state["patch"].description,
        )
        issues = [
            QualityIssue(
                code=f"constraint_{finding.type}", severity=finding.severity,
                meal_id=finding.affected_items[0] if finding.affected_items else "",
                message=finding.message, repair_instruction=finding.action(),
            )
            for finding in final_review.findings if finding.severity == "high"
        ]
        issues.extend(self._duplicate_ingredient_issues(meal_pack))
        return {"adapter_output": adapter, "final_review": final_review, "repair_issues": issues}

    @staticmethod
    def _duplicate_ingredient_issues(meal_pack: MealPack) -> list[QualityIssue]:
        issues = []
        for meal in meal_pack.meals:
            seen: dict[str, str] = {}
            for ingredient in meal.ingredients:
                name = re.sub(
                    r"^\s*\d+(?:\.\d+)?\s*(?:克|千克|公斤|毫升|升|杯|汤匙|茶匙|个|只|片|块|g|kg|ml|l)\s*",
                    "",
                    ingredient.casefold(),
                )
                name = re.sub(r"^(?:瘦|新鲜|熟|生|切好的|切片的?)", "", name)
                name = re.sub(r"(?:片|块|丁|丝)$", "", name).strip()
                if len(name) < 2:
                    continue
                if name in seen:
                    issues.append(QualityIssue(
                        code="duplicate_ingredient", severity="high", meal_id=meal.id,
                        message=f"食材重复：{seen[name]} 与 {ingredient}",
                        repair_instruction=f"只保留合理份量的一项「{name}」，删除另一项。",
                    ))
                else:
                    seen[name] = ingredient
        return issues

    def _review(self, state: ForkFitGraphState) -> ForkFitGraphState:
        if not CulinaryCritic.is_required(state["patch"]):
            return {"quality_report": QualityReport(status="pass", repair_count=state["repair_count"])}
        report = self.critic.review(
            state["meal_pack"],
            state["adapter_output"].forked_meal_pack,
            state["patch"], locale=state["locale"],
            identity_change_allowed=self._identity_change_allowed(
                state.get("request_text", "")
            ),
            trace=state["trace"],
        )
        report.repair_count = state["repair_count"]
        return {"quality_report": report, "repair_issues": report.issues}

    def _repair(self, state: ForkFitGraphState) -> ForkFitGraphState:
        repair_count = state.get("repair_count", 0) + 1
        state["trace"].repair_count = repair_count
        patch = self.adaptation_agent.generate(
            state["meal_pack"], state["constraint_spec"], state["findings"],
            state.get("candidates", {}), state.get("evidence", []),
            locale=state["locale"], trace=state["trace"],
            repair_issues=state.get("repair_issues", []),
        )
        return {"patch": patch, "repair_count": repair_count}

    def _clarify(self, state: ForkFitGraphState) -> ForkFitGraphState:
        unresolved = []
        if state.get("repair_count", 0) > 0 and state.get("repair_issues"):
            unresolved = [AgentFinding(
                type=issue.code, severity="high",
                affected_items=[issue.meal_id] if issue.meal_id else [],
                message=issue.message, required_action=issue.repair_instruction,
            ) for issue in state["repair_issues"]]
        if not unresolved:
            high_findings = [
                item for item in state.get("findings", []) if item.severity == "high"
            ]
            identity_risks = [
                item for item in high_findings if item.type == "identity_risk"
            ]
            unresolved = identity_risks or high_findings
        clarification = state["constraint_spec"].clarification
        if clarification and not unresolved:
            unresolved = [AgentFinding(
                type=clarification.code, severity="high",
                affected_items=clarification.affected_items,
                message=clarification.question, required_action="confirm constraint",
            )]
        adapter = state.get("adapter_output") or AdapterOutput(
            forked_meal_pack=state["meal_pack"].clone(), change_log=[],
            unresolved_items=unresolved, summary="Additional information is required.",
        )
        adapter.unresolved_items = unresolved
        final_review = state.get("final_review") or AgentReview(
            agent="constraint_guard", status="block", findings=unresolved
        )
        return {"adapter_output": adapter, "final_review": final_review, "success": False}

    def _finalize(self, state: ForkFitGraphState) -> ForkFitGraphState:
        adapter = state.get("adapter_output") or AdapterOutput(
            forked_meal_pack=state["meal_pack"].clone(), change_log=[],
            unresolved_items=[], summary="Meal pack already satisfies the request.",
        )
        final_review = state.get("final_review") or state["precheck"]
        success = final_review.status != "block" and not adapter.unresolved_items
        return {"adapter_output": adapter, "final_review": final_review, "success": success}

    @staticmethod
    def _route_after_assess(state: ForkFitGraphState) -> str:
        if state["constraint_spec"].clarification:
            return "clarify"
        if any(item.type == "identity_risk" for item in state["findings"]):
            return "clarify"
        return "retrieve" if state["findings"] else "finalize"

    @staticmethod
    def _route_after_retrieve(state: ForkFitGraphState) -> str:
        return "clarify" if any(item.type == "no_trusted_substitution" for item in state["findings"]) else "draft"

    @staticmethod
    def _route_after_validation(state: ForkFitGraphState) -> str:
        blocked = bool(state.get("repair_issues")) or state["final_review"].status == "block"
        if blocked and state.get("repair_count", 0) == 0:
            return "repair"
        return "clarify" if blocked else "review"

    @staticmethod
    def _route_after_review(state: ForkFitGraphState) -> str:
        report = state["quality_report"]
        if report.status == "block" and state.get("repair_count", 0) == 0:
            return "repair"
        return "clarify" if report.status == "block" else "finalize"

    def _traced_node(self, name: str, fn: Callable[[ForkFitGraphState], ForkFitGraphState]):
        def wrapped(state: ForkFitGraphState) -> ForkFitGraphState:
            started = time.perf_counter()
            try:
                output = fn(state)
                state["trace"].steps.append(StepTrace(
                    node=name, duration_ms=_elapsed_ms(started), status="success",
                    details={"workflow_version": WORKFLOW_VERSION},
                ))
            except Exception as exc:
                state["trace"].steps.append(StepTrace(
                    node=name, duration_ms=_elapsed_ms(started), status="error", error=type(exc).__name__,
                ))
                raise
            callback = state.get("on_step_complete")
            if callback:
                try:
                    callback(state["trace"])
                except Exception as exc:
                    logger.warning("Step callback failed after %s: %s", name, exc)
            return output
        return wrapped


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)
