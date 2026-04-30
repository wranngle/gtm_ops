# Doc Gardener

A recurring scan that keeps the repo's knowledge base from rotting into an "attractive nuisance" of stale rules and dangling links.

## Source

The Harness Engineering post (Lopopolo, 2026) describes a recurring "doc-gardening" agent that scans for stale or obsolete documentation and opens fix-up pull requests. This file documents the contract that agent should honor.

## Contract

`scripts/gardener.sh`:

- Reads the repo as it stands, modifies nothing.
- Scans these targets: `AGENTS.md`, `ARCHITECTURE.md`, `WORKFLOW.md`, `README.md`, `docs/`, `packages/`, `apps/`.
- Reports two classes of finding:
  - **Staleness markers** in prose: `TODO`, `TKTK`, `FIXME`, `XXX`, `placeholder`, `coming soon`, `TBD`.
  - **Broken intra-repo doc links**: any `](path/to/file.md)` whose target does not exist.
- Excludes `docs/exec-plans/active/`, `scripts/gardener.sh`, and `docs/references/doc-gardener.md` from the marker scan because those files legitimately reference the markers.
- Emits ECS-jsonl events on stderr (`gardener.start`, `gardener.findings`, `gardener.clean`).
- Exits 0 when clean, 1 when findings exist, 2 on invocation error.

## How a recurring agent should use it

1. Run `scripts/gardener.sh` from the repo root.
2. If exit code is 0, log the clean run and stop.
3. If exit code is 1, group findings by file and open one fix-up PR per file (or one PR per scan run if findings are sparse) that:
   - Resolves the staleness markers if the underlying work has shipped.
   - Repoints or removes broken links.
   - Opens a follow-up exec-plan if the marker still represents real outstanding work.
4. Never mass-edit; each fix-up should be small and reviewable.

## What the gardener should NOT do

- Delete content it does not understand. A `TODO` in a fixture file may be intentional.
- Rewrite reference docs based on its own opinions. The gardener resolves staleness; product/architectural decisions stay with humans.
- Modify generated artifacts (`docs/generated/`). Those are owned by their generators.

## Failure modes to watch

- The marker regex is intentionally broad. False-positives are expected; the gardener agent's first job is to triage.
- The broken-link check uses `realpath -m` and only catches Markdown links that resolve to absolute filesystem paths. URL anchors (`#section`), relative links to non-Markdown files, and external URLs are out of scope.

## Wiring

The gardener is invoked three ways:

1. **Locally** — `scripts/gardener.sh` from repo root.
2. **On every PR/push** — `.github/workflows/knowledge-base.yml` runs it non-blocking so reviewers see findings inline.
3. **Recurring** — `.github/workflows/gardener.yml` runs every Monday 09:17 UTC. When findings exist, it opens a tracking issue labelled `gardener` and uploads `findings.txt` + `events.jsonl` as a 30-day artifact.

A future agent should pick up the gardener-labelled issues and open fix-up PRs per the contract above.
