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

The first web MVP lives in `apps/web`. It provides a seeded community meal-pack
feed, pack details, a Fork form, and a run result page that talks to the backend
API.

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
ForkFit sends `enable_thinking=false` and per-agent `max_tokens` caps for Qwen
JSON calls to avoid slow, high-token reasoning output.

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

## Web app

The frontend is a Next.js app in `apps/web`:

```bash
cd apps/web
npm run dev
```

Open `http://127.0.0.1:3000`. Frontend requests to `/api/backend/*` are proxied
to `http://127.0.0.1:8000/*` by default. Use `FORKFIT_API_BASE_URL` when the API
is on another port.

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
or raw user profiles. ForkFit disables LangGraph's automatic LangSmith tracing
around workflow execution, so enabled tracing only uploads the sanitized
`forkfit.workflow` summary run.
