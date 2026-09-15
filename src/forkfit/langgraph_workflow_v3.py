from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context

from .constraints import ConstraintGuard
from .llm import BailianLLMClient, LLMClient
from .models import AdapterOutput, AgentFinding, AgentReview, ForkFitResult, MealPack, PreferenceProfile, PreferenceReview, QualityIssue, QualityReport, RecipePatch, RunTrace, StepTrace, UserAgentOutput, UserProfile
from .recipe_agent_v3 import AdaptationAgent, KNOWLEDGE_VERSION, PatchApplier, PatchValidationError, WORKFLOW_VERSION
from .recipe_review_agent import RecipeReviewAgent

logger = logging.getLogger(__name__)

STEP_INGREDIENT_TERMS = ("盐", "生抽", "老抽", "酱油", "白糖", "糖", "醋", "料酒", "胡椒粉", "鸡精", "食用油", "清水", "姜", "蒜")


class ForkFitGraphState(TypedDict, total=False):
    user_profile: UserProfile
    meal_pack: MealPack
    request_text: str
    require_change: bool
    locale: str
    constraint_spec: Any
    user_agent_output: UserAgentOutput
    precheck: AgentReview
    findings: list[AgentFinding]
    patch: RecipePatch
    allowed_replacements: dict[str, set[str]]
    adapter_output: AdapterOutput
    final_review: AgentReview
    quality_report: QualityReport
    repair_issues: list[QualityIssue]
    repair_count: int
    success: bool
    trace: RunTrace
    on_step_complete: Callable[[RunTrace], None] | None


