# Agent Operating Map

This repo is designed for agent-first development. Humans steer with intent, constraints, and acceptance criteria. Agents execute changes, update the repository knowledge base, and verify their work locally before opening or updating PRs.

Keep this file short. It is a table of contents, not the system manual. The source of truth lives in versioned docs and executable checks.

## Start Here

1. Read [README.md](README.md) for the public project frame.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing code layout, package boundaries, or dependency direction.
3. Read [docs/PLANS.md](docs/PLANS.md) before starting non-trivial work.
4. Read [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md), [docs/RELIABILITY.md](docs/RELIABILITY.md), and [docs/SECURITY.md](docs/SECURITY.md) before claiming a task is done.
5. Read the active execution plan in [docs/exec-plans/active](docs/exec-plans/active/) if one exists.

## Core Rules

- Repository-local knowledge wins. If a decision is not encoded here, assume future agents cannot see it.
- Use progressive disclosure. Add pointers and indexes instead of making one giant instruction blob.
- Prefer boring, inspectable technologies that agents can reason about from files in this repo.
- Parse and validate data at boundaries. Do not build on guessed JSON shapes.
- Keep public artifacts synthetic. Existing private operational repos are source material only, never public history.
- Encode taste as docs first, then as mechanical checks when the pattern recurs.
- Update docs in the same PR as behavior changes when the docs would otherwise become false.

## Validation

Run:

```bash
scripts/validate-knowledge-base.sh
```

Future runnable surfaces should add their own checks here as they land:

```bash
bun test
pytest
```

## Repo Map

- [ARCHITECTURE.md](ARCHITECTURE.md): domains, layers, boundaries.
- [docs/design-docs](docs/design-docs/): agent-first beliefs and design history.
- [docs/exec-plans](docs/exec-plans/): active plans, completed plans, tech debt.
- [docs/product-specs](docs/product-specs/): user-facing and operator-facing specs.
- [docs/references](docs/references/): source material encoded for agents.
- [docs/generated](docs/generated/): generated schemas and reports.
- [apps/ops-console](apps/ops-console/): planned Python-first internal operator UI.
- [packages/agent-evals](packages/agent-evals/): planned ElevenLabs agent evaluation harness.
- [packages/data-reconciliation](packages/data-reconciliation/): planned Python/SQL usage and revenue reconciliation.

