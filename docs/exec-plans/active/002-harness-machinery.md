# Execution Plan: Harness Machinery

Status: Active
Owner: wranngle
Created: 2026-04-30

## Goal

Move the repo from "harness scaffold" (table of contents + folder shape) to "harness machinery" (mechanically enforced rules + executable feedback loops), per the OpenAI Harness Engineering post and the Symphony spec.

The previous phase produced:

- a structured `docs/` tree
- an `AGENTS.md` table of contents under 120 lines
- a primitive knowledge-base validator
- a Symphony-shaped one-shot orchestration CLI

This plan addresses the pieces those phases left unfinished.

## In-Scope This Iteration

- `packages/agent-evals` populated as the first **real** layered domain (Types → Config → Repo → Providers → Service → Runtime → UI), TypeScript + Zod, with passing tests.
- `scripts/lint-layered-architecture.sh` — mechanical import-direction lint with remediation hints in error messages.
- `scripts/gardener.sh` — doc-staleness scan that a recurring gardener agent can invoke.
- `docs/references/layered-domain-architecture.md` — encoded rule, machine-checkable.
- `docs/references/doc-gardener.md` — gardener principle and contract.
- `validate-knowledge-base.sh` and `.github/workflows/knowledge-base.yml` extended to run the architecture lint.

## Deferred (Tracked in Tech Debt)

These pieces from the source material require multi-day infrastructure decisions and are explicitly deferred:

- Per-worktree app boot for `apps/ops-console` (TD-004).
- Chrome DevTools MCP wiring for agent-driven UI validation (TD-005).
- Per-worktree observability stack (Vector + Victoria Logs/Metrics/Traces) with LogQL/PromQL/TraceQL access (TD-002, expanded).
- ~~Recurring gardener agent~~ — wired as `.github/workflows/gardener.yml` running every Monday 09:17 UTC. Opens a tracking issue when findings exist.
- ~~Per-domain structural tests~~ — `packages/agent-evals/tests/structure.test.ts` enforces layer presence, index.ts surfaces, no-stray-files, and node:* IO discipline.
- Symphony spec fidelity: long-running daemon, nested YAML keys (`tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`), Codex app-server JSON-RPC protocol, state machine, reconciliation, retry queue, hooks, Liquid template engine, token accounting, snapshot interface (TD-007).
- Agent-to-agent review loop and PR shepherding (TD-008).

## Symphony Worktree Note

A Sonnet worker landed a GitHub Issues migration on a worktree branch `worktree-agent-a0f5c2fc8d56dd894` at `.claude/worktrees/agent-a0f5c2fc8d56dd894`. It is not merged. The migration is shape-correct for our current Symphony-shaped CLI but does not align with the Symphony spec's nested-YAML schema or daemon shape. It should be re-done as part of TD-007.

## Acceptance Criteria

- `packages/agent-evals` contains seven populated layers (`types`, `config`, `repo`, `providers`, `service`, `runtime`, `ui`) with at least one real source file per layer and at least one passing test.
- `scripts/lint-layered-architecture.sh` exits 0 against the new package and exits 1 against a synthetic violation, with a remediation message in the error output.
- `scripts/gardener.sh` runs successfully against current `docs/`. Findings, when present, are clearly bucketed as `info` (prose mentions of marker words) vs `warn` (broken intra-repo links) so a future gardener agent can triage. CI invokes the gardener as non-blocking.
- `scripts/validate-knowledge-base.sh` continues to pass and now also invokes the architecture lint.
- AGENTS.md remains ≤120 lines and links to the two new reference docs.

## Decision Log

- Chose `packages/agent-evals` (TypeScript + Zod) for the first real domain because `ARCHITECTURE.md` already names it as TypeScript and Zod is the canonical boundary-parsing library called out in the harness post.
- Chose Bash for the architecture lint to keep the validator stack self-contained and runnable in CI without a Node/Bun bootstrap. The lint approximates a real AST walk via grep over `import`/`export` statements; this is sufficient for current package size and can be replaced with `ts-morph` later if false-positives become an issue.
- Chose to land the gardener as a script (not a recurring agent) because there is not yet enough docs surface to garden continuously; the script is the contract a future scheduled agent will invoke.
