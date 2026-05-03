# ops-console

Internal operator UI for GTM Ops. Built in Streamlit per `ARCHITECTURE.md`'s "prefer Streamlit unless FastAPI+Jinja2 is clearly more appropriate" rule.

This is the first runnable surface inside the harness. It reads evaluation results produced by `packages/agent-evals` and presents them to a human operator. It also includes a compact observability page for the local VictoriaLogs, VictoriaMetrics, and VictoriaTraces stack.

## Run

For agent-driven worktree validation, use the repo-local boot helper from the
repository root:

```bash
tools/ops-console/ops-console.sh start
tools/ops-console/ops-console.sh status
tools/ops-console/ops-console.sh url
tools/ops-console/ops-console.sh stop
```

It allocates a port from `OPS_CONSOLE_PORT_RANGE` (default `8501-8599`),
writes `.symphony/runtime/ops-console.json`, and records the log path for
cleanup and troubleshooting. Set `OPS_CONSOLE_PYTHON` to a venv interpreter
when Streamlit is not installed in system Python.

Manual Streamlit launch still works:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
streamlit run main.py -- fixtures/evaluation-results.json
```

The path argument after `--` is the JSON file containing an `EvaluationResult[]` (the same shape produced by `packages/agent-evals` runtime). A synthetic fixture is checked in at `fixtures/evaluation-results.json` so the page renders with no upstream wiring.

The `Observability` page queries localhost endpoints documented in `../../docs/references/local-observability.md`. If the stack is down, the page renders offline notices instead of crashing.

## Test

```bash
pip install -e ".[dev]"
pytest
tools/ops-console/smoke.sh
```

Tests run against pure parsing/aggregation and observability-client code and require no Streamlit runtime or live HTTP services.
The smoke starts two temporary Streamlit instances in parallel and requires the
Streamlit dependency to be installed locally.

## Shape

```
main.py          Streamlit entry point. Imports streamlit at module load.
domain.py        Pure parsing/aggregation. No streamlit import; testable headlessly.
observability_client.py
                 Pure stdlib HTTP client for LogsQL, PromQL, and Jaeger-style trace queries.
pages/           Streamlit pages, including compact observability panels.
fixtures/        Synthetic JSON results so the page works offline.
tests/           pytest tests for pure app logic.
```

## Why this is a stub

It does the smallest thing that proves the harness can render real data: parse one JSON file, summarize it, list the failing rules. Real wiring (subprocess to agent-evals, fixture pickers, screenshot tests) lands once Chrome DevTools MCP integration ships (TD-005).
