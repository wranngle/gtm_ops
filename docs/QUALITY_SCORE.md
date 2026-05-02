# Quality Score

Quality is tracked by **product domain** and by **architectural layer**, per the
Harness Engineering rule that "a quality document grades each product domain
and architectural layer, tracking gaps over time." Improvements should land
through small garbage-collection passes, not heroic rewrites.

Grading scale: A (production-grade), B (working with real coverage), C (working,
but thin), D (planned/stub only), F (broken or absent where required).

## By product domain

| Domain | Grade | Evidence | Next move |
| --- | --- | --- | --- |
| Repo knowledge base | B | AGENTS.md table-of-contents (≤120 lines), structured `docs/`, validator with required-files + AGENTS.md link presence checks, gardener + CI cron | Add link-resolution + index-coverage + design-doc-metadata checks to the validator. |
| Dotfiles integration | B | Baseline files preserved, PR/security/contributing cleaned up, validator checks required files | Add renderable demo artifact once runnable surfaces exist. |
| Symphony orchestration (bash one-shot) | B | `WORKFLOW.md` nested-YAML schema, local Markdown tracker, Bash runner, dry-run mode, follow-up/review-packet/PR helper contracts, validation hooks | Drive sustained use; defer daemon mode to the Elixir track. |
| Symphony orchestration (Elixir daemon) | C | 51 ExUnit tests passing, supervision tree boots, retry queue + reconcile + snapshot land; **no Task-supervised worker spawn yet, no Codex JSON-RPC adapter** | Land Task-supervised worker spawn, then JSON-RPC adapter (TD-007 follow-on). |
| Public safety | B | Synthetic-data policy, never-public source repos, pre-publish rg sweep documented | Install and run `gitleaks` + `trufflehog` locally and in CI. |
| Agent evals (showcase) | B | Layered architecture, 15+ tests passing, CLI runnable with synthetic fixtures, metrics + logging providers | Add webhook contract tests for the showcase domain endpoints. |
| Data reconciliation (showcase) | D | Planned only; package directory not yet created | Land Python CLI, SQL models, fixtures (see plan 001). |
| Ops console (showcase) | C | Streamlit stub + pure-Python `domain.py` + pytest; reads agent-evals JSON | Add screenshot-loop validation once Edge MCP is paired with a per-worktree boot. |
| Observability (local stack) | C | Vector + VictoriaLogs/Metrics/Traces compose, agent-evals metrics emitter, Symphony OTLP trace emitter + trace smoke, query cookbook | Fix Vector trace forwarding or run Symphony with the direct VictoriaTraces endpoint; wire ops-console slow-span panel to live data. |
| Edge DevTools MCP | B | Smoke test passes end-to-end (WSL → Edge → CDP → MCP → DOM), all owner directives applied | Wire into a per-worktree app boot once one exists. |

## By architectural layer (showcase: `packages/agent-evals`)

The reference implementation of the layer rule. Other packages should reach the
same grade before claiming they implement the rule.

| Layer | Grade | Evidence | Next move |
| --- | --- | --- | --- |
| types | A | Zod schemas, no inbound layer imports, 100% used at boundaries | Hold. |
| config | A | Env normalization, types-only deps | Hold. |
| repo | B | Fixture-backed reads, no service deps | Add a write path once a real backend exists. |
| providers | A | Metrics + logger providers behind interfaces; OTLP emitter | Hold; add SecretsProvider when an external API is wired. |
| service | B | Business rules with provider injection | Add a property-based test once rule count grows. |
| runtime | B | CLI runnable, structured logs | Add a webhook runtime once a server is wired. |
| ui | C | Single index re-export; no real consumers yet | Land once `apps/ops-console` consumes service output directly. |

## Stack-level gaps (cross-cutting)

These are spec-implied capabilities the stack does not yet implement. They are
graded so future garbage-collection passes can prioritize.

| Gap | Grade | Evidence | Next move |
| --- | --- | --- | --- |
| Generated artifacts pipeline | D | `docs/generated/` exists but has no actual generated files | Create one generator (e.g., layered-domain inventory) so the pattern is real. See STACK-003. |
| Reference `*-llms.txt` corpora | D | Spec example calls out `design-system-reference-llms.txt`, `nixpacks-llms.txt`, `uv-llms.txt`. None present | Curate one, even minimally, to prove the pattern. See STACK-004. |
| Quality-grade history | C | Generator script exists (`scripts/generate-quality-score-history.sh`); `docs/generated/quality-score-history.md` is committed and tracks all grade changes from git history. Not yet wired to pre-commit. | Wire the generator as a pre-commit hook so it runs automatically on every grade change. See STACK-001. |
| PR shepherding and review loop | C | STACK-076 added `gh` wrappers for PR open/update, review reads, failed-log capture, rebase, documented reruns, readiness comments, and opt-in merge. True agent-to-agent review remains TD-008. | Configure a real secondary agent reviewer once PR throughput justifies it. |
| Per-worktree app boot | D | No app is bootable per worktree yet | Land once ops-console grows past stub. |

## Grade history

A machine-readable record of every grade change lives in
[docs/generated/quality-score-history.md](generated/quality-score-history.md).
It is produced by `scripts/generate-quality-score-history.sh`, which diffs
successive `git log` versions of this file and emits one row per grade change.
Re-run it whenever you update a grade:

```bash
scripts/generate-quality-score-history.sh
```

## Update protocol

- Update grades in the PR that materially changes the evidence. Stale grades are
  worse than no grades.
- When a grade drops, name the regression in the row's evidence so a future
  garbage-collection pass can target it.
- Severity-1 regressions (e.g., the validator stops running in CI, the layered
  lint stops blocking) are exec-plan-worthy.
- The doc-gardener does **not** automatically rewrite this file. Grade changes
  are a human/agent judgment call.
