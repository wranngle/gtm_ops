# ops-console

> **Note:** this is the Python (Streamlit) placeholder implementation. The runtime ops-console is being replaced with a vanilla HTML/JS surface extended from the proposal-generator UI; both modes (live `server.js` backend, fixture-driven `DEMO_MODE`) will share that codebase. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for the target shape.

Internal operator UI. Reads evaluation results from `voice_ai_agent_evals` runtime output and presents them to a human operator.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
streamlit run main.py -- fixtures/evaluation-results.json
```

The path argument after `--` is the JSON file containing an `EvaluationResult[]`. A synthetic fixture is checked in at `fixtures/evaluation-results.json` so the page renders with no upstream wiring.

## Test

```bash
pip install -e ".[dev]"
pytest
```

Tests run against pure parsing/aggregation code and require no Streamlit runtime.

## Shape

```
main.py          Streamlit entry point. Imports streamlit at module load.
domain.py        Pure parsing/aggregation. No streamlit import; testable headlessly.
observability_client.py
                 Pure stdlib HTTP client for log/metric/trace queries.
pages/           Streamlit pages.
fixtures/        Synthetic JSON results so the page works offline.
tests/           pytest tests for pure app logic.
```