class ForkFitLangGraphWorkflow:
    """Review -> bounded tool-using adaptation -> review -> one repair -> safety backstop."""

    def __init__(self, llm_client: LLMClient | None = None, substitution_tool=None) -> None:
        llm = llm_client or BailianLLMClient()
        if substitution_tool is None: substitution_tool = self._build_substitution_tool()
        self.reviewer = RecipeReviewAgent(llm)
        self.adapter = AdaptationAgent(llm, substitution_tool)
        self.applier = PatchApplier()
        self.safety_guard = ConstraintGuard()
        self.graph = self._build_graph()

    @staticmethod
    def _build_substitution_tool():
        try:
            from forkfit.config import get_settings
            from forkfit.knowledge.embeddings import EmbeddingClient
            from forkfit.knowledge.store import SubstitutionStore
            from forkfit.redis_utils import get_cache
            from forkfit.tools.substitution import SubstitutionTool
            store = SubstitutionStore(); store.load(EmbeddingClient())
            return SubstitutionTool(store, cache=get_cache(get_settings().redis_url))
        except Exception as exc:
            logger.warning("Substitution search is unavailable: %s", exc)
            return None

    def run(self, user_profile: UserProfile, meal_pack: MealPack, locale: str = "en",
            on_step_complete: Callable[[RunTrace], None] | None = None, request_text: str = "", require_change: bool = False) -> ForkFitResult:
        trace = RunTrace(workflow_version=WORKFLOW_VERSION, knowledge_version=KNOWLEDGE_VERSION)
        with tracing_context(enabled=False):
            state = self.graph.invoke({"user_profile": user_profile, "meal_pack": meal_pack, "request_text": request_text,
                                       "locale": locale, "repair_count": 0, "trace": trace, "on_step_complete": on_step_complete, "require_change": require_change})
        return ForkFitResult(state["success"], state["user_agent_output"], [state["precheck"]], state["adapter_output"],
                             state["final_review"], trace, evidence=[], quality_report=state.get("quality_report"),
                             safety_notices=["过敏用户仍需核对商品标签和厨房交叉接触风险。" if locale.startswith("zh") else "Check labels and kitchen cross-contact risks."])

    def _build_graph(self):
        graph = StateGraph(ForkFitGraphState)
        for name, fn in (("review_input", self._review_input), ("adapt", self._adapt), ("apply", self._apply),
                         ("review_output", self._review_output), ("repair", self._repair),
                         ("clarify", self._clarify), ("finalize", self._finalize)):
            graph.add_node(name, self._traced(name, fn))
        graph.add_edge(START, "review_input")
        graph.add_conditional_edges("review_input", self._after_input, {"adapt": "adapt", "clarify": "clarify", "review": "review_output"})
        graph.add_edge("adapt", "apply")
        graph.add_conditional_edges("apply", self._after_apply, {"review": "review_output", "repair": "repair", "clarify": "clarify"})
        graph.add_conditional_edges("review_output", self._after_review, {"finalize": "finalize", "repair": "repair", "clarify": "clarify"})
        graph.add_edge("repair", "apply")
        graph.add_edge("clarify", END); graph.add_edge("finalize", END)
        return graph.compile()

    def _review_input(self, state: ForkFitGraphState) -> ForkFitGraphState:
        if not state["meal_pack"].meals: raise ValueError("Meal pack must contain at least one meal")
        spec, review = self.reviewer.understand_and_review(state["user_profile"], state.get("request_text", ""), state["meal_pack"], locale=state["locale"], trace=state["trace"])
        deterministic = self.safety_guard.review(state["meal_pack"], spec, state["locale"])
        existing = {
            (item.type, tuple(item.affected_items), tuple(item.affected_ingredients))
            for item in review.findings
        }
        for finding in deterministic.findings:
            key = (finding.type, tuple(finding.affected_items), tuple(finding.affected_ingredients))
            if key not in existing:
                review.findings.append(finding)
                existing.add(key)
        if state.get("require_change"):
            review.findings.append(AgentFinding(
                "preference", "low", [meal.id for meal in state["meal_pack"].meals],
                "用户要求在当前菜谱基础上继续调整，不能仅因满足硬约束就跳过。",
                required_action=state.get("request_text", ""),
            ))
        review.status = "block" if any(item.severity == "high" for item in review.findings) else "warn" if review.findings else "pass"
        user = UserAgentOutput("user", PreferenceProfile(spec.likes, spec.dislikes, [i.value for i in spec.items if i.kind == "allergy"], [i.value for i in spec.items if i.kind == "diet_rule"], [i.value for i in spec.items if i.kind == "equipment"], spec.soft_preferences), PreferenceReview("warn" if review.findings else "pass", 0.6 if review.findings else 1.0, review.findings))
        return {"constraint_spec": spec, "precheck": review, "findings": review.findings, "user_agent_output": user}

    def _adapt(self, state: ForkFitGraphState) -> ForkFitGraphState:
        affected = {meal_id for finding in state["findings"] for meal_id in finding.affected_items}
        global_issue = any(not finding.affected_items for finding in state["findings"])
        known_ids = {meal.id for meal in state["meal_pack"].meals}
        if affected - known_ids:
            raise ValueError("Review references an unknown meal.")
        targets = [meal for meal in state["meal_pack"].meals if global_issue or not affected or meal.id in affected]
        patches: list[tuple[int, RecipePatch, dict[str, set[str]]]] = []
        def one(index, meal):
            findings = [f for f in state["findings"] if not f.affected_items or meal.id in f.affected_items]
            issues = [issue for issue in state.get("repair_issues", []) if not issue.meal_id or issue.meal_id == meal.id]
            prior = state.get("adapter_output")
            prior_meal = prior.forked_meal_pack.find_meal(meal.id) if prior and issues else None
            previous_attempt = MealPack(state["meal_pack"].id, state["meal_pack"].title, state["meal_pack"].theme, [prior_meal.clone()]) if prior_meal else None
            return index, *self.adapter.generate(MealPack(state["meal_pack"].id, state["meal_pack"].title, state["meal_pack"].theme, [meal.clone()]), state["constraint_spec"], findings, locale=state["locale"], trace=state["trace"], repair_issues=issues, request_text=state.get("request_text", ""), previous_attempt=previous_attempt)
        with ThreadPoolExecutor(max_workers=min(4, len(targets))) as pool:
            futures = [pool.submit(one, index, meal) for index, meal in enumerate(targets)]
            for future in as_completed(futures): patches.append(future.result())
        patches.sort(key=lambda item: item[0])
        operations, unresolved, allowed, summaries, descriptions = [], [], {}, [], []
        for _, patch, candidates in patches:
            operations.extend(patch.operations); unresolved.extend(patch.unresolved_items)
            summaries.append(patch.summary); descriptions.append(patch.description)
            for key, values in candidates.items(): allowed.setdefault(key, set()).update(values)
        return {"patch": RecipePatch(operations, "；".join(filter(None, summaries)), "；".join(filter(None, descriptions)), unresolved, []), "allowed_replacements": allowed}

    def _apply(self, state: ForkFitGraphState) -> ForkFitGraphState:
        safety_targets = {ingredient.casefold() for finding in state["findings"] if finding.type in {"allergy", "diet_rule"} for ingredient in finding.affected_ingredients}
        try:
            meal_pack, changes = self.applier.apply(state["meal_pack"], state["patch"], safety_targets=safety_targets, allowed_replacements=state.get("allowed_replacements", {}))
        except (PatchValidationError, KeyError, TypeError, ValueError) as exc:
            issue = QualityIssue("invalid_patch", "high", "", "调整结果未通过结构校验。", str(exc))
            return {"repair_issues": [issue], "final_review": AgentReview("recipe_reviewer", "block", [])}
        adapter = AdapterOutput(meal_pack, changes, list(state["patch"].unresolved_items), state["patch"].summary, state["patch"].description)
        if state.get("require_change") and meal_pack.to_dict() == state["meal_pack"].to_dict() and not adapter.unresolved_items:
            issue = QualityIssue("requested_change_missing", "high", "", "本轮要求实际修改，但菜谱没有变化。",
                                 "根据本轮要求调整实际食材用量或相关步骤，不能仅返回已满足要求；无法调整时说明原因。")
            return {"adapter_output": adapter, "repair_issues": [issue], "final_review": AgentReview("recipe_reviewer", "block", [])}
        if adapter.unresolved_items:
            return {"adapter_output": adapter, "repair_issues": [QualityIssue("needs_input", "high", "", f.message, f.action()) for f in adapter.unresolved_items], "final_review": AgentReview("recipe_reviewer", "block", adapter.unresolved_items)}
        return {"adapter_output": adapter, "repair_issues": [], "final_review": AgentReview("recipe_reviewer", "pass", [])}

    def _review_output(self, state: ForkFitGraphState) -> ForkFitGraphState:
        adapter = state.get("adapter_output") or AdapterOutput(state["meal_pack"].clone(), [], [], "菜谱未作修改。")
        deterministic_issues = []
        for meal in adapter.forked_meal_pack.meals:
            ingredient_text = " ".join(meal.ingredients).casefold()
            step_text = " ".join(meal.steps).casefold()
            missing = [term for term in STEP_INGREDIENT_TERMS if term.casefold() in step_text and term.casefold() not in ingredient_text]
            if missing:
                deterministic_issues.append(QualityIssue(
                    "unlisted_step_ingredient", "high", meal.id,
                    "步骤使用了食材清单中没有的内容：" + "、".join(missing),
                    "将实际使用的调味料补入食材清单，或从步骤中删除未使用内容。",
                ))
        safety = self.safety_guard.review(adapter.forked_meal_pack, state["constraint_spec"], state["locale"])
        for finding in safety.findings:
            if finding.severity == "high":
                deterministic_issues.append(QualityIssue(f"safety_{finding.type}", "high", finding.affected_items[0] if finding.affected_items else "", finding.message, finding.action()))
        report = self.reviewer.review_adjusted(state["meal_pack"], adapter.forked_meal_pack, state["constraint_spec"], locale=state["locale"], trace=state["trace"], request_text=state.get("request_text", ""), deterministic_issues=deterministic_issues)
        report.issues.extend(deterministic_issues)
        report.status = "block" if any(i.severity == "high" for i in report.issues) else "warn" if report.issues else "pass"
        report.repair_count = state.get("repair_count", 0)
        return {"adapter_output": adapter, "quality_report": report, "repair_issues": report.issues,
                "final_review": AgentReview("recipe_reviewer", report.status, [AgentFinding(i.code, i.severity, [i.meal_id] if i.meal_id else [], i.message, required_action=i.repair_instruction) for i in report.issues])}

    def _repair(self, state: ForkFitGraphState) -> ForkFitGraphState:
        state["trace"].repair_count = 1
        findings = [*state["findings"], *[
            AgentFinding(issue.code, issue.severity, [issue.meal_id] if issue.meal_id else [],
                         issue.message, required_action=issue.repair_instruction)
            for issue in state.get("repair_issues", [])
        ]]
        return {**self._adapt({**state, "findings": findings}), "repair_count": 1}

    def _clarify(self, state: ForkFitGraphState) -> ForkFitGraphState:
        unresolved = state.get("adapter_output", AdapterOutput(state["meal_pack"].clone(), [], [], "需要补充信息。")).unresolved_items
        if not unresolved:
            unresolved = [AgentFinding(i.code, "high", [i.meal_id] if i.meal_id else [], i.message, required_action=i.repair_instruction) for i in state.get("repair_issues", [])]
        if state["constraint_spec"].clarification and not unresolved:
            c = state["constraint_spec"].clarification; unresolved = [AgentFinding(c.code, "high", c.affected_items, c.question, required_action="请确认这项限制。")]
        adapter = AdapterOutput(state["meal_pack"].clone(), [], unresolved, "调整未通过审核，原菜谱保持不变。")
        return {"adapter_output": adapter, "final_review": AgentReview("recipe_reviewer", "block", unresolved), "success": False}

    def _finalize(self, state: ForkFitGraphState) -> ForkFitGraphState:
        adapter = state.get("adapter_output") or AdapterOutput(state["meal_pack"].clone(), [], [], "菜谱已满足要求。")
        review = state.get("final_review") or state["precheck"]
        return {"adapter_output": adapter, "final_review": review, "success": review.status != "block" and not adapter.unresolved_items}

    @staticmethod
    def _after_input(state):
        if state["constraint_spec"].clarification: return "clarify"
        return "adapt" if state["findings"] else "review"
    @staticmethod
    def _after_apply(state):
        blocked = bool(state.get("repair_issues"))
        return "repair" if blocked and state.get("repair_count", 0) == 0 else "clarify" if blocked else "review"
    @staticmethod
    def _after_review(state):
        blocked = state["quality_report"].status == "block"
        return "repair" if blocked and state.get("repair_count", 0) == 0 else "clarify" if blocked else "finalize"

    def _traced(self, name, fn):
        def wrapped(state):
            started = time.perf_counter()
            try:
                output = fn(state); status, error = "success", ""
            except Exception as exc:
                status, error = "error", type(exc).__name__
                state["trace"].steps.append(StepTrace(name, round((time.perf_counter()-started)*1000, 2), status, error=error)); raise
            state["trace"].steps.append(StepTrace(name, round((time.perf_counter()-started)*1000, 2), status, details={"workflow_version": WORKFLOW_VERSION}))
            if state.get("on_step_complete"): state["on_step_complete"](state["trace"])
            return output
        return wrapped
