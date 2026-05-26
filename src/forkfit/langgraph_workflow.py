from __future__ import annotations

import time
from typing import Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context

from .agents import AdapterAgent, ConstraintAgent, ConstraintGuard, ReviewerAgent, UserAgent
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
    user_agent_output: UserAgentOutput
    constraints: ConstraintSet
    reviews: list[AgentReview]
    adapter_output: AdapterOutput
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
        self.user_agent = user_agent or UserAgent(llm_client)
        self.reviewer_agents = reviewer_agents or [ConstraintAgent(llm_client)]
        self.adapter_agent = adapter_agent or AdapterAgent(llm_client)
        self.final_constraint_guard = ConstraintGuard()
        self.graph = self._build_graph()

    def run(self, user_profile: UserProfile, meal_pack: MealPack) -> ForkFitResult:
        with tracing_context(enabled=False):
            state = self.graph.invoke(
                {
                    "user_profile": user_profile,
                    "meal_pack": meal_pack,
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
            "final_validation",
            self._traced_node("final_validation", self._run_final_validation),
        )

        graph.add_edge(START, "load_input")
        graph.add_edge("load_input", "user_agent")
        graph.add_edge("user_agent", "reviewer_agents")
        graph.add_edge("reviewer_agents", "adapter_agent")
        graph.add_edge("adapter_agent", "final_validation")
        graph.add_edge("final_validation", END)
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
        reviews = [
            reviewer.review(state["meal_pack"], state["constraints"], state["trace"])
            for reviewer in self.reviewer_agents
        ]
        return {"reviews": reviews}

    def _run_adapter_agent(self, state: ForkFitGraphState) -> ForkFitGraphState:
        adapter_output = self.adapter_agent.run(
            state["meal_pack"],
            state["user_agent_output"],
            state["reviews"],
            state["trace"],
        )
        return {"adapter_output": adapter_output}

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
