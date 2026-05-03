# Generated artifacts

Generated schemas, inventories, and reports live here so agents can reason about data shapes and architectural state without leaving the repo.

## Rules

- Generated files must say at the top how they were generated (script path + command + either a last-run timestamp or a stable generated-at policy).
- Do not edit generated files manually unless the file explicitly allows it (some generators produce a "manual annotations welcome above this line" fence; if so, follow it).
- Keep generated artifacts synthetic and public-safe; the generator must not pull from private operational repos.
- Regeneration must be deterministic given the same source. If a generator is non-deterministic (timestamps, ordering), normalize before write.

## Generated artifacts

| Artifact | Source | Generator | Trigger |
| --- | --- | --- | --- |
| `layer-inventory.md` | `lib/<layer>/` walk | `scripts/generate-layer-inventory.sh` | `scripts/validate-knowledge-base.sh` via `--check`, plus manual refresh |
