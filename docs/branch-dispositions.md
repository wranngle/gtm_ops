# Branch dispositions — 2026-07-02 audit

Every `origin/*` branch ahead of `main` was triaged (patch-id + file-level
comparison against current main, plus per-branch review). GitHub is the mirror;
these refs are local snapshots — nothing here requires a remote. Recorded so
future agents don't re-litigate the same branches.

## Landed into main

- `origin/fix/usage-test-unique-db` — per-test unique SQLite DB paths in
  `tests/unit/usage.test.ts`, replacing the shared-file retry shim. Landed via
  content copy (CRLF-era blob vs renormalized tree made a direct cherry-pick
  conflict on every line).
- `origin/wip/preserve-operator-work-2026-05-19`, partial —
  `tests/unit/pipeline-llm-fill.test.ts` landed (adapted: the no-key path now
  pins the skip-contract rather than a reject; unresolved placeholders are the
  `placeholder_resolution` validator's job) and
  `context/generated-research/README.md` landed (adapted to describe the
  committed cache truthfully).

## Archived — content already in main (patch-equivalent)

`chore/pr-template-current-paths`, `chore/remove-retired-automation-paths`,
`chore/refresh-cf-feasibility-dep-table` (landed as PR #206),
`feat/typecheck-console`, `feat/typecheck-pages-functions`,
`fix/console-typecheck-phase2`, `revive/billing-tiers-parity-test`,
`revive/coach-launcher-orb-component`, `revive/playground-eleven-primitives`,
`ui/visual-restraint-sweep`, `ui/visual-restraint-sweep-2`,
`wip/local/fix/backend-tests` (admin/audit test fixes exist verbatim on main,
further hardened), `wip/local/feat/ui-transcript-repairs` (latency/eval-axis
work patch-equivalent on main; its only unique file is a private transcript
dump that must not land).

## Archived — superseded by main's evolution

- `wip/local/ui/eval-parity-slice-1` — its real commits all landed via other
  paths: fast-uri ≥3.1.2 is in `bun.lock`, the admin `vi` import fix is on
  main, and the per-tool rolling latency rollup exists as `toolLatencyRollup`
  in `apps/ops-console/console/pages-2.tsx`.
- `wip/local/ui/punch-list-followups` — origin of
  `tests/unit/coach-launcher-position.test.ts`; main's copy has since grown
  from 2 to 5 tests. Console work predates the `.jsx → .tsx` migration.
- `wip/local/main`, `wip/autosync/local/main` — autosync snapshots of the
  mid-May working tree; every touched file has since been reworked on main.
- `wip/preserve-operator-work-2026-05-19`, remainder — 8 console-e2e specs and
  8 `.agents/pages/*.jsonc` page contracts encode the May-era DOM/a11y
  structure (40 of 41 tests fail against today's console after the visual
  restraint rounds). Left on the branch; mine it from there if a future UI
  effort wants the intents (a11y roles, keyboard flows, popover semantics).

## Worktree branches (symphony-elixir era)

`worktree-agent-a09c96b2…`, `worktree-agent-a8df8500…`,
`worktree-agent-af3cfc1d…` — May-era work on `tools/symphony-elixir`, a
subsystem that no longer exists in this repo (it lives in
`wranngle-gtm-engine`). Worktree metadata pruned 2026-07-02 (directories were
already deleted); branches kept as archival refs.

## Dependabot

- `dependabot/npm_and_yarn/dev-47af7a6c5f` (`@cloudflare/workers-types`
  patch bump) — applied locally.
- `dependabot/npm_and_yarn/types/react-19.2.15` — declined: the console runs
  React 18.3.1 UMD; `@types/react` stays on the runtime's major.
