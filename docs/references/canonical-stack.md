# Canonical Stack vs Showcase Project

The directory holds two intermixed things; this doc separates them.

## Canonical stack artifacts

These should stay project-agnostic. Future repos should be able to lift them
wholesale via `~/.dotfiles/.dotfiles.sh` and have a working agent-first
harness with a Symphony orchestration layer.

- `AGENTS.md`, `ARCHITECTURE.md`, `WORKFLOW.md`
- `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/PLANS.md`, `docs/PRODUCT_SENSE.md`,
  `docs/QUALITY_SCORE.md`, `docs/RELIABILITY.md`, `docs/SECURITY.md`
- `docs/design-docs/`, `docs/exec-plans/`, `docs/product-specs/`,
  `docs/references/`, `docs/generated/`
- `docs/ORCHESTRATION.md`, `~/.dotfiles/lib/symphony-elixir/docs/references/symphony-*.md`,
  `docs/references/harness-engineering.md`,
  `docs/references/dotfiles-hydration.md`,
  `docs/references/layered-domain-architecture.md`,
  `docs/references/doc-gardener.md`, `docs/references/canonical-stack.md`
- `scripts/symphony.sh` — Bash one-shot adapter (legacy parity with
  `~/.dotfiles/lib/symphony-elixir/` (via `bin/symphony` shim))
- `scripts/bin/llm.sh` — provider fallback chain
- `scripts/lint-layered-architecture.sh`, `scripts/gardener.sh`,
  `scripts/hero.sh`, `scripts/validate-knowledge-base.sh`
- `~/.dotfiles/lib/symphony-elixir/` (via `bin/symphony` shim) — spec-faithful daemon
- `tools/edge-mcp/` — Edge DevTools MCP launcher + shortcut installer
- `tools/observability/` — Vector + Victoria stack
- `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/dependabot.yml`, `.github/workflows/knowledge-base.yml`,
  `.github/workflows/gardener.yml`
- `.symphony/` skeleton (empty state directories + .gitkeep files)
- `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `README.md`, `demo/cassette.tape`

### Discipline

Stack-level files must not contain:

- `wranngle-gtm-engine`-specific paths or identifiers (the repo name is fine
  in URLs and config; it's not fine baked into validator regex or script
  defaults beyond what `git remote get-url origin` would yield)
- `ElevenLabs`, `Wranngle GTM Engine`, or any ElevenLabs-domain identifiers
- Project-only fixtures or test data

The validator (`scripts/validate-knowledge-base.sh`) is allowed to know that
`packages/agent-evals` and `apps/ops-console` exist (they're the showcase
demonstrating the stack) but should not require their *contents* to match
ElevenLabs-specific shapes.

## Showcase project artifacts

These are project-specific demonstrations. They prove the stack works on a
real domain (ElevenLabs Conversational AI evaluation + GTM ops). When the
stack is extracted to dotfiles, these stay in the project repo.

- `packages/agent-evals/` — TypeScript voice-agent eval contract package
- `apps/ops-console/` — Streamlit operator UI
- `fixtures/`, `workflows/` (planned per ARCHITECTURE.md)
- `docs/exec-plans/active/001-build-flagship-monorepo.md` — the project plan
- `docs/product-specs/flagship-gtm-engine.md` — project spec
- `.symphony/issues/**/WGTE-001.md` — project task

## Working model (per owner directive 2026-04-30)

> The harness/symphony machinery comes first to enable proper development of
> the actual project. Avoid polluting the harness/symphony stack with the
> project-specific. In the end the dotfiles/harness/symphony stack must be
> canonical. If you wrap all that up then and only then can you begin the
> showcase project, which will mean repairing the stack along the way to
> make it truly working and universal.

So:

1. Finish hydrating the canonical stack (TD-007 Elixir daemon, TD-005 Edge
   MCP, TD-002 full local observability) — `docs/exec-plans/active/003-stack-canonicalization.md`.
2. Then return to the showcase project, expecting to surface stack gaps and
   repair them inline.
3. Eventually: extract the canonical stack into `~/.dotfiles/` (or a separate
   repo) and bootstrap from there.
