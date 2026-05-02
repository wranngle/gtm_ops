---
id: STACK-076
priority: 2
labels: stack,harness,review-loop,pr-shepherding
blocked_by: STACK-007
---
# Implement PR review and merge shepherding workflow

The Harness Engineering post describes a loop where Codex opens a pull
request, reviews its own changes locally, requests additional agent reviews,
responds to agent and human feedback, watches build failures, and merges once
the change is ready. The Symphony article adds the last-mile behavior: watching
CI, rebasing, resolving conflicts, retrying flakes, and shepherding work through
`Merging` without human babysitting.

This repo has local validation, CI, and a Symphony task queue, but the PR
workflow is still explicitly absent (`docs/design-docs/symphony-layer.md` says
"No PR creation yet"; TD-008 tracks review loop debt but there is no active
STACK issue). That means the original e2e review/feedback/merge loop is not
implemented.

## Acceptance criteria

- `WORKFLOW.md` documents the PR lifecycle agents should follow after a
  code/doc change is ready: branch/commit, open PR, run local validators,
  self-review the diff, request configured agent review, respond to feedback,
  and move to the repo's handoff/merge state.
- A repo-local helper or skill wraps `gh` for the mechanical steps agents need:
  open/update PR, read review comments, fetch failed check logs, rebase on
  main, and retry documented flaky checks.
- The merge step is opt-in and policy-gated. By default the agent prepares the
  PR and records readiness; actual merge/auto-merge requires an explicit config
  flag or environment variable.
- CI failure handling is documented and tested against a fake or fixture-backed
  `gh` response so agents can practice "fetch logs -> fix -> rerun checks"
  without requiring live GitHub credentials.
- `docs/QUALITY_SCORE.md` and `docs/exec-plans/tech-debt-tracker.md` stop
  pointing only at TD-008 and instead point at this executable STACK issue.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 39-41
  and 195-210.
- `docs/references/openai_symphony_original_spec.txt` lines 76, 90, and 2830.
- `docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt`
  lines 519-561.

## Handoff notes

Implemented on 2026-05-02 by Worker K:

- Added `scripts/symphony-pr-shepherd.sh` with `gh` wrappers for PR open/update,
  review comments, check status, failed-log capture, rebase, documented reruns,
  readiness comments, and opt-in merge.
- Added `pr_shepherd.*` policy keys to `WORKFLOW.md`; merge is refused unless
  `SYMPHONY_ALLOW_PR_MERGE=1` is set for the merge command.
- Added fixture-backed smoke coverage in `tests/symphony-completion-helpers.sh`.
- Review packet: `.symphony/workspaces/STACK-076/review-packet/manifest.md`.

Remaining scope: true secondary agent review remains TD-008.
