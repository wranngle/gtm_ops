# Doc Gardener

A recurring scan that keeps the repo's knowledge base from rotting into an "attractive nuisance" of stale rules and dangling links.

## Source

The Harness Engineering post (Lopopolo, 2026) describes a recurring "doc-gardening" agent that scans for stale or obsolete documentation and opens fix-up pull requests. This file documents the contract that agent should honor.

## Contract

`scripts/gardener.sh`:

- Reads the repo as it stands, modifies nothing.
- Scans these targets: `AGENTS.md`, `ARCHITECTURE.md`, `WORKFLOW.md`, `README.md`, `docs/`, `packages/`, `apps/`.
- Reports three classes of finding:
  - **Staleness markers** in prose: `TODO`, `TKTK`, `FIXME`, `XXX`, `placeholder`, `coming soon`, `TBD`.
  - **Broken intra-repo doc links**: any `](path/to/file.md)` whose target does not exist.
  - **Broken inline code paths**: any backtick-quoted repo-relative path-like span, such as `docs/foo.md` or `scripts/foo.sh`, whose target does not exist.
- Excludes from the marker scan:
  - `docs/exec-plans/active/` and `docs/exec-plans/completed/` — plans
    legitimately discuss markers and use words like "TODO" / "TBD" in scope
    notes; completed plans are historical artifacts that don't change.
  - `scripts/gardener.sh` and `docs/references/doc-gardener.md` — both
    document the marker patterns themselves.
  - `docs/references/openai_*.txt` and `docs/references/*.png` — read-only
    upstream source authority. They legitimately contain placeholder words
    and relative links pointing outside this repo. Do not edit them.
- Excludes fenced code blocks from the inline code-path scan so shell examples,
  YAML snippets, and intentionally missing negative cases do not become
  path-drift findings.
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
- The inline code-path check intentionally uses a conservative heuristic: the span must contain `/`, start with a known repo root such as `docs/`, `packages/`, `apps/`, `scripts/`, `tools/`, `demo/`, `.github/`, or `.symphony/`, and either end in a known repo-file suffix or match a command/package/state-directory shape the repo owns.

## Wiring

The gardener is invoked three ways:

1. **Locally** — `scripts/gardener.sh` from repo root.
2. **On every PR/push** — `.github/workflows/knowledge-base.yml` runs it non-blocking so reviewers see findings inline.
3. **Recurring** — `.github/workflows/gardener.yml` runs every Monday 09:17 UTC. When findings exist, it opens a tracking issue labelled `gardener` and uploads `findings.txt` + `events.jsonl` as a 30-day artifact.

A future agent should pick up the gardener-labelled issues and open fix-up PRs per the contract above.
