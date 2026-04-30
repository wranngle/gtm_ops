# Contributing to wranngle-gtm-engine

This repo is a public-safe, agent-first flagship monorepo. Contributions should preserve both layers of the setup:

1. The primitive dotfiles hydration baseline: repository hygiene, issue templates, PR template, security policy, demo cassette, scripts, and Dependabot.
2. The Harness Engineering layer: short `AGENTS.md`, repo-local docs as the source of truth, execution plans, validation loops, and mechanical checks.

## Local Setup

To get your local environment set up, clone the repository and run the current validation:

    git clone https://github.com/wranngle/wranngle-gtm-engine.git
    cd wranngle-gtm-engine
    scripts/validate-knowledge-base.sh

## Running Tests

Before submitting changes, run the checks that exist for the surfaces you touched.

Current baseline:

    scripts/validate-knowledge-base.sh

Future runnable surfaces should add and document their own checks, such as:

    bun test
    pytest

## Code Style

Keep the repo legible to future agents:

- Update docs in the same PR as behavior changes when the docs would otherwise become false.
- Keep `AGENTS.md` short; move detailed rules into `docs/`.
- Use synthetic fixtures only.
- Do not copy private repo history or live operational details.
- Parse data at boundaries instead of relying on guessed shapes.

## Filing a Pull Request

1. Create a branch from `main`.
2. If the change is multi-file or architectural, create or update an execution plan under `docs/exec-plans/`.
3. Make the change.
4. Run validation.
5. Fill out the PR template with summary, change type, test notes, and related issue or plan.

## Asking Questions

Open an issue for bug reports or feature requests. Do not include secrets, live customer data, production webhook URLs, phone numbers, or private operational details in public issues.
