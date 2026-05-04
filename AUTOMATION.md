# Automation Contract

`.automation/policy.json` is this repo's machine-readable input to the
maintainer's **local** autosync tooling — checked in so labels, branch-
protection settings, dependabot grouping, and the in-loop guardrails
converge on a single source of truth across hosts.

External contributors do **not** need to run any local automation —
the GitHub Actions workflows in `.github/workflows/` are the only
gates a PR has to clear. This file exists for transparency about how
the maintainer keeps the local working trees in sync.

## Maintainer loop (informational)

1. Observe local Git state without reading secrets or large diffs.
2. Checkpoint dirty work to a host-scoped `wip/<host>/<branch>` ref.
3. Integrate only after the tree is quiet and required checks are green.
4. Prefer GitHub auto-merge with squash and branch deletion.
5. Repair tree-equivalent local divergence after squash merges.
6. Stop on semantic conflicts, active leases, unsafe Git states, or secrets.

The driver (`repo-automation.sh observe / doctor / policy`) lives in
the maintainer's dotfiles environment, not in this repo. Optional
per-repo overrides — `.autosync/policy.env`, `.autosync/pause`,
`.autosync/lease.json` — are gitignored when present, and the
checked-in `.automation/policy.json` is the default.

## What contributors run

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full validation matrix
(`scripts/validate-knowledge-base.sh`, `bun run typecheck`,
`bun run test:run`, `bun run test:console`, etc.). CI mirrors that
matrix in [`.github/workflows/test.yml`](.github/workflows/test.yml)
and [`.github/workflows/knowledge-base.yml`](.github/workflows/knowledge-base.yml).
