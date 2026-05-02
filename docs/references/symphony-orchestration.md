# Symphony Orchestration Reference

Status: Active
Sources (upstream):

- OpenAI article: https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI repository: https://github.com/openai/symphony
- Symphony spec: https://github.com/openai/symphony/blob/main/SPEC.md

## Source material checked into this repo

Authoritative when this derivative file is unclear:

- [openai_symphony_original_spec.txt](openai_symphony_original_spec.txt) — full SPEC.md
- [openai_symphony_github.txt](openai_symphony_github.txt) — Symphony repo / OpenAI announcement post text
- [openai_symphony_harness_engineering_stack_diagrams_explained.txt](openai_symphony_harness_engineering_stack_diagrams_explained.txt) — diagrams with narrative read

Diagrams (PNG, also checked in):

- [`Coworking-Desktop-Dark-Symphony__1_.png`](Coworking-Desktop-Dark-Symphony__1_.png) — the Symphony control-plane/agent topology
- [`BeforeAndAfter-Desktop-Dark-Symphony.png`](BeforeAndAfter-Desktop-Dark-Symphony.png) — the productivity-shift framing

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
- `scripts/symphony-follow-up.sh`: local Markdown follow-up task writer.
- `scripts/symphony-review-packet.sh`: handoff manifest, validator log, changed-file, and artifact packet writer.
- `scripts/symphony-pr-shepherd.sh`: `gh` wrapper for PR creation/update, review triage, failed-log capture, rebase, rerun, readiness comment, and opt-in merge.
- `scripts/bin/llm.sh`: codex-independent agent command/fallback chain.

This keeps the orchestration pattern runnable in a public portfolio repo without exposing issue-tracker credentials or requiring a hosted control plane.

## Layer Mapping

| Symphony layer | Local implementation |
| --- | --- |
| Policy layer | `WORKFLOW.md` |
| Configuration layer | Nested `WORKFLOW.md` front matter parsed by `scripts/symphony.sh` |
| Coordination layer | `scripts/symphony.sh once/list/validate` (one-shot CLI) and `tools/symphony-elixir/` (daemon) |
| Execution layer | `.symphony/workspaces/<issue>` plus `scripts/bin/llm.sh` |
| Completion layer | `scripts/symphony-follow-up.sh`, `scripts/symphony-review-packet.sh`, `scripts/symphony-pr-shepherd.sh` |
| Integration layer | `local_markdown` and `github_issues` tracker adapters, plus agent-invoked `gh` writes |
| Observability layer | ECS-jsonl logs under `.symphony/logs/`, tailed by `tools/observability/` Vector → VictoriaLogs |

## Spec Coverage By Adapter

The Symphony spec (`openai_symphony_original_spec.txt`) is normative. The
Bash adapter (`scripts/symphony.sh`) is a one-shot CLI; the Elixir daemon
(`tools/symphony-elixir/`) carries the long-running responsibilities. This
matrix names which adapter owns each spec section:

