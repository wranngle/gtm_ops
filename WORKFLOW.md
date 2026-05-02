---
workflow_name: wranngle-gtm-engine-local-symphony

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

log_path: .symphony/logs/symphony.jsonl
---
# Wranngle GTM Engine Symphony Workflow

You are operating inside the `wranngle-gtm-engine` agent-first Harness repository.

## Objective

Complete the assigned task using the repository's local knowledge base and validation loops.

## Schema

This file uses the Symphony spec's nested top-level keys (`tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`). The current local adapter is a one-shot Bash CLI; the daemon-shaped reference implementation lives at `tools/symphony-elixir/` (see `docs/exec-plans/tech-debt-tracker.md` TD-007).

The local adapter substitutes `scripts/bin/llm.sh` for the spec's `codex app-server` command. Both `agent.command` and `codex.command` point at it for now; once a real Codex app-server adapter is added, `codex.command` will diverge.

Extensions used here that are NOT in the upstream Symphony spec (per §5.3 "Unknown keys should be ignored for forward compatibility"):

- `log_path` (top-level path string) — sink path for the ECS-jsonl log stream emitted by `scripts/symphony.sh`.
- `agent.require_explicit_run` (boolean) — when true, `scripts/symphony.sh once` refuses to dispatch the agent unless `SYMPHONY_ALLOW_AGENT_RUN=1` is set in the environment.

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
- Run `scripts/validate-knowledge-base.sh` before handoff.
- Run `scripts/lint-layered-architecture.sh` for any change under `packages/`.

## Handoff

Successful work should produce one of:

- a committed code/doc change
- an implementation plan under `docs/exec-plans/active/`
- a review packet in the issue workspace
- a clear blocker with the missing capability named

Move or recommend moving the task to `human_review` when the work is ready for human inspection.
