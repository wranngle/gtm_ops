# Symphony github_issues Adapter

A second tracker adapter for `scripts/symphony.sh`. Switch in `WORKFLOW.md` by setting `tracker.kind: github_issues` plus `tracker.repo: <owner>/<name>`.

## Why this exists

The default `local_markdown` adapter is good for solo iteration on a fresh repo. `github_issues` lets the same Symphony workflow drive real GitHub-tracked work — visibility, multi-user collaboration, and the existing `.github/ISSUE_TEMPLATE/*.yml` shapes start carrying weight.

## Schema additions

In `WORKFLOW.md` front matter:

```yaml
tracker:
  kind: github_issues
  repo: owner/repo     # required
  active_states: todo,in_progress
  terminal_states: done,cancelled,duplicate
  handoff_state: human_review
```

The other top-level keys (`polling`, `workspace`, `hooks`, `agent`, `codex`) are unchanged.

## State mapping (Symphony state → GitHub label/state)

| Symphony state | GitHub representation |
|---|---|
| `todo`         | open + `symphony:todo` (or no symphony:* label — defaults to todo) |
| `in_progress`  | open + `symphony:in-progress` |
| `human_review` | open + `symphony:human-review` |
| `done`         | closed (no specific label) |
| `cancelled`    | closed + `symphony:cancelled` |
| `duplicate`    | closed + `symphony:duplicate` |

## Priority

A label of the form `priority:N` (e.g. `priority:1`). Falls back to `999` when no priority label is present. Lower numbers are higher priority.

## Blocked-by

A line in the issue body matching `Blocked-by: #N` (case-insensitive). Multiple blockers can be listed comma-separated: `Blocked-by: #42, #99`. Symphony considers the issue blocked while any blocker remains open.

## Workspace identifiers

Each Symphony workspace key for a GitHub-tracked issue is prefixed `gh-` to disambiguate from old `WGTE-NNN` Markdown identifiers. Issue number `42` becomes workspace `gh-42` under `.symphony/workspaces/`.

## Required tooling

- `gh` CLI on PATH.
- `gh auth status` succeeds (run `gh auth login` once if not).
- `jq` on PATH (used to parse the cached gh JSON payload).

`scripts/symphony.sh validate` checks all three and fails with a specific error if any is missing.

## Performance

`gh issue list --limit 200` runs once per Symphony invocation and the result is cached in-memory across all accessor calls. Per-issue gh calls are reserved for blocker state checks (`gh issue view <blocker> --json state`), which only fire when the issue's body declares `Blocked-by:`.

## Switching adapters

Set `tracker.kind: local_markdown` to switch back; the `.symphony/issues/` Markdown tree is preserved as the default and works with no external auth. The adapters are mutually exclusive — `tracker.repo` is ignored for `local_markdown`, and `tracker.issues_root` is ignored for `github_issues`.

## Out of scope

- Tracker writes (state transitions, comment posting, PR linking) remain the agent's responsibility, per the Symphony spec. Symphony is a scheduler/runner and tracker reader.
- Rate-limit handling beyond what `gh` itself does. A real daemon implementation should add backoff (TD-007).
- Pagination beyond 200 issues. The adapter currently `--limit 200`s `gh issue list`. Until the backlog grows past that, this is fine.
