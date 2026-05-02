# Plans

Plans are first-class artifacts. The Harness Engineering rule:

> Ephemeral lightweight plans are used for small changes, while complex work is
> captured in execution plans with progress and decision logs that are checked
> into the repository. Active plans, completed plans, and known technical debt
> are all versioned and co-located, allowing agents to operate without relying
> on external context.

## Choose the right plan shape

| Change shape | Plan artifact |
| --- | --- |
| One file, one obvious diff | Lightweight checklist in the PR body or commit message. No exec-plan needed. |
| Multi-file, internal-only, no architecture impact | Lightweight plan: a short Markdown checklist in the issue/task file under `.symphony/issues/`. |
| Multi-file, touches architecture, security, public surface, or reviewer-facing behavior | First-class **execution plan** under `docs/exec-plans/active/`. Includes decision log and acceptance criteria. |
| Cleanup of recurring drift | Tech-debt entry in `docs/exec-plans/tech-debt-tracker.md`. Promote to an execution plan when the cleanup grows beyond a single PR. |

Default to "lighter than you think." A giant exec-plan for a 3-line fix is the
same problem as no plan at all: it crowds out attention.

## Execution-plan shape

Each first-class plan must include:

- status (Active, Completed, Cancelled)
- owner
- created date
- goal
- scope (in-scope and explicitly-out-of-scope)
- acceptance criteria (mechanical, checkable)
- decision log (one entry per non-obvious decision, with the alternative
  considered)
- progress notes (slice-by-slice; mark closed slices visibly)
- completion notes (when status flips to Completed)

Move plans from `active/` to `completed/` in the same PR that ships the final
slice. Renaming with the date prefix (`YYYY-MM-DD-<slug>.md`) keeps the
completed index sortable.

## Locations

- Active work: `docs/exec-plans/active/`
- Completed work: `docs/exec-plans/completed/`
- Debt and cleanup: `docs/exec-plans/tech-debt-tracker.md`

## Symphony Tasks

Local Symphony tasks live under `.symphony/issues/<state>/`.

Use Symphony task files when the unit of work should be picked up by an agent
runner rather than managed as a one-off interactive session. Keep task
descriptions concrete and include acceptance criteria. A task may link out to
an execution plan when the work is large; the task is the work item, the plan
is the design + decision log.
