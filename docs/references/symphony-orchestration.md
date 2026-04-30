# Symphony Orchestration Reference

Status: Active
Sources:

- OpenAI article: https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI repository: https://github.com/openai/symphony
- Symphony spec: https://github.com/openai/symphony/blob/main/SPEC.md

## What This Repo Adopts

Symphony reframes agent work around tasks instead of interactive sessions. The important transfer for this repo is:

- The task tracker is the control plane.
- Each active task gets an isolated workspace.
- `WORKFLOW.md` is the repo-owned policy contract.
- The orchestrator is a scheduler/runner and tracker reader.
- Ticket writes, PR links, comments, and handoff behavior belong in the workflow prompt and agent tools.
- Structured logs are the minimum observability surface.
- Successful work can end at a handoff state such as `human_review`, not necessarily `done`.

## Local Adaptation

This repo intentionally does not start with Linear or Codex App Server as hard dependencies. The first implementation is:

- `WORKFLOW.md`: policy and runtime contract.
- `.symphony/issues/<state>/*.md`: local Markdown task tracker.
- `.symphony/workspaces/<issue>`: deterministic per-issue workspaces.
- `.symphony/logs/symphony.jsonl`: ignored structured runtime log.
- `scripts/symphony.sh`: Bash scheduler/runner.
- `scripts/bin/llm.sh`: codex-independent agent command/fallback chain.

This keeps the orchestration pattern runnable in a public portfolio repo without exposing issue-tracker credentials or requiring a hosted control plane.

## Layer Mapping

| Symphony layer | Local implementation |
| --- | --- |
| Policy layer | `WORKFLOW.md` |
| Configuration layer | Flat `WORKFLOW.md` front matter parsed by `scripts/symphony.sh` |
| Coordination layer | `scripts/symphony.sh once/list/validate` |
| Execution layer | `.symphony/workspaces/<issue>` plus `scripts/bin/llm.sh` |
| Integration layer | local Markdown tracker now; Linear/GitHub Issues adapter later |
| Observability layer | JSONL logs under `.symphony/logs/` |

## Intentional Differences From Upstream

- The first adapter is codex-independent. It can use `scripts/bin/llm.sh` instead of Codex App Server.
- The tracker is local Markdown by default.
- Actual agent execution is opt-in with `SYMPHONY_ALLOW_AGENT_RUN=1`.
- The first runner is a small Bash adapter, not a daemon or distributed scheduler.
- The implementation favors public-safety and legibility over throughput until product code exists.

## Upgrade Path

1. Keep `WORKFLOW.md` stable as the contract.
2. Add a GitHub Issues or Linear adapter after the local Markdown tracker proves useful.
3. Add background daemon mode only after dry-run and one-shot runs are boring.
4. Add per-issue git worktrees when the repo has real code packages.
5. Add Codex App Server support as an optional execution adapter, not as the only path.

