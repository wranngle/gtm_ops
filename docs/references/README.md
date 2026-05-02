# Dependency Reference Snapshots

This directory can include compact `*-llms.txt` files for dependency documentation that agents may need without web browsing.

Policy:
- Choose dependencies this repo actually uses.
- Use official or primary public sources.
- Summarize in repo-specific language instead of copying full documentation pages.
- Include snapshot date, source URLs, refresh instructions, and a rough size/token estimate in each file.
- Keep each snapshot small enough to load into context; sub-500 KB is the soft ceiling.

Current snapshots:
- [streamlit-llms.txt](streamlit-llms.txt): Streamlit APIs used by `apps/ops-console`.
