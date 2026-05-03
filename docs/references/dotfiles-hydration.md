# Dotfiles Hydration Reference

Status: Active
Source: `/home/wranngle/.dotfiles/.dotfiles.sh`
Last reviewed: 2026-05-01

This repo started with the primitive dotfiles hydration baseline before any product code landed.

## Baseline Artifacts

- `LICENSE`
- `.gitignore`
- `.mise.toml` (toolchain pins for the whole stack)
- `.github/dependabot.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/knowledge-base.yml`
- `.github/workflows/gardener.yml`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.agents/AGENTS.md`
- `scripts/bin/llm.sh`
- `scripts/hero.sh`
- `demo/cassette.tape`

## Integration Contract

The dotfiles baseline owns repository hygiene. The Harness Engineering layer owns the agent-first operating model. They should reinforce each other:

- `AGENTS.md` is the root agent map.
- `.agents/AGENTS.md` preserves dotfiles-level imperatives and points to root `AGENTS.md`.
- `CONTRIBUTING.md` points contributors at the knowledge-base validator.
- `SECURITY.md` and `docs/SECURITY.md` agree that public artifacts are synthetic and clean-room.
- `demo/cassette.tape` demonstrates the real local validation loop (`scripts/validate-knowledge-base.sh`, `scripts/symphony.sh once --dry-run --limit 1`, `scripts/symphony.sh list`); it must stay concrete.
- `scripts/validate-knowledge-base.sh` checks that both layers remain present.
- `scripts/symphony.sh` uses `scripts/bin/llm.sh` as its default codex-independent `agent.command`. The Symphony spec defines `codex.command` (default `codex app-server`); this repo aliases both to the multi-provider chain until a real Codex app-server adapter lands.
- The `.github/ISSUE_TEMPLATE/*.yml` forms apply `symphony:todo` plus `priority:N` labels so the github_issues adapter (`~/.dotfiles/lib/symphony-elixir/docs/references/symphony-github-issues-adapter.md`) can pick up issues filed by humans, Codex, Gemini, or Claude with no extra triage step.
- Dependabot watches every ecosystem in this repo: github-actions, npm (`packages/agent-evals`), pip (`apps/ops-console`), mix (symphony lives in `~/.dotfiles/lib/symphony-elixir/` now; this repo consumes via `bin/symphony` shim), docker (`tools/observability`).
- CI (`.github/workflows/knowledge-base.yml`) runs the validators plus per-language test jobs (`bun test`, `pytest`, `mix test`); Edge MCP smoke tests stay local because GitHub runners cannot drive a desktop browser.

## LLM Fallback Chain

`scripts/bin/llm.sh` is the primitive `agent.command` used when a Codex app-server is unavailable. Default chain order:

1. `gemini:gemini-3.1-pro-preview` (highest-capability frontier)
2. `claude:claude-opus-4-7` then `claude:opus` alias (Claude Opus 4.7 with 1M context, fall back to current opus alias)
3. `codex:o3-mini` (OpenAI codex CLI subset)
4. Mid-tier Gemini (`gemini-3-pro-preview`, `gemini-pro-latest`)
5. `claude:claude-sonnet-4-6` then `claude:sonnet` alias
6. Flash-class Gemini (`gemini-3-flash-preview`, `gemini-3.1-flash-lite-preview`)
7. `claude:claude-haiku-4-5` then `claude:haiku` alias
8. Final flash / open-weights tail (`gemini-flash-latest`, `gemini-2.5-flash`, `gemma-3-27b-it`)

Quota / rate-limit detection (`isQuotaOrRateLimitError`) handles `429`, `quota`, `rate limit`, `resource_exhausted`, `503`, `504`, `overloaded`, `capacity`. Up to 3 retries per model with exponential backoff (30s -> 60s -> 120s) before advancing to the next chain entry. Per-attempt forensics are written to `$(dirname "$DOTFILES_LOG_FILE")/attempts/<run-id>-<provider>-<model>-attempt<N>.{stdout,stderr}` whenever `DOTFILES_LOG_FILE` is set.

Override the chain or timeout per-call:

```bash
LLM_CHAIN=claude:haiku LLM_TIMEOUT=30 scripts/bin/llm.sh "say hello"
```

## Rehydration Rule

If `.dotfiles.sh` is rerun, inspect the diff before committing. Generated files must not reintroduce fake URLs, fake maintainer emails, or generic text that contradicts the clean-room public-safety model. Re-run `scripts/validate-knowledge-base.sh` after rehydration; its synthetic-content scan is the safety net.
