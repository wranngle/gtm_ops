# Orchestration

This repository uses a Symphony-inspired orchestration layer over the dotfiles and Harness Engineering foundation.

## Commands

Validate the orchestration contract:

```bash
scripts/symphony.sh validate
```

List active local tasks:

```bash
scripts/symphony.sh list
```

Render the next task prompt without executing an agent:

```bash
scripts/symphony.sh once --dry-run
```

Render one explicit issue by identifier:

```bash
scripts/symphony.sh once --dry-run --issue STACK-002
```

Run the configured agent command for one task:

```bash
SYMPHONY_ALLOW_AGENT_RUN=1 scripts/symphony.sh once
```

File an out-of-scope follow-up in the local Markdown tracker:

```bash
scripts/symphony-follow-up.sh create --source STACK-000 --title "Follow-up title" --body "Why this should be scheduled later."
```

Generate a handoff review packet:

```bash
scripts/symphony-review-packet.sh create --issue STACK-000 --command "scripts/validate-knowledge-base.sh"
```

Drive PR shepherding through `gh`:

```bash
scripts/symphony-pr-shepherd.sh open --title "Change title" --body-file .github/PULL_REQUEST_TEMPLATE.md
scripts/symphony-pr-shepherd.sh review-comments --pr 1
scripts/symphony-pr-shepherd.sh checks --pr 1
scripts/symphony-pr-shepherd.sh failed-logs --run-id 123456
```

## Safety Defaults

- Active tasks live in `.symphony/issues/todo` and `.symphony/issues/in_progress`.
- Human-ready work moves to `.symphony/issues/human_review`.
- Terminal tasks move to `.symphony/issues/done`, `.symphony/issues/cancelled`, or `.symphony/issues/duplicate` if that state is added.
- Workspaces and logs are ignored by git.
- Actual agent execution is blocked unless `SYMPHONY_ALLOW_AGENT_RUN=1` is set.
- The default agent command is `scripts/bin/llm.sh`.
- Follow-up tasks default to `.symphony/issues/todo` and reject evidence paths from generated docs, build output, dependency/vendor directories, runtime logs, and paths outside the repository.
- Review packets live under `.symphony/workspaces/<issue>/review-packet/`. Non-UI tasks may be text-only; UI handoff packets must include visual evidence and a walkthrough artifact.
- PR merge is blocked unless `SYMPHONY_ALLOW_PR_MERGE=1` is set for the merge command and `WORKFLOW.md` does not set `pr_shepherd.merge_policy: never`.

## Task File Format

```md
---
id: WGTE-001
priority: 1
labels: symphony,scaffold
blocked_by:
---
# Task title

Task description and acceptance criteria.
```

`blocked_by` is a comma-separated list of issue identifiers. A blocker is considered open if a matching Markdown issue exists outside a terminal state.

Agent-filed follow-ups use the same task shape and add `source: <issue>` in front matter plus a Markdown link back to the source task. External tracker equivalents are toolchain writes: use `gh issue create` for GitHub-backed queues and the configured tracker CLI/API for other adapters. The orchestrator remains a reader/runner, not the owner of tracker mutation policy.

## Review Packet Format

`scripts/symphony-review-packet.sh create` writes:

- `manifest.md` — issue id, created time, source worktree, target URL/path, command results, changed-file summary path, and artifact paths.
- `changed-files.md` — `git status --short` plus diff stat when run inside a Git worktree.
- `logs/command-N.log` — captured stdout/stderr for each `--command`.
- `artifacts/` — optional for non-UI work, required for UI work.

For browser capture, agents can provide existing artifacts with `--before-artifact`, `--after-artifact`, and `--walkthrough-artifact`, or set `SYMPHONY_BROWSER_CAPTURE_CMD` with `{url}` and `{output}` tokens. Fixture mode (`--fixture-visual`) exists only for local smoke tests.

## PR Shepherding

`scripts/symphony-pr-shepherd.sh` wraps mechanical GitHub CLI steps while keeping policy in `WORKFLOW.md`:

- `open` / `update` create or edit the PR.
- `request-review` reads reviewers from `--reviewers` or `SYMPHONY_PR_REVIEWERS`.
- `review-comments`, `checks`, and `failed-logs` gather feedback and CI evidence.
- `rebase-main` rebases the current branch on the configured base branch.
- `rerun-failed` requires `--reason` so retrying failed checks is deliberate and documented.
- `ready-comment` posts the review-packet path or a body file.
- `merge` is opt-in and environment-gated.

## Relationship To Harness Engineering

Harness Engineering makes the repo legible to agents. Symphony makes the work queue legible to agents.

The layers are:

1. Dotfiles hydration: repository hygiene and scripts.
2. Harness Engineering: repo-local knowledge, docs, plans, checks.
3. Symphony: task control plane, workspaces, workflow prompt, agent execution adapter.
