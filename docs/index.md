# Repository Knowledge Base

This directory is the system of record for the repository. Per the Harness
Engineering rule: if a decision is not encoded here, future agents cannot see it.

## Top-level docs

- [DESIGN.md](DESIGN.md): product and interaction design constraints.
- [FRONTEND.md](FRONTEND.md): UI implementation rules.
- [ORCHESTRATION.md](ORCHESTRATION.md): Symphony-inspired task orchestration layer.
- [PLANS.md](PLANS.md): execution-plan rules (ephemeral vs first-class).
- [PRODUCT_SENSE.md](PRODUCT_SENSE.md): product judgment and portfolio positioning.
- [QUALITY_SCORE.md](QUALITY_SCORE.md): quality rubric, by domain and by architectural layer.
- [RELIABILITY.md](RELIABILITY.md): runtime and validation expectations.
- [SECURITY.md](SECURITY.md): public-release and webhook security posture.

## Subdirectories

- [design-docs/index.md](design-docs/index.md): design history and operating beliefs (each carries status + last-reviewed).
- [exec-plans/active](exec-plans/active/): work currently in progress.
- [exec-plans/completed](exec-plans/completed/): completed execution plans.
- [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md): known debt and cleanup loops.
- [generated/README.md](generated/README.md): generated schemas, reports, and inventories (rules, plus what to generate as runnable surfaces land).
- [product-specs/index.md](product-specs/index.md): product and operator specs.

## References (stack contracts + checked-in source authority)

Stack contracts owned by this repo:

- [references/canonical-stack.md](references/canonical-stack.md): canonical-stack vs showcase-project separation.
- [references/dotfiles-hydration.md](references/dotfiles-hydration.md): primitive dotfiles baseline and integration contract.
- [references/harness-engineering.md](references/harness-engineering.md): Harness Engineering notes + diagram reads encoded for this repo.
- [references/symphony-orchestration.md](references/symphony-orchestration.md): Symphony notes and local adaptation.
- [references/symphony-github-issues-adapter.md](references/symphony-github-issues-adapter.md): GitHub Issues adapter contract.
- [references/layered-domain-architecture.md](references/layered-domain-architecture.md): per-domain import-direction rule.
- [references/doc-gardener.md](references/doc-gardener.md): doc-gardener contract.
- [references/local-observability.md](references/local-observability.md): LogsQL/PromQL/TraceQL cookbook.
- [references/edge-devtools-mcp.md](references/edge-devtools-mcp.md): Edge DevTools MCP wiring contract.
- [references/README.md](references/README.md): curation policy for dependency `*-llms.txt` snapshots.
- [references/streamlit-llms.txt](references/streamlit-llms.txt): compact Streamlit API snapshot for the ops console.

Checked-in OpenAI source material (authoritative when this repo's derivative docs disagree):

- `references/openai_harness_engineering_original_spec.txt` — the Harness Engineering blog post.
- `references/openai_symphony_original_spec.txt` — the Symphony SPEC.md.
- `references/openai_symphony_github.txt` — the Symphony repo + announcement post.
- `references/openai_symphony_harness_engineering_stack_diagrams_explained.txt` — diagrams + narrative reads.
- Six PNG diagrams (`OAI_Harness_engineering_*.png`, `*-Symphony*.png`).

Edits to those `openai_*.txt` files and PNGs are forbidden — they are read-only source authority. Encode interpretations in the corresponding derivative files above instead.
