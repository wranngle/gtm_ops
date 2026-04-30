# Dotfiles Hydration Reference

Status: Active
Source: `/home/wranngle/.dotfiles/.dotfiles.sh`
Last reviewed: 2026-04-30

This repo started with the primitive dotfiles hydration baseline before any product code landed.

## Baseline Artifacts

- `LICENSE`
- `.gitignore`
- `.github/dependabot.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
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
- `demo/cassette.tape` should demonstrate a real local validation command, not a placeholder.
- `scripts/validate-knowledge-base.sh` checks that both layers remain present.
- `scripts/symphony.sh` uses `scripts/bin/llm.sh` as its default codex-independent agent command.

## Rehydration Rule

If `.dotfiles.sh` is rerun, inspect the diff before committing. Generated files must not reintroduce placeholder URLs, placeholder maintainer emails, or generic text that contradicts the clean-room public-safety model.
