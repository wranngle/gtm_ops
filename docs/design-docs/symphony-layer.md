# Symphony Layer

Status: Active
Owner: wranngle
Last reviewed: 2026-05-02

## Design Decision

Use Symphony as a repo-local work orchestration layer, but keep the first version codex-independent and public-safe.

## Why

The repo needs to demonstrate agentic operating-system judgment without requiring private Linear credentials, live Codex App Server sessions, or hidden environment assumptions. A local Markdown tracker plus `llm.sh` runner makes the orchestration pattern inspectable from a clean clone.

## Design Constraints

- Bash is the implementation language for the first adapter.
- Function and variable names must be explicit.
- The script can be compact, but not cryptic.
- `WORKFLOW.md` remains the policy contract.
- The runner must not execute agents unless explicitly allowed.
- Workspaces must stay under `.symphony/workspaces`.
- Logs must be structured JSONL.
- Future Linear/GitHub Issues/Codex App Server adapters must be optional extensions.

## Current Limitations

- No daemon mode yet.
- No true concurrent worker pool yet.
- No orchestrator-owned tracker writes yet. Agent-invoked follow-up helpers can write local Markdown tasks.
- No automatic PR shepherd daemon yet. Agent-invoked `gh` wrappers handle PR creation, review triage, CI evidence, and opt-in merge.
- No Codex App Server protocol yet.

These are deliberate. The first milestone is a safe local orchestration scaffold that composes with the existing Harness framework.
