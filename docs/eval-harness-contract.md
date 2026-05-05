# Eval Harness Contract

`gtm_ops` owns the app under test. `voice_ai_agent_evals` owns orchestration,
normalization, storage, and cross-run reporting.

## Boundary

`gtm_ops` provides:

- `eval-harness.manifest.json` with the validation and eval commands the harness
  may run.
- Playwright/Vitest/evaluation tests that know app semantics.
- Synthetic fixtures under `apps/ops-console/fixtures/` and `tests/fixtures/`.
- Generated artifacts such as Playwright reports, traces, videos, screenshots,
  and eval result JSON.

`voice_ai_agent_evals` provides:

- The `external-command` runner.
- The `gtm_ops` adapter that reads `eval-harness.manifest.json`.
- A normalized run result shape for command status, logs, artifacts, and
  dimensions.
- Cross-project reporting for CI and operator review.

## Commands

The manifest is the source of truth. Keep it aligned with `AGENTS.md` validation
gates and `package.json` scripts.

Each command may define `expected_output` assertions consumed by the harness.
Use negative assertions such as `stdout_not_contains` for CLIs that print
regression warnings while still exiting 0.

Run from this repo when the sibling harness checkout exists:

```bash
bun run eval:harness
```

Run from the harness repo:

```bash
bun run testing:gtm-ops --root ../gtm_ops
```

Use tags for targeted loops:

```bash
bun run testing:gtm-ops --root ../gtm_ops --tag ui
bun run testing:gtm-ops --root ../gtm_ops --tag unit
```

## UI Action Coverage

`tests/console-e2e/ui-action-coverage.spec.ts` complements the console smoke
tests. The smoke sweep catches controls that throw; action coverage catches
visible controls that click cleanly but produce no observable navigation, state
change, fetch, form value change, toast, or text change.

This is still an automated heuristic. When a control has business semantics
that a crawler cannot infer, pin it with a route/component spec beside the UI
code. Examples: `Review now` routes to Calls, eval run rows open detail panels,
settings forms retain accessible names.

## Artifact Policy

Artifacts named in the manifest must be safe to expose in a harness report.
Fixtures stay synthetic; private operational source data does not cross into
`voice_ai_agent_evals`.
