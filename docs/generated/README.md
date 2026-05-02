# Generated Artifacts

Generated schemas, inventories, and reports live here. The Harness Engineering
post calls out `db-schema.md` as the canonical example: a markdown render of the
real DB schema so an agent can reason about data shapes without leaving the
repo.

This directory is currently empty (no DB or other schema source exists yet to
generate from). Tracked as STACK-003 in `.symphony/issues/todo/`.

## Rules

- Generated files must say at the top how they were generated (script path +
  command + last-run timestamp).
- Do not edit generated files manually unless the file explicitly allows it
  (some generators produce a "manual annotations welcome above this line"
  fence; if so, follow it).
- Keep generated artifacts synthetic and public-safe; the generator must not
  pull from private operational repos.
- Regeneration must be deterministic given the same source. If a generator
  is non-deterministic (timestamps, ordering), normalize before write.

## What to generate (as runnable surfaces land)

| Artifact | Source | Generator (planned) | Trigger |
| --- | --- | --- | --- |
| `db-schema.md` | the warehouse layer once it exists | `scripts/generate-db-schema.sh` (TODO) | pre-commit + nightly |
| `layer-inventory.md` | `packages/*/src/<layer>/` walk | `scripts/generate-layer-inventory.sh` (TODO) | weekly cron + on lint failure |
| `symphony-state-snapshot.md` | running daemon's snapshot API | the daemon itself, on shutdown | manual + per-tick if useful |

Until at least one generator exists end-to-end, this directory is documentation
only. See STACK-003.

