# ForkFit Agent Core

ForkFit is a small agent-core prototype for personalizing community meal packs.

The MVP implements three bounded agents:

- `UserAgent`: interprets an explicit user profile and reviews taste fit.
- `ConstraintAgent`: audits hard constraints from extracted constraints only.
- `AdapterAgent`: applies minimal changes to create a personalized fork.
- `ForkFitLangGraphWorkflow`: runs the actual LangGraph flow from input loading
  through final validation.

The design intentionally keeps frontend, backend, database, and recommendation
systems out of scope. The goal is to make the agent boundaries, review protocol,
and extension points concrete and testable.

Run tests:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

Run the demo:

```bash
PYTHONPATH=src python3 examples/run_demo.py
```

## Local API config

Copy `.env.example` to `.env` and set:

- `BAILIAN_API_KEY`
- `BAILIAN_MODEL`
- `BAILIAN_BASE_URL`

The current agent core is deterministic. These variables are reserved for the
future LLM-backed agent implementation.

Run a real Bailian smoke test:

```bash
python3 scripts/smoke_bailian.py
```
