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

## Backend API

The backend API requires real Postgres and Redis:

```bash
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/forkfit \
REDIS_URL=redis://localhost:6379/0 \
python3 scripts/run_api.py
```

Start a worker in a separate process:

```bash
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/forkfit \
REDIS_URL=redis://localhost:6379/0 \
python3 scripts/run_worker.py
```

Do not use SQLite or in-memory stores for API operation. Install and run
Postgres and Redis before using the backend API.

## LangSmith tracing

ForkFit keeps its local trace in Postgres and can also export summary metrics to
LangSmith. Set these values in `.env` to enable upload:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-key
LANGSMITH_PROJECT=forkfit
```

The exporter sends run status, total duration, LLM call count, per-node
durations, and per-agent token/duration metrics. It does not send full prompts
or raw user profiles.
