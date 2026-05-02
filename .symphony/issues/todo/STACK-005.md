---
id: STACK-005
priority: 3
labels: stack,knowledge-base,gardener
blocked_by:
---
# Extend the doc-gardener with a "doc references nonexistent path" check

The current `scripts/gardener.sh` checks for stale prose markers (TODO, TBD,
placeholder, …) and broken Markdown links (`](path/to/file.md)` where the
target file doesn't exist). It does NOT catch:

1. Inline code references to nonexistent files (e.g., `\`docs/missing.md\``,
   `\`packages/data-reconciliation/\``). The validator caught the AGENTS.md
   `packages/data-reconciliation` link only after a hand-added link-check
   loop; the gardener would not have caught it as a code-reference mention.
2. Inline shell-command references to scripts that no longer exist
   (`scripts/some-removed-script.sh`).
3. "See `<file>`" pointer prose that points at deleted artifacts.

These rot silently because the gardener's prose-marker scan ignores them and
the broken-link check only fires on Markdown link syntax.

## Acceptance criteria

- Extend `scripts/gardener.sh` to scan for backtick-quoted `[a-zA-Z0-9_/.-]+`
  spans in tracked docs and check each one that looks like a repo-relative
  path (contains `/` and ends in a known suffix or is a known directory) for
  existence.
- False-positive policy: spans in fenced code blocks, in `openai_*.txt`, and
  in `docs/exec-plans/completed/` are excluded.
- Findings emit at `[warn]` severity (matching the existing broken-link
  behavior).

## Why deferred

The right regex set + suffix heuristic + false-positive exclusion list is a
small design exercise. Rolling it in alongside the upstream-source exclusion
fix (already landed) would have over-reached.
