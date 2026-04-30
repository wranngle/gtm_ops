# Harness Engineering Reference

Status: Active
Source: https://openai.com/index/harness-engineering/
Local diagram sources:

- `/home/wranngle/.dotfiles/temp/OAI_Harness_engineering_Codex_drives_the_app_with_Chrome_DevTools_MCP_to_validate_its_work_desktop-dark.png`
- `/home/wranngle/.dotfiles/temp/OAI_Harness_engineering_Layered_domain_architecture_with_explicit_cross-cutting_boundries_desktop-dark.png`
- `/home/wranngle/.dotfiles/temp/OAI_Harness_engineering_The_limits_of_agent_knowledge_desktop-dark.png`
- `/home/wranngle/.dotfiles/temp/OAI_Harness_engineering_Giving_Codex_a_full_observability_stack_desktop-dark.png`

## Applied Takeaways

This repo adopts the following Harness Engineering patterns:

1. Start from an empty git repository and let the agent-shaped baseline define the project.
2. Keep humans at the intent, review, and judgment layer.
3. Make repo-local knowledge the system of record.
4. Keep `AGENTS.md` short and use it as a table of contents.
5. Capture complex work in versioned execution plans.
6. Add mechanical checks for documentation shape, architecture shape, and release safety.
7. Make app state, UI state, logs, metrics, and traces legible to agents as the system matures.
8. Enforce boundaries and taste with validators instead of relying on memory.
9. Treat recurring cleanup as garbage collection, not occasional hero work.

## Diagram Read Notes

### Codex Drives The App With Chrome DevTools MCP

The loop is:

1. Select target and clear console.
2. Snapshot before.
3. Trigger UI path.
4. Observe runtime events during interaction.
5. Snapshot after.
6. Apply fix and restart.
7. Re-run validation until clean.

Repo implication: once `apps/ops-console` exists, UI changes need screenshot or DOM validation paths that agents can run locally.

### Full Observability Stack

The diagram shows an app emitting logs, metrics, and traces to a local fanout layer, then exposing them through query APIs. Codex queries, correlates, reasons, implements a change, restarts, reruns the workload, tests the UI journey, and loops.

Repo implication: first version can use local logs and fixture-backed run artifacts. Later versions should expose structured logs and metrics from every runnable surface.

### Limits Of Agent Knowledge

Google Docs, Slack messages, and tacit human memory are invisible until encoded into the repo.

Repo implication: portfolio strategy, security boundaries, source-material decisions, and execution plans belong in Markdown here when they affect future agent work.

### Layered Domain Architecture

The diagram enforces a forward domain flow:

```text
types -> config -> repo -> service -> runtime -> ui
providers -> service
utils -> providers
```

Cross-cutting concerns enter through providers. UI and app wiring do not reach directly into persistence or external services.

Repo implication: each package should adopt this model once code lands, and the validation script should grow structural checks over time.

