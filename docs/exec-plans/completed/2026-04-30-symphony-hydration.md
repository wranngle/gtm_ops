# Completed Plan: Symphony Hydration

Status: Completed
Owner: wranngle
Completed: 2026-04-30

## Goal

Layer a customized Symphony orchestration contract over the existing dotfiles and Harness Engineering foundation.

## Completed Changes

- Added `WORKFLOW.md` as the repo-owned orchestration policy.
- Added `.symphony/issues` local Markdown tracker states.
- Added ignored `.symphony/workspaces`, `.symphony/logs`, and `.symphony/runtime` directories.
- Added `scripts/symphony.sh`, a compact Bash runner with explicit names.
- Added `docs/references/symphony-orchestration.md`.
- Added `docs/ORCHESTRATION.md`.
- Added `docs/design-docs/symphony-layer.md`.
- Extended validation and CI to include Symphony files and commands.

## Decision Log

- Use local Markdown tasks before Linear or GitHub Issues.
- Use `scripts/bin/llm.sh` as the default agent command to avoid Codex lock-in.
- Require `SYMPHONY_ALLOW_AGENT_RUN=1` before running an agent command.
- Keep logs and workspaces out of git.

