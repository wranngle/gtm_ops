# Agent-First GTM Engine Harness

A clean-room flagship monorepo for voice-agent evals, GTM automation, internal ops tooling, and Python/SQL revenue reconciliation.

## What it does

This repo coordinates the moving parts of an AI-first GTM and operations workflow: synthetic lead intake, enrichment, CRM-style routing, voice-agent evaluation, webhook validation, post-call processing, internal operator review, and usage/revenue reconciliation.

This repo starts from a clean public-safe baseline. Existing private operational repos are source material only; public code and fixtures here should be sanitized, synthetic, and reviewable from the first commit.

The repository is also built as an agent-first engineering harness: humans steer, agents execute, and repo-local knowledge is the system of record. See [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [docs/index.md](docs/index.md).

This is a greenfield project. Interfaces and internals are still settling; expect breaking changes.

## Usage

Setup and usage docs will land here once the first runnable surface is in place. Until then, the source tree is the source of truth.

Current validation:

```bash
scripts/validate-knowledge-base.sh
scripts/symphony.sh validate
scripts/symphony.sh list
scripts/symphony.sh once --dry-run
tests/symphony-completion-helpers.sh
```

## Maintenance

This repository is autonomously maintained and deployed via an automated, dogfooded dotfiles framework. Routine updates, dependency bumps, and housekeeping commits may be authored by scheduled agents rather than a human. Substantive changes still go through review.

## License

See [LICENSE](./LICENSE).
