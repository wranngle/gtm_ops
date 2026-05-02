---
id: STACK-004
priority: 3
labels: stack,knowledge-base,references
blocked_by:
---
# Curate the first reference *-llms.txt corpus

The Harness Engineering post's example `docs/` layout includes:

```
docs/references/
  design-system-reference-llms.txt
  nixpacks-llms.txt
  uv-llms.txt
```

These are LLM-friendly snapshots of dependency documentation that an agent can
load into context without scraping the internet. The pattern matters because
external doc sites are invisible to agents at run time (image #4: "What Codex
can't see doesn't exist").

`docs/references/` currently has zero `*-llms.txt` files. Without them the
repo's stance is "agents must search the web for dependency docs," which
contradicts the agent-legibility model.

## Acceptance criteria

- At least one curated `<dependency>-llms.txt` file exists, sized to be
  loadable into context (sub-500KB is a soft target).
- The chosen dependency must be one this repo actually uses: candidates are
  `bun`, `uv`, `streamlit`, `playwright-mcp`, `mise`, `victoria-metrics`,
  `vector` (VRL).
- A README block or a short `docs/references/README.md` explains the
  curation policy: source URL, snapshot date, token-count estimate, how to
  refresh.
- Add the new file to `validate-knowledge-base.sh` `required_files`.

## Why deferred

Curating LLM-friendly dependency docs is a one-shot sourcing task best done
once with judgment about which dependency is the most-used / most-painful, not
swept in during an audit pass.
