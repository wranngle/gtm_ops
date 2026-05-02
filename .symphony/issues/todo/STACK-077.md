---
id: STACK-077
priority: 2
labels: stack,harness,proof-of-work,ui-validation
blocked_by: STACK-079
---
# Capture proof-of-work walkthrough artifacts at handoff

The original Harness Engineering loop says an agent should record evidence of
the failure and the resolution. The Symphony demo and diagram notes also make a
review packet part of the workflow: agents present proof of work, including a
video walkthrough of the working feature, before humans accept the change.

The current repo has Edge MCP screenshot/snapshot smoke coverage and
`WORKFLOW.md` allows "a review packet in the issue workspace", but there is no
required packet shape, no before/after artifact convention, and no walkthrough
capture path for UI work. Screenshot smoke alone does not satisfy the original
proof-of-work loop.

## Acceptance criteria

- Define a review-packet directory convention under each issue workspace, for
  example `.symphony/workspaces/<issue>/review-packet/`, with a manifest that
  records commands run, validator results, target URL, and artifact paths.
- Add a capture helper for UI tasks that can drive the configured browser target
  and save before/after screenshots plus a short walkthrough artifact
  (video, GIF, or equivalent inspectable recording) when a UI path is supplied.
- Non-UI tasks get a text-only packet with validator output and changed-file
  summary; UI tasks must include the browser artifacts before handoff.
- `WORKFLOW.md` tells agents to include the packet path in the final issue
  comment or handoff note. Tracker adapters that support comments should link
  the packet or attach the artifact according to their documented capability.
- A smoke fixture proves the packet generator creates a manifest and at least
  one visual artifact without requiring live credentials.

## References

- `docs/references/openai_harness_engineering_original_spec.txt` lines 204-207.
- `docs/references/openai_symphony_github.txt` lines 53-55.
- `docs/references/openai_symphony_original_spec.txt` lines 74 and 2823-2830.
- `docs/references/openai_symphony_harness_engineering_stack_diagrams_explained.txt`
  lines 512-552.

