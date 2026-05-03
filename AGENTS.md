# Agent operating map

This repo is structured for agent-first development: humans steer with intent and acceptance criteria; agents execute changes, update repository knowledge, and verify their work locally before opening or updating PRs.

Keep this file short. It is a table of contents, not the manual.

## Start here

1. [`README.md`](README.md) — product frame
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — product layers; required reading before changing code layout, package boundaries, or dependency direction
3. [`DESIGN.md`](DESIGN.md) — brand system; required reading before any UI/PDF/email change
4. [`docs/index.md`](docs/index.md) — knowledge-base index
5. [`docs/references/layered-domain-architecture.md`](docs/references/layered-domain-architecture.md) — per-domain import direction rule, enforced by `scripts/lint-layered-architecture.sh`

## Core rules

- Repository-local knowledge is the system of record. If a decision is not encoded here, assume future agents cannot see it.
- Use progressive disclosure. Add pointers and indexes instead of one giant instruction blob.
- Prefer boring, inspectable technologies that agents can reason about from files in this repo.
- Parse and validate data at boundaries. Do not build on guessed JSON shapes.
- Keep public artifacts synthetic. Source material from private operational repos stays private; nothing copied verbatim.
- Encode taste as docs first, then as mechanical checks when the pattern recurs.
- Update docs in the same PR as behavior changes when the docs would otherwise become false.

## Validation

```bash
scripts/validate-knowledge-base.sh
scripts/lint-layered-architecture.sh
bun test
```

## Repo map

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — product layers, boundaries, repository surface
- [`DESIGN.md`](DESIGN.md) — brand system (long-form)
- [`tokens/`](tokens/) — machine-readable brand tokens (`tokens.css`, `tokens.json`, `tokens.tailwind.js`)
- [`apps/ops-console/`](apps/ops-console/) — operator UI (static + live modes)
- [`lib/`](lib/) — intake, enrichment, post-call, extraction, pdf, branding, audit, evaluation
- [`server.js`](server.js), [`cli.js`](cli.js) — runtime entrypoints
- [`workflows/`](workflows/) — sanitized n8n samples; full library at `wranngle/n8n`
- [`docs/references/`](docs/references/) — stack contracts encoded for agents
- [`scripts/`](scripts/) — lint and validation tooling
