# Quality Score

Quality is tracked by domain and should improve through small garbage-collection passes.

| Domain | Current grade | Evidence | Next move |
| --- | --- | --- | --- |
| Repo knowledge base | B | AGENTS map, docs structure, validator | Add package-level docs once code lands. |
| Dotfiles integration | B | Baseline files preserved, PR/security/contributing cleaned up, validator checks required files | Add renderable demo artifact once runnable surfaces exist. |
| Symphony orchestration | B | `WORKFLOW.md`, local Markdown tracker, Bash runner, dry-run mode, validation hooks | Add daemon mode or external tracker only after local tasks prove useful. |
| Public safety | B | Synthetic-data policy, never-public source repos | Install and run `gitleaks` and `trufflehog`. |
| Agent evals | D | Planned only | Add `packages/agent-evals`. |
| Data reconciliation | D | Planned only | Add Python CLI, SQL models, fixtures. |
| Ops console | D | Planned only | Add Streamlit/FastAPI app and screenshot loop. |
| Observability | D | Planned only | Add structured logs first. |

Grades are directional and should be updated in the PR that materially changes the evidence.