| Spec section | Bash adapter | Elixir daemon |
| --- | --- | --- |
| §3 System overview | partial — Workflow Loader, Workspace Manager, Tracker Reader, Logging | full — adds Orchestrator + Agent Runner + Snapshot |
| §4.1 Issue model | normalized fields produced by both `local_markdown` and `github_issues` adapters | same; reused via the `Symphony.Tracker` behaviour |
| §4.1.5 Run Attempt / 4.1.6 Live Session / 4.1.7 Retry Entry / 4.1.8 Runtime State | not modeled (one-shot has no in-memory state) | full |
| §5 Workflow file format | front matter + body, dotted-path scalar getter, `$VAR` env indirection (§6.1); CSV-form lists; block-list and block-map values are out of scope | full YAML support |
| §5.4 Strict template engine (Liquid semantics) | NOT implemented — body is interpolated by `cat` heredoc; unknown variables silently no-op | yes — `Symphony.PromptRenderer` (Liquid-compatible) |
| §6.2 Dynamic config reload | not applicable to a one-shot CLI | yes — file watcher + reload on tick |
| §6.3 Dispatch preflight | partial — `validate` checks workflow exists, tracker dependency present, agent command executable | full — repeated on every tick |
| §7 Orchestration state machine (Unclaimed → Claimed → Running/RetryQueued → Released) | NOT implemented (one-shot is a single dispatch attempt) | yes |
| §8 Polling, scheduling, reconciliation, retry queue, stall detection | NOT implemented | yes |
| §9 Workspace management + safety invariants | yes — invariant 1 (cwd === workspace), invariant 2 (path-prefix check), invariant 3 (sanitized key) all enforced. Hooks are not executed. | yes — including hook execution (`after_create`, `before_run`, `after_run`, `before_remove`) |
| §10 Agent runner JSON-RPC protocol | NOT implemented — Bash shells out to `agent.command` (default `scripts/bin/llm.sh`) and reads stdout as one final blob | partial — `local_shell` runner plus optional Codex app-server JSON-RPC adapter |
| §11 Tracker integration (Linear-compatible normalized model) | yes — `local_markdown` and `github_issues` adapters normalize to the §4.1.1 schema (id, identifier, title, description, priority, state, blocked_by, labels) | yes — same behaviour |
| §11 tracker writes | helper-only — `symphony-follow-up.sh` writes local Markdown follow-ups; GitHub/Linear writes stay in agent tools, not scheduler business logic | future adapter-specific write helpers |
| §12 Prompt rendering with strict variable/filter checking | NO strict engine — heredoc interpolation only | yes (Elixir `Solid` Liquid renderer) |
| §13.1 Logging context (issue_id, issue_identifier, session_id, key=value phrasing) | yes — ECS jsonl with `issue.identifier`, `event.action`, `event.outcome`; `session_id` is N/A in one-shot mode | yes — running rows include `session_id` when the Codex adapter reports it |
| §13.3 Snapshot interface | NOT applicable (one-shot has no live state) | yes — `Symphony.snapshot/0` returns `running`, `retrying`, `codex_totals`, `rate_limits`, `tracker_kind`, `last_tick_at`, and `polling`; unavailable and timeout return tagged errors |
| §13.5 Token accounting | NOT applicable | yes — Codex absolute token totals are delta-accounted into live sessions and aggregate `codex_totals`; generic unsupported `usage` payloads are ignored |

## Workflow Completion Contracts

The upstream material treats completion as more than "the agent produced a diff." This repo now encodes three portable, public-safe completion contracts:

1. Follow-ups preserve out-of-scope discoveries without expanding the active task. The local writer creates the next `PREFIX-NNN` Markdown issue in `todo`, links the source task, records front matter, and rejects generated/build/dependency/runtime/private-looking evidence paths.
2. Review packets make proof of work inspectable. Each packet lives at `.symphony/workspaces/<issue>/review-packet/` and contains a manifest, command logs, changed-file summary, and optional artifacts. UI work must include visual evidence and a walkthrough artifact or equivalent inspectable HTML.
3. PR shepherding remains agent-invoked and policy-gated. The helper wraps `gh` for PR open/update, review comment reads, failed-check logs, base rebases, documented flaky reruns, readiness comments, and merge/auto-merge. Merge is refused unless the workflow policy allows it and the configured environment variable is set to `1` for that command.

These helpers are intentionally not hidden inside `scripts/symphony.sh`: the scheduler chooses and runs tasks; agents own tracker writes, review evidence, and PR handoff behavior.

## Intentional Differences From Upstream

- The first adapter is codex-independent. It can use `scripts/bin/llm.sh` instead of Codex App Server.
- The tracker is local Markdown by default; `github_issues` is supported by switching `tracker.kind`.
- Actual agent execution is opt-in with `SYMPHONY_ALLOW_AGENT_RUN=1`.
- PR merge is opt-in with `SYMPHONY_ALLOW_PR_MERGE=1`; default behavior prepares and records readiness rather than merging.
- The Bash adapter is one-shot (`once`) by design; the Elixir daemon is the long-running implementation.
- The implementation favors public-safety and legibility over throughput until product code exists.
- `WORKFLOW.md` extensions used here that are NOT in the upstream spec: top-level `log_path`, `agent.require_explicit_run`, `review_packet.*`, and `pr_shepherd.*`. They are documented in this file and ignored by adapters that do not need them.

## Upgrade Path

1. Keep `WORKFLOW.md` stable as the contract.
2. Add a GitHub Issues or Linear adapter after the local Markdown tracker proves useful. (Done — see `symphony-github-issues-adapter.md`.)
3. Add background daemon mode only after dry-run and one-shot runs are boring. (In progress — see `tools/symphony-elixir/`.)
4. Add per-issue git worktrees when the repo has real code packages.
5. Add Codex App Server support as an optional execution adapter, not as the only path.
6. Promote PR shepherding from helper commands to daemon-observed state only after live PR throughput justifies that complexity.
