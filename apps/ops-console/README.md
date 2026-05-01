# ops-console

Internal operator UI for the Wranngle GTM engine. Built in Streamlit per `ARCHITECTURE.md`'s "prefer Streamlit unless FastAPI+Jinja2 is clearly more appropriate" rule.

This is the first runnable surface inside the harness. It reads evaluation results produced by `packages/agent-evals` and presents them to a human operator.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
streamlit run main.py -- fixtures/evaluation-results.json
```

The path argument after `--` is the JSON file containing an `EvaluationResult[]` (the same shape produced by `packages/agent-evals` runtime). A synthetic fixture is checked in at `fixtures/evaluation-results.json` so the page renders with no upstream wiring.

## Test

```bash
pip install -e ".[dev]"
pytest
```

Tests run against the pure parsing/aggregation in `domain.py` and require no Streamlit runtime.

## Shape

```
main.py          Streamlit entry point. Imports streamlit at module load.
domain.py        Pure parsing/aggregation. No streamlit import; testable headlessly.
fixtures/        Synthetic JSON results so the page works offline.
tests/           pytest tests for domain.py.
```

## Why this is a stub

It does the smallest thing that proves the harness can render real data: parse one JSON file, summarize it, list the failing rules. Real wiring (subprocess to agent-evals, fixture pickers, screenshot tests) lands once Chrome DevTools MCP integration ships (TD-005).
