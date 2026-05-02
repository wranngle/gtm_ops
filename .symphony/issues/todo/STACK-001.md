---
id: STACK-001
priority: 2
labels: stack,knowledge-base,quality
blocked_by:
---
# Add quality-score history tracking

`docs/QUALITY_SCORE.md` is currently a snapshot — every grade change overwrites
the previous one and there is no record of "tracking gaps over time," which the
Harness Engineering post calls out explicitly:

> A quality document grades each product domain and architectural layer,
> tracking gaps over time.

## Acceptance criteria

- A history mechanism exists that records each grade change with the date the
  change took effect. Two reasonable shapes:
  1. Per-row trailing column (`History`) with terse `B 2026-04-30 → C 2026-05-15`
     entries, manually maintained.
  2. A separate `docs/generated/quality-score-history.md` produced by a small
     script that diffs successive `git log` versions of `QUALITY_SCORE.md` and
     emits one row per grade change. This is the more durable shape because
     it cannot drift from the file's actual state.
- Whichever shape is chosen, `docs/QUALITY_SCORE.md` must be human-readable at
  the top (the current grade snapshot) without scrolling through history.
- Update validator to ensure the history surface is present when the rubric
  changes.

## Why this is deferred

Doing this well needs a small generator-on-commit pattern that the repo does
not yet have anywhere else. Better to land the generator pattern (STACK-003)
first and reuse it here.
