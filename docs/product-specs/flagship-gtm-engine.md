# Product spec: voice-AI-led GTM motion runtime

Status: Active
Owner: wranngle
Last reviewed: 2026-05-03

## One-line product

`gtm_ops` is the unified runtime: an inbound voice agent enriches the lead from CRM context, structured LLM extraction generates a branded PDF proposal, every step writes audit logs, and operators review the result in the ops-console — runnable end-to-end against synthetic fixtures (`DEMO_MODE`) or a live backend.

## Primary users

- Operators reviewing proposals, eval-run triage, and audit logs (the daily ops-console surface).
- Engineers wiring new CRM adapters, prompt versions, or PDF templates.
- Reviewers evaluating the architecture, code, and integration discipline (cold readers landing on the public GitHub repo).

## Core workflows

1. **Lead intake** — form submission or inbound voice call lands; lead is normalized.
2. **CRM enrichment** — Pipedrive / HubSpot / Salesforce-shaped adapter pulls account context server-side; voice agent prompt is parameterized before greeting.
3. **Voice agent** — ElevenLabs handles the call; tools defined in `server.js` `/tools/*` are exposed via webhook.
4. **Post-call** — `ElevenLabs-Signature` HMAC verified; transcript + analysis fanout to presales pipeline, audit log, CRM, and eval-harness regression queue.
5. **Presales pipeline** — structured LLM extraction produces a typed proposal; rendered as a branded PDF using `tokens/` from the design system.
6. **Ops-console review** — operator opens the proposal dashboard, eval-runs page, or audit-log review.

## Non-goals

- No live production credentials in the public repo.
- No real customer data; synthetic fixtures only.
- No private repo history.
- No live outbound calls or SMS from the public surface.

## Boundary with satellites

- `voice_ai_agent_evals` (separate repo) — owns prompt versioning, tool-call evaluation, scenario framework, methodology. `gtm_ops` references its `tests/runs/` output via the ops-console eval-runs page.
- `n8n` (separate repo) — owns the full sanitized workflow library. `gtm_ops/workflows/` carries 3-5 showcase samples only.

See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for layer responsibilities and the layered-import rule.
