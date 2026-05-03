# Repository knowledge base

Product runtime documentation. The system of record is here, in this repo — if a decision is not encoded here, future agents cannot see it.

## Top-level

- [`README.md`](../README.md) — product frame and how to run it
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — product layers (intake → enrichment → voice → post-call → presales → ops-console)
- [`DESIGN.md`](../DESIGN.md) — brand system (long-form, mirrored from `~/.dotfiles/DESIGN.md`)
- [`AGENTS.md`](../AGENTS.md) — agent operating map

## Subdirectories

- [`generated/`](generated/README.md) — generated schemas, reports, inventories
- [`product-specs/`](product-specs/index.md) — product and operator specs
- [`references/`](references/README.md) — stack contracts encoded for agents

## References

- [`references/layered-domain-architecture.md`](references/layered-domain-architecture.md) — per-domain import-direction rule, enforced by `scripts/lint-layered-architecture.sh`
