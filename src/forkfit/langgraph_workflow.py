from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, TypedDict

logger = logging.getLogger(__name__)

from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context

from .agents import AdapterAgent, CookingStepsAgent, ConstraintAgent, ConstraintGuard, ReviewerAgent, UserAgent
from .llm import BailianLLMClient, LLMClient
from .models import (
    AdapterOutput,
    AgentReview,
    ConstraintSet,
    ForkFitResult,
    MealPack,
    RunTrace,
    StepTrace,
    UserAgentOutput,
    UserProfile,
)


class ForkFitGraphState(TypedDict, total=False):
    user_profile: UserProfile
    meal_pack: MealPack
    locale: str
    user_agent_output: UserAgentOutput
    constraints: ConstraintSet
    reviews: list[AgentReview]
    adapter_output: AdapterOutput
    _cooking_steps_result: MealPack
    final_review: AgentReview
    success: bool
    trace: RunTrace


class ForkFitLangGraphWorkflow:
    """LangGraph implementation of the ForkFit three-agent workflow."""

    def __init__(
        self,
        user_agent: UserAgent | None = None,
        reviewer_agents: list[ReviewerAgent] | None = None,
        adapter_agent: AdapterAgent | None = None,
        llm_client: LLMClient | None = None,
    ) -> None:
        llm_client = llm_client or BailianLLMClient()

        # Lazy-load Redis cache
        cache = None
        try:
            from forkfit.config import get_settings
            from forkfit.redis_utils import get_cache
            settings = get_settings()
            cache = get_cache(settings.redis_url)
        except Exception as e:
            logger.warning("Cache initialization failed: %s", e)

        # Lazy-load substitution tool
        substitution_tool = None
        try:
            from forkfit.knowledge.store import SubstitutionStore
            from forkfit.knowledge.embeddings import EmbeddingClient
            from forkfit.tools.substitution import SubstitutionTool
            store = SubstitutionStore()
            embedding_client = EmbeddingClient()
            store.load(embedding_client)
            substitution_tool = SubstitutionTool(store, cache=cache)
        except Exception as e:
            logger.warning("Substitution tool initialization failed: %s", e)

        # Lazy-load cooking steps tool
        cooking_steps_tool = None
        try:
            from forkfit.knowledge.cooking_store import CookingStepsStore
            from forkfit.tools.cooking_steps import CookingStepsTool
            cooking_store = CookingStepsStore()
            cooking_store.load()
            cooking_steps_tool = CookingStepsTool(cooking_store, cache=cache)
        except Exception as e:
            logger.warning("Cooking steps tool initialization failed: %s", e)

        # Lazy-load nutrition tool
        nutrition_tool = None
        try:
            from forkfit.knowledge.nutrition_store import NutritionStore
            from forkfit.tools.nutrition import NutritionTool
            nutrition_store = NutritionStore()
            nutrition_store.load()
            nutrition_tool = NutritionTool(nutrition_store)
        except Exception as e:
            logger.warning("Nutrition tool initialization failed: %s", e)

        self.user_agent = user_agent or UserAgent(llm_client)
        self.reviewer_agents = reviewer_agents or [ConstraintAgent(llm_client, nutrition_tool=nutrition_tool)]
        self.adapter_agent = adapter_agent or AdapterAgent(llm_client, substitution_tool=substitution_tool, nutrition_tool=nutrition_tool)
        self.cooking_steps_agent = CookingStepsAgent(llm_client, cooking_steps_tool=cooking_steps_tool)
        self.final_constraint_guard = ConstraintGuard()
        self.graph = self._build_graph()

    def run(self, user_profile: UserProfile, meal_pack: MealPack, locale: str = "en") -> ForkFitResult:
        with tracing_context(enabled=False):
            state = self.graph.invoke(
                {
                    "user_profile": user_profile,
                    "meal_pack": meal_pack,
                    "locale": locale,
                    "trace": RunTrace(),
                }
            )
        return ForkFitResult(
            success=state["success"],
            user_agent_output=state["user_agent_output"],
            reviews=state["reviews"],
            adapter_output=state["adapter_output"],
            final_review=state["final_review"],
            trace=state["trace"],
        )

    def _build_graph(self) -> Any:
        graph = StateGraph(ForkFitGraphState)
        graph.add_node("load_input", self._traced_node("load_input", self._load_input))
        graph.add_node("user_agent", self._traced_node("user_agent", self._run_user_agent))
        graph.add_node(
            "reviewer_agents",
            self._traced_node("reviewer_agents", self._run_reviewer_agents),
        )
        graph.add_node(
            "adapter_agent", self._traced_node("adapter_agent", self._run_adapter_agent)
        )
        graph.add_node(
            "cooking_steps",
            self._traced_node("cooking_steps", self._run_cooking_steps),
        )
        graph.add_node(
            "final_validation",
            self._traced_node("final_validation", self._run_final_validation),
        )
        graph.add_node(
            "join_parallel",
            self._traced_node("join_parallel", self._join_parallel),
        )

        graph.add_edge(START, "load_input")
        graph.add_edge("load_input", "user_agent")
        graph.add_edge("user_agent", "reviewer_agents")
        graph.add_edge("reviewer_agents", "adapter_agent")
        # Fan-out: adapter_agent → cooking_steps + final_validation (parallel)
        graph.add_edge("adapter_agent", "cooking_steps")
        graph.add_edge("adapter_agent", "final_validation")
        # Fan-in: both merge at join_parallel
        graph.add_edge("cooking_steps", "join_parallel")
        graph.add_edge("final_validation", "join_parallel")
        graph.add_edge("join_parallel", END)
        return graph.compile()

    def _load_input(self, state: ForkFitGraphState) -> ForkFitGraphState:
        if "user_profile" not in state or "meal_pack" not in state:
            raise ValueError("ForkFit graph requires user_profile and meal_pack.")
        return {}

    def _run_user_agent(self, state: ForkFitGraphState) -> ForkFitGraphState:
        user_output = self.user_agent.run(
            state["user_profile"], state["meal_pack"], state["trace"]
        )
        constraints = user_output.preference_profile.to_constraints(state["user_profile"])
        return {
            "user_agent_output": user_output,
            "constraints": constraints,
        }

    def _run_reviewer_agents(self, state: ForkFitGraphState) -> ForkFitGraphState:
        """Run all reviewer agents in parallel using threads."""
        meal_pack = state["meal_pack"]
        constraints = state["constraints"]
        trace = state["trace"]

        if len(self.reviewer_agents) <= 1:
            # Single reviewer — no threading overhead
            reviews = [
                reviewer.review(meal_pack, constraints, trace)
                for reviewer in self.reviewer_agents
            ]
        else:
            # Multiple reviewers — run in parallel
            reviews = [None] * len(self.reviewer_agents)
            with ThreadPoolExecutor(max_workers=len(self.reviewer_agents)) as pool:
                futures = {
                    pool.submit(reviewer.review, meal_pack, constraints, trace): i
                    for i, reviewer in enumerate(self.reviewer_agents)
                }
                for future in as_completed(futures):
                    idx = futures[future]
                    reviews[idx] = future.result()
        return {"reviews": reviews}

    def _run_adapter_agent(self, state: ForkFitGraphState) -> ForkFitGraphState:
        people_count = state["user_profile"].people_count if "user_profile" in state else 1
        adapter_output = self.adapter_agent.run(
            state["meal_pack"],
            state["user_agent_output"],
            state["reviews"],
            state["trace"],
            locale=state.get("locale", "en"),
            people_count=people_count,
        )
        return {"adapter_output": adapter_output}

    def _run_cooking_steps(self, state: ForkFitGraphState) -> ForkFitGraphState:
        # Clone the forked pack so final_validation (running in parallel) isn't affected
        forked_pack = state["adapter_output"].forked_meal_pack.clone()
        updated_pack = self.cooking_steps_agent.run(
            forked_pack,
            state["user_agent_output"],
            state["trace"],
            locale=state.get("locale", "en"),
        )
        # Store the steps separately so join_parallel can merge them
        return {"_cooking_steps_result": updated_pack}

    def _join_parallel(self, state: ForkFitGraphState) -> ForkFitGraphState:
        """Merge results from parallel cooking_steps and final_validation."""
        steps_pack = state.get("_cooking_steps_result")
        if steps_pack:
            # Copy generated steps back into the forked meal pack
            for step_meal in steps_pack.meals:
                target = state["adapter_output"].forked_meal_pack.find_meal(step_meal.id)
                if target and step_meal.steps:
                    target.steps = step_meal.steps
        return {}

    def _run_final_validation(self, state: ForkFitGraphState) -> ForkFitGraphState:
        final_review = self.final_constraint_guard.review(
            state["adapter_output"].forked_meal_pack,
            state["constraints"],
        )
        success = not state["adapter_output"].unresolved_items and final_review.status != "block"
        return {
            "final_review": final_review,
            "success": success,
        }

    def _traced_node(
        self,
        node_name: str,
        fn: Callable[[ForkFitGraphState], ForkFitGraphState],
    ) -> Callable[[ForkFitGraphState], ForkFitGraphState]:
        def wrapped(state: ForkFitGraphState) -> ForkFitGraphState:
            started = time.perf_counter()
            trace = state["trace"]
            try:
                output = fn(state)
                trace.steps.append(
                    StepTrace(
                        node=node_name,
                        duration_ms=_elapsed_ms(started),
                        status="success",
                    )
                )
                return output
            except Exception as exc:
                trace.steps.append(
                    StepTrace(
                        node=node_name,
                        duration_ms=_elapsed_ms(started),
                        status="error",
                        error=str(exc),
                    )
                )
                raise

        return wrapped


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)
