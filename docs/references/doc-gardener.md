# Doc gardener — contract

A weekly scheduled scan of the repo's markdown docs. Surfaces three classes
of staleness so they don't quietly accumulate:

1. **WIP markers** — checked-in `TODO`, `FIXME`, `TBD`, `XXX`, `HACK`,
   "coming soon", "placeholder", "come back", "fill in".
2. **Broken relative links** — `[text](relative/path)` where the path
   doesn't exist on disk.
3. **Missing contract** — this very file. If the gardener workflow runs
   and `docs/references/doc-gardener.md` is gone, that itself is a finding.

## How it runs

- **Workflow:** [`.github/workflows/gardener.yml`](../../.github/workflows/gardener.yml)
- **Trigger:** `cron: 17 9 * * 1` (Monday 09:17 UTC) and `workflow_dispatch`.
- **Script:** [`scripts/gardener.sh`](../../scripts/gardener.sh).
- **Output:** `findings.txt` (human-readable) + `events.jsonl`
  (one JSON record per finding) uploaded as a workflow artifact for 30 days.
- **Issue:** when the script exits non-zero (≥1 finding) the workflow
  opens a GitHub issue labelled `gardener` with the findings inline.

## What to do with a finding

Each finding is one of:

| kind | meaning | resolution |
| --- | --- | --- |
| `wip-marker` | `TODO`/`FIXME`/`TBD`/etc in a checked-in doc | resolve the work and remove the marker, OR move the marker into a tracked issue/PR description and replace the doc text with a permalink, OR delete the line if it has rotted |
| `broken-link` | a markdown `[text](path)` where `path` does not exist | repoint to the correct path, remove the link, or restore the missing file |
| `missing-contract` | this contract file is gone | restore it (you're reading it) |

## Run locally

```bash
bash scripts/gardener.sh
```

Exits 0 (clean), 1 (findings emitted to stdout), or 2 (script error).

## Excluded files

The WIP-marker pass excludes files that legitimately contain the marker
keywords as part of their normal content (this contract doc, the
self-audit log, the gardener script itself). Broken-link checks still
apply to those files.

## Why a recurring scan instead of a pre-commit hook

Most staleness compounds over time — a TODO that's months old is the
problem, not a TODO that just landed. A weekly cadence catches that
without slowing down day-to-day commits. The gardener is a guard
against decay, not a style enforcer.
