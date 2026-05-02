---
id: STACK-003
priority: 3
labels: stack,knowledge-base,generated
blocked_by:
---
# Land at least one real generator under docs/generated/

`docs/generated/` is documented as the home for "generated schemas, reports,
and inventories" but contains no actual generated files. The Harness post's
example layout calls out `db-schema.md` as the canonical artifact.

Without a working generator the directory is decoration; a future agent can
neither validate the regeneration story nor copy the pattern.

## Acceptance criteria

- One generator script (suggested first: `scripts/generate-layer-inventory.sh`)
  walks `packages/*/src/<layer>/` and writes `docs/generated/layer-inventory.md`
  with:
  - per-package layer presence + file counts
  - the lint contract version it targets
  - generation timestamp + script invocation
- The generated file declares (at the top) how it was generated and refuses
  edits below the fence.
- `scripts/validate-knowledge-base.sh` runs the generator in `--check` mode
  (writes to a tempfile, diffs against the committed copy, fails if drift).
- Re-running the generator is idempotent.
- Once an actual DB lands (data-reconciliation), repeat the pattern for
  `db-schema.md`.

## Why deferred

Choosing the right inventory shape is a small design decision worth thinking
through. Doing it correctly inside an audit pass that cannot land code beyond
its domain is the wrong scope.
