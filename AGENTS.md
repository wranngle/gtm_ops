# Agent Operating Map

This repo is designed for agent-first development. Humans steer with intent, constraints, and acceptance criteria. Agents execute changes, update the repository knowledge base, and verify their work locally before opening or updating PRs.

Keep this file short. It is a table of contents, not the system manual. The source of truth lives in versioned docs and executable checks.

## Start Here

1. Read [README.md](README.md) for the public project frame.
2. Read [docs/index.md](docs/index.md) for the full knowledge-base index.
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing code layout, package boundaries, or dependency direction.
4. Read [WORKFLOW.md](WORKFLOW.md) and [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md) before using the Symphony task runner.
5. Read [docs/PLANS.md](docs/PLANS.md) before starting non-trivial work, then check [docs/exec-plans/active](docs/exec-plans/active/) for live work.
6. Read [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md), [docs/RELIABILITY.md](docs/RELIABILITY.md), and [docs/SECURITY.md](docs/SECURITY.md) before claiming a task is done.

## Source Authority

When this repo's derivative docs disagree with the original OpenAI material, the original wins. Both are checked in:

- [docs/references/openai_harness_engineering_original_spec.txt](docs/references/openai_harness_engineering_original_spec.txt) — Harness Engineering post.
- [docs/references/openai_symphony_original_spec.txt](docs/references/openai_symphony_original_spec.txt) — Symphony SPEC.md.
- [docs/references/openai_symphony_github.txt](docs/references/openai_symphony_github.txt) — Symphony repo + announcement.
- [docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt](docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt) — diagrams + read.
- Four `OAI_Harness_engineering_*.png` and two `*-Symphony*.png` diagrams in `docs/references/`.

## Core Rules

- Repository-local knowledge wins. If a decision is not encoded here, assume future agents cannot see it.
- Use progressive disclosure. Add pointers and indexes instead of making one giant instruction blob.
- Prefer boring, inspectable technologies that agents can reason about from files in this repo.
- Parse and validate data at boundaries. Do not build on guessed JSON shapes.
- Keep public artifacts synthetic. Source material from private operational repos stays private; nothing copied verbatim.
- Encode taste as docs first, then as mechanical checks when the pattern recurs.
- Update docs in the same PR as behavior changes when the docs would otherwise become false.

## Validation

Run:

```bash
scripts/validate-knowledge-base.sh
scripts/lint-layered-architecture.sh
scripts/gardener.sh
scripts/symphony.sh validate
scripts/symphony.sh once --dry-run --limit 1
```

Future runnable surfaces should add their own checks here as they land:

```bash
bun test
pytest
```

## Repo Map

- [ARCHITECTURE.md](ARCHITECTURE.md): domains, layers, boundaries.
- [docs/design-docs](docs/design-docs/): agent-first beliefs and design history (each doc carries status + last-reviewed date).
- [docs/exec-plans](docs/exec-plans/): active plans, completed plans, [tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md).
- [docs/product-specs](docs/product-specs/): user-facing and operator-facing specs.
- [docs/references](docs/references/): source material and stack contracts encoded for agents.
- [docs/references/canonical-stack.md](docs/references/canonical-stack.md): canonical-stack vs showcase-project separation.
- [docs/references/layered-domain-architecture.md](docs/references/layered-domain-architecture.md): per-domain import-direction rule, enforced by `scripts/lint-layered-architecture.sh`.
- [docs/references/doc-gardener.md](docs/references/doc-gardener.md): contract for the recurring docs-staleness scan.
- [docs/references/local-observability.md](docs/references/local-observability.md): LogsQL/PromQL/TraceQL query cookbook for `tools/observability/`.
- [docs/references/edge-devtools-mcp.md](docs/references/edge-devtools-mcp.md): contract for agent-driven UI validation via Edge MCP.
- [WORKFLOW.md](WORKFLOW.md): Symphony orchestration policy (nested-YAML schema).
- [.symphony/issues](.symphony/issues/): local Markdown task tracker.
- [docs/generated](docs/generated/): generated schemas and reports (currently empty; see `docs/generated/README.md`).
- [apps/ops-console](apps/ops-console/): Python-first internal operator UI.
- [packages/agent-evals](packages/agent-evals/): showcase eval harness with layered architecture, synthetic fixtures, and runnable tests.
