# ForkFit Agent Core

ForkFit is a small agent-core prototype for personalizing community meal packs.

The MVP implements three bounded agents:

- `UserAgent`: interprets an explicit user profile and reviews taste fit.
- `ConstraintAgent`: uses the configured LLM to audit hard constraints from extracted constraints only.
- `AdapterAgent`: applies minimal changes to create a personalized fork.
- `ForkFitLangGraphWorkflow`: runs the actual LangGraph flow from input loading
  through final validation.
- `ConstraintGuard`: deterministic final validation. It is a guardrail, not an
  Agent.

The design intentionally keeps frontend, backend, database, and recommendation
systems out of scope. The goal is to make the agent boundaries, review protocol,
and extension points concrete and testable.

Run tests:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

Run the demo. This calls the configured Bailian model through the LangGraph flow:

```bash
PYTHONPATH=src python3 examples/run_demo.py
```

Run the real LangGraph + Bailian flow:

```bash
python3 scripts/run_real_langgraph.py
```

## Local API config

Copy `.env.example` to `.env` and set:

- `BAILIAN_API_KEY`
- `BAILIAN_MODEL`
- `BAILIAN_BASE_URL`

`UserAgent`, `ConstraintAgent`, and `AdapterAgent` use the configured Bailian
model. Final validation uses `ConstraintGuard`, a deterministic safety guardrail.

Each workflow result includes a trace:

- `trace.steps`: LangGraph node duration and status.
- `trace.llm_calls`: model, agent name, duration, token usage, and status.

Run a real Bailian smoke test:

```bash
python3 scripts/smoke_bailian.py
```
