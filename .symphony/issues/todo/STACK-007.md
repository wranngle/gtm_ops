---
id: STACK-007
priority: 2
labels: stack,ci,validators,evidence
blocked_by:
---
# Capture first green run of the new per-language CI jobs

`.github/workflows/knowledge-base.yml` was split into four jobs (validators, bun-tests, python-tests, elixir-tests) so each per-language test suite (`bun test` in `packages/agent-evals`, `pytest` in `apps/ops-console`, `mix test` in `tools/symphony-elixir`) runs in CI. The matrix has only ever been exercised locally; the GitHub Actions runners have not yet executed `oven-sh/setup-bun@v2`, `actions/setup-python@v5` with the ops-console pyproject editable install, or `erlef/setup-beam@v1` with `mix deps.get && mix test` against this repo.

Acceptance criteria:

- Open a no-op PR that flips a doc whitespace change.
- All four jobs go green on the first run, or the failures are root-caused and fixed (do not paper over with `|| true`).
- If `mix deps.get` or `pip install -e '.[dev]'` triggers a network egress hiccup on the runner, document the workaround in `docs/RELIABILITY.md`.
- Confirm `mise` is not required at runtime in CI — the workflow uses official setup-* actions, but `.mise.toml` should still match the pinned versions for local devboxes.
- Knowledge-base validator still passes once the workflow has run successfully.
