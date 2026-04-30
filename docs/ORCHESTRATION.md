# Orchestration

`wranngle-gtm-engine` uses a Symphony-inspired orchestration layer over the dotfiles and Harness Engineering foundation.

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

Run the configured agent command for one task:

```bash
SYMPHONY_ALLOW_AGENT_RUN=1 scripts/symphony.sh once
```

## Safety Defaults

- Active tasks live in `.symphony/issues/todo` and `.symphony/issues/in_progress`.
- Human-ready work moves to `.symphony/issues/human_review`.
- Terminal tasks move to `.symphony/issues/done`, `.symphony/issues/cancelled`, or `.symphony/issues/duplicate` if that state is added.
- Workspaces and logs are ignored by git.
- Actual agent execution is blocked unless `SYMPHONY_ALLOW_AGENT_RUN=1` is set.
- The default agent command is `scripts/bin/llm.sh`.

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

## Relationship To Harness Engineering

Harness Engineering makes the repo legible to agents. Symphony makes the work queue legible to agents.

The layers are:

1. Dotfiles hydration: repository hygiene and scripts.
2. Harness Engineering: repo-local knowledge, docs, plans, checks.
3. Symphony: task control plane, workspaces, workflow prompt, agent execution adapter.

