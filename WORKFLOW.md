---
workflow_name: local-symphony-stack

tracker:
  kind: local_markdown
  issues_root: .symphony/issues
  active_states: todo,in_progress
  terminal_states: done,cancelled,duplicate
  handoff_state: human_review

polling:
  interval_ms: 30000

workspace:
  root: .symphony/workspaces

hooks:
  timeout_ms: 60000

agent:
  command: scripts/bin/llm.sh
  max_concurrent_agents: 1
  max_retry_backoff_ms: 300000
  require_explicit_run: true

codex:
  command: scripts/bin/llm.sh
  read_timeout_ms: 5000
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000

review_packet:
  root_name: review-packet
  require_for_handoff: true

pr_shepherd:
  provider: gh
  default_base: main
  merge_policy: opt_in
  merge_env: SYMPHONY_ALLOW_PR_MERGE
  reviewers_env: SYMPHONY_PR_REVIEWERS

log_path: .symphony/logs/symphony.jsonl
---
# Local Symphony Workflow

You are operating inside this agent-first Harness repository.

## Objective

Complete the assigned task using the repository's local knowledge base and validation loops.

## Schema

This file uses the Symphony spec's nested top-level keys (`tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`). The current local adapter is a one-shot Bash CLI; the daemon-shaped reference implementation lives at `tools/symphony-elixir/` (see `docs/exec-plans/tech-debt-tracker.md` TD-007).

The local adapter substitutes `scripts/bin/llm.sh` for the spec's `codex app-server` command. Both `agent.command` and `codex.command` point at it for now; once a real Codex app-server adapter is added, `codex.command` will diverge.

Extensions used here that are NOT in the upstream Symphony spec (per §5.3 "Unknown keys should be ignored for forward compatibility"):

- `log_path` (top-level path string) — sink path for the ECS-jsonl log stream emitted by `scripts/symphony.sh`.
- `agent.require_explicit_run` (boolean) — when true, `scripts/symphony.sh once` refuses to dispatch the agent unless `SYMPHONY_ALLOW_AGENT_RUN=1` is set in the environment.
- `review_packet.*` — local handoff artifact convention used by `scripts/symphony-review-packet.sh`.
- `pr_shepherd.*` — `gh`-backed PR shepherding defaults used by `scripts/symphony-pr-shepherd.sh`; merge remains opt-in through `pr_shepherd.merge_env`.

`tracker.active_states` and `tracker.terminal_states` are written here as comma-separated strings instead of YAML block lists; the bash parser is intentionally limited to inline scalars (see `docs/references/symphony-orchestration.md` "Spec Coverage By Adapter"). The Elixir daemon accepts both shapes.

## Required Context

Read these files before proposing or changing behavior:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/index.md`
- `docs/QUALITY_SCORE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/references/harness-engineering.md`
- `docs/references/symphony-orchestration.md`
- `docs/references/layered-domain-architecture.md`

## Operating Rules

- **Use your file-edit tools.** You are running inside Claude Code CLI with full Read/Edit/Write/Bash access (`--dangerously-skip-permissions` is set by the local-shell `agent.command`). Edit the actual files in this repo. **Do NOT respond with a planning document or "implementation plan summary"** — that response is detected as a planning-doc and the issue gets routed to `human_review/`. The dogfood runner requires ≥5 lines of meaningful diff outside `.symphony/` before counting an issue closed.
- Preserve the primitive dotfiles layer and the Harness Engineering layer.
- Keep public data synthetic and clean-room.
- Do not copy private operational repo history into this repo.
- Validate data shapes at boundaries.
- Prefer small, reviewable changes with updated docs and tests.
- File follow-up tasks when you find useful out-of-scope work that is not required for the current acceptance criteria. Use `scripts/symphony-follow-up.sh create --source <issue> --title <title> ...` for local Markdown. Do not file follow-ups from generated output, dependency/vendor directories, runtime logs, or private-source material.
- Update docs/tests in the current task when the discovered issue would make the current change false, unsafe, or unverified. Ask for human judgment instead of filing a task when the discovery changes product scope, public-safety posture, or ownership.
- Generate a review packet before handoff. Use `scripts/symphony-review-packet.sh create --issue <issue> --command "<validator>" ...`; UI work must include before/after visual evidence and a walkthrough artifact or equivalent inspectable HTML packet.
- For PR work, branch and commit the change, open or update a PR with `scripts/symphony-pr-shepherd.sh`, run local validators, self-review the diff, request configured reviewers from `SYMPHONY_PR_REVIEWERS`, triage review comments and failed checks, then record readiness with the review-packet path.
- Do not merge by default. `scripts/symphony-pr-shepherd.sh merge` is allowed only when `pr_shepherd.merge_policy` is not `never` and `SYMPHONY_ALLOW_PR_MERGE=1` is set for that command.
- Run `scripts/validate-knowledge-base.sh` before handoff.
- Run `scripts/lint-layered-architecture.sh` for any change under `packages/`.

## Completion Helpers

Local follow-up task:

```bash
scripts/symphony-follow-up.sh create --source STACK-000 --title "Follow-up title" --body "Why this should be scheduled later."
```

Review packet:

```bash
scripts/symphony-review-packet.sh create --issue STACK-000 --command "scripts/validate-knowledge-base.sh"
```

PR shepherding:

```bash
scripts/symphony-pr-shepherd.sh open --title "Change title" --body-file .github/PULL_REQUEST_TEMPLATE.md
scripts/symphony-pr-shepherd.sh checks --pr 1
scripts/symphony-pr-shepherd.sh failed-logs --run-id 123456 --output-dir .symphony/workspaces/STACK-000/review-packet/logs
scripts/symphony-pr-shepherd.sh rerun-failed --run-id 123456 --reason "documented infrastructure flake after reading failed logs"
```

## Handoff

Successful work should produce one of:

- a committed code/doc change
- an implementation plan under `docs/exec-plans/active/`
- a review packet in the issue workspace, linked from the final issue comment or handoff note
- a clear blocker with the missing capability named

Move or recommend moving the task to `human_review` when the work is ready for human inspection.
