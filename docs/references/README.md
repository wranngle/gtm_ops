# References

Stack contracts and architectural rules encoded as docs that future agents can read without web access.

Current:

- [`layered-domain-architecture.md`](layered-domain-architecture.md) — per-domain import-direction rule, enforced by `scripts/lint-layered-architecture.sh`

Policy for adding new references:

- Choose dependencies this repo actually uses.
- Use official or primary public sources.
- Summarize in repo-specific language instead of copying full documentation pages.
- Include snapshot date, source URLs, refresh instructions, and a rough size estimate.
- Keep each snapshot small enough to load into context (sub-500 KB soft ceiling).
