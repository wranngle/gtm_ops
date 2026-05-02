# Generated Artifacts

Generated schemas, inventories, and reports live here. The Harness Engineering
post calls out `db-schema.md` as the canonical example: a markdown render of the
real DB schema so an agent can reason about data shapes without leaving the
repo.

One generator exists end-to-end: the quality-score history generator (STACK-001).
See `quality-score-history.md` below.

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

## Generated artifacts

| Artifact | Source | Generator | Trigger |
| --- | --- | --- | --- |
| `quality-score-history.md` | `git log -- docs/QUALITY_SCORE.md` | `scripts/generate-quality-score-history.sh` | manual (pre-commit hook pending, STACK-001) |
| `db-schema.md` | the warehouse layer once it exists | `scripts/generate-db-schema.sh` (planned) | pre-commit + nightly |
| `layer-inventory.md` | `packages/*/src/<layer>/` walk | `scripts/generate-layer-inventory.sh` (planned) | weekly cron + on lint failure |
| `symphony-state-snapshot.md` | running daemon's snapshot API | the daemon itself, on shutdown | manual + per-tick if useful |

See STACK-003 for the broader generated-artifacts pipeline.
