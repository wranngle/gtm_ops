# Plans

Use execution plans for changes that touch multiple files, public architecture, security posture, or reviewer-facing behavior.

## Plan Shape

Each plan should include:

- status
- owner
- created date
- goal
- scope
- acceptance criteria
- decision log
- completion notes

## Locations

- Active work: `docs/exec-plans/active/`
- Completed work: `docs/exec-plans/completed/`
- Debt and cleanup: `docs/exec-plans/tech-debt-tracker.md`

Small one-file changes can use a lightweight checklist in the PR body instead.

## Symphony Tasks

Local Symphony tasks live under `.symphony/issues/<state>/`.

Use Symphony task files when the unit of work should be picked up by an agent runner rather than managed as a one-off interactive session. Keep task descriptions concrete and include acceptance criteria.
