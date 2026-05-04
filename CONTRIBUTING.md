# Contributing

This repo is the unified runtime for a voice-AI-led GTM motion. Contributions should preserve:

1. The product surface: `lib/`, `server.js`, `cli.js`, `apps/ops-console/`, `templates/`, `prompts/`.
2. The agent-legibility layer: short `AGENTS.md`, repo-local docs as the source of truth, mechanical lint checks, knowledge-base validation.

## Local Setup

```bash
git clone <repo-url>
cd <repo-dir>
bun install                                # or `npm install`
bash scripts/validate-knowledge-base.sh    # smoke check
```

## Running Tests

Before submitting changes, run the checks that exist for the surfaces you touched.

```bash
bash scripts/validate-knowledge-base.sh    # required-files + AGENTS.md size guard
bash scripts/lint-layered-architecture.sh  # forward-only import direction
bash scripts/gardener.sh                   # markdown staleness + broken links
bun run typecheck                          # tsc --noEmit
bun run test:run                           # vitest unit (~10s, 2,366 tests)
bun run test:console                       # Playwright UI suite (100+ tests)
bun run test:e2e                           # Playwright PDF / report suite
```

CI runs `static`, `unit`, and `console-e2e` jobs on every PR — see `.github/workflows/test.yml`. The doc gardener also runs as a non-blocking check via `.github/workflows/knowledge-base.yml`.

## Code Style

Keep the repo legible to future agents:

- Update docs in the same PR as behavior changes when the docs would otherwise become false.
- Keep `AGENTS.md` short; move detailed rules into `docs/`.
- Use synthetic fixtures only.
- Do not copy private repo history or live operational details.
- Parse data at boundaries instead of relying on guessed shapes.

## Filing a Pull Request

1. Create a branch from `main`.
2. Make the change.
3. Run validation.
4. Fill out the PR template with summary, change type, test notes, and related issue or plan.

## Asking Questions

Open an issue for bug reports or feature requests. Do not include secrets, live customer data, production webhook URLs, phone numbers, or private operational details in public issues.
