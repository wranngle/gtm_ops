# References

Stack contracts and architectural rules encoded as docs that future agents can read without web access.

Current:

- [`layered-domain-architecture.md`](layered-domain-architecture.md) — per-domain import-direction rule, enforced by `scripts/lint-layered-architecture.sh`
- [`pdf-generation.md`](pdf-generation.md) — PyMuPDF proposal rendering contract and install path
- [`sqlite-query-stability.md`](sqlite-query-stability.md) — `ORDER BY` tiebreaker, range-end +1ms, retry shim for the `node-sqlite3` cache-visibility race, planned `better-sqlite3` migration
- [`security-tooling.md`](security-tooling.md) — RBAC coverage lint, audit-chain CLI, audit metadata redaction, dev auth shim, CSP report Pages Function, response-header middleware

Policy for adding new references:

- Choose dependencies this repo actually uses.
- Use official or primary public sources.
- Summarize in repo-specific language instead of copying full documentation pages.
- Include snapshot date, source URLs, refresh instructions, and a rough size estimate.
- Keep each snapshot small enough to load into context (sub-500 KB soft ceiling).
