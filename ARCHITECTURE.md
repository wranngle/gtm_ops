# Architecture

`gtm_ops` is the unified runtime for a voice-AI-led GTM motion. One repo, one runnable thing: an inbound voice agent enriches a lead from CRM context, structured LLM extraction generates a branded PDF proposal, every step writes audit logs, and operators review the result in the ops-console — runnable end-to-end against synthetic fixtures (`DEMO_MODE`) or a live backend.

## Product layers

```
                        ┌──────────────────────┐
   Inbound channel ───▶ │  1. Lead intake      │
                        │  (form / inbound call)│
                        └──────────┬───────────┘
                                   │ enrichment from CRM
                                   ▼
                        ┌──────────────────────┐
                        │  2. CRM enrichment   │
                        │  (Pipedrive / HubSpot │
                        │   / Salesforce shape)│
                        └──────────┬───────────┘
                                   │ context to agent
                                   ▼
                        ┌──────────────────────┐
                        │  3. Voice agent      │ ──▶ regression eval
                        │  (ElevenLabs)        │     (voice_ai_agent_evals)
                        └──────────┬───────────┘
                                   │ post-call webhook
                                   ▼
                        ┌──────────────────────┐
                        │  4. Post-call        │
                        │  (signature verify,  │
                        │   transcript fanout) │
                        └──────────┬───────────┘
                                   │ structured payload
                                   ▼
                        ┌──────────────────────┐
                        │  5. Presales pipeline│
                        │  (LLM extract → PDF  │
                        │   → audit log → CRM) │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  6. Ops-console      │
                        │  (operator review,   │
                        │   eval-runs surface, │
                        │   audit-log review)  │
                        └──────────────────────┘
```

## Layer responsibilities

### 1. Lead intake — `lib/intake/`

Accepts inbound forms and inbound voice calls. Normalizes both into a single `Lead` shape consumed by the rest of the pipeline. Hands off to enrichment before the agent greets the caller.

### 2. CRM enrichment — `lib/enrichment/`

Pulls account context from Pipedrive / HubSpot / Salesforce-shaped adapters. Normalized into `EnrichedLead`. The voice agent prompt incorporates this context server-side before its first turn — the caller is greeted by name, not asked to identify themselves.

### 3. Voice agent and eval harness — external (ElevenLabs) + `voice_ai_agent_evals`

The live voice agent runs on ElevenLabs; this repo doesn't host the agent runtime. What this repo owns is the integration surface: the prompt schema feeding `agent.prompt` shape, the tool definitions exposed via webhook (`server.ts` `/tools/*`), and the regression hooks that wire `voice_ai_agent_evals` to the live agent for CI gating.

For app-wide evals, `gtm_ops` owns the tests and fixtures because it knows the UI semantics, domain corpus, and artifact locations. `voice_ai_agent_evals` consumes [`eval-harness.manifest.json`](eval-harness.manifest.json) through its `gtm_ops` adapter and normalizes the results. Prompt versioning, tool-call evaluation, command orchestration, and cross-run reporting live in the satellite; this repo surfaces harness output via the ops-console eval-runs page.

### 4. Post-call — `lib/post_call/` + `server.ts` webhooks

Receives ElevenLabs post-call webhooks at `/api/webhooks/post-call`. Verifies the `ElevenLabs-Signature` header (HMAC-SHA256 over `<timestamp>.<body>`) before any side effect. On success, fans out:

- transcript + analysis → presales pipeline
- structured payload → audit log
- summary + booking outcome → CRM update via `lib/enrichment/`
- regression payload → eval harness queue (consumed by `voice_ai_agent_evals` next run)

Drop-and-log on signature failure; no retry. See `voice_ai_agent_evals/docs/webhook-security.md` for the verification pattern.

### 5. Presales pipeline — `lib/extraction/`, `lib/pdf_generator/`, `lib/branding/`, `lib/pricing/`, `lib/audit/`

Structured LLM extraction over the post-call payload produces a typed proposal. The proposal is rendered as a branded PDF via `templates/` (using `tokens/` from this repo's design system). Branding is per-tenant via `lib/branding/`; in `DEMO_MODE` it reads `config/branding.example.json` directly, in live mode it reads SQLite. Every step writes to the audit log surface (`/api/audit-logs/*` in `server.ts`) — proposal generation, branding writes, webhook deliveries, and CRM updates are all replayable.

### 6. Ops-console — `apps/ops-console/`

Internal operational UI for non-technical operators. Three surfaces:

- `index.html` — public landing page (Get-a-real-run lead form)
- `console/` — main React (UMD + babel-standalone, no build step) operator UI; routes home / pipeline / calls / proposals / evals (harness workbench + contextual ElevenLabs regression lab) / **agents** (live ElevenLabs ConvAI playgrounds for the Sales Coach + Sarah Intake) / settings / generate
- `evaluation/` — compatibility redirect into `/console/?route=evals`; the eval dashboard is native to the console shell
- `eval-runs/` — per-run harness output surface

Three deploy modes serve the same UI:

- **Local Express** — `bun run start` → `server.ts` exposes `/api/*` and serves `public/`
- **Cloudflare Pages full-stack** — Pages Functions under `functions/api/*` mirror `server.ts`'s surface; D1-backed where bindings are configured, falling back to bundled fixtures otherwise
- **Static / DEMO_MODE** — any static file server pointed at `apps/ops-console/`; the in-page DEMO_MODE shim swaps `/api/*` calls for `fixtures/*.json`

## Cross-cutting

### Audit log

The `/api/audit-logs/*` surface is the integrity layer — not generic CRUD logging. Every proposal generation, branding write, webhook delivery, and CRM update lands here with a deterministic event ID and the originating request signature. This is RevOps-grade traceability, not application logging.

### Design system

Brand tokens live in `tokens/{tokens.css, tokens.json, tokens.tailwind.js}`, extracted from `DESIGN.md`. Every PDF template, ops-console page, and email surface vendors from this token set. See `DESIGN.md` for the full system; see `tokens/` for the machine-readable extracts.

### Workflow library

No n8n workflows ship in this repo — the canonical library lives at [`wranngle/n8n`](https://github.com/wranngle/n8n) as a single source of truth. The `examples/` directory carries one or two illustrative payload fixtures (e.g. `n8n_clay_enrichment_webhook.json`) that pair with `lib/enrichment/`.

### Eval harness

The eval harness lives at `wranngle/voice_ai_agent_evals` — referenced, not duplicated. This repo publishes its app-owned command contract in [`eval-harness.manifest.json`](eval-harness.manifest.json); the ops-console `eval-runs/` page surfaces harness output.

## Layered import rule

Each business domain follows a forward-only layered model, mechanically enforced by `scripts/lint-layered-architecture.sh`:

```
types -> config -> repo -> service -> runtime -> ui
providers -> service
utils -> providers
```

- `types` defines parsed shapes and public contracts.
- `config` normalizes environment and runtime configuration.
- `repo` reads and writes storage or fixture-backed state.
- `service` owns business rules.
- `runtime` wires services to CLIs, webhooks, jobs, or servers.
- `ui` renders operator-facing views and must not bypass services.
- `providers` are explicit boundaries for cross-cutting integrations (telemetry, clocks, secrets, external APIs, filesystem).
- `utils` must stay generic and must not import business domains.

When in doubt, add a small boundary parser instead of probing data by assumption.

## Repository surface

```
gtm_ops/
├── DESIGN.md                # canonical brand system (long-form)
├── ARCHITECTURE.md          # this file
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── apps/ops-console/        # operator UI — React (UMD + babel-standalone)
│                            # main /console/ + /evaluation/ redirect + static /eval-runs/
├── lib/                     # intake, enrichment, post_call, extraction, pdf,
│                            # branding, pricing, audit, evaluation
├── prompts/                 # LLM extraction prompts (versioned)
├── server.ts                # Express /api/* surface for live Express mode
├── functions/api/           # Cloudflare Pages Functions mirroring /api/*
│                            # (D1-backed, falling back to fixtures)
├── cli.ts                   # presales pipeline CLI
├── examples/                # synthetic input fixtures (n8n payload samples, etc.)
├── templates/               # PDF templates rendered with tokens/
├── public/                  # static asset root for server.ts (live Express mode)
├── config/
│   └── branding.example.json
├── migrations/              # SQL schema (live-mode persistence; see docs/DATA-MODEL.md)
├── tokens/                  # tokens.css, tokens.json, tokens.tailwind.js
├── docs/
│   └── references/          # stack contracts (incl. doc-gardener.md)
├── scripts/
│   ├── validate-knowledge-base.sh
│   ├── lint-layered-architecture.sh
│   ├── lint-{file-size,json-parse-boundary,naming-conventions,structured-logging,time-in-providers}.sh
│   ├── gardener.sh          # weekly doc staleness + broken-link scan
│   └── render-og-card.mjs   # rasterizes og-card.svg → og-card.png
└── tests/
    ├── unit/                # vitest (incl. README + gardener drift guards)
    ├── integration/         # synthetic input → PDF round-trip
    ├── e2e/                 # Playwright PDF / report rendering
    └── console-e2e/         # Playwright UI suite for apps/ops-console/console/
```

## Feedback loops

This repo becomes legible to agents through runnable feedback:

- unit and contract tests
- synthetic fixtures (`examples/`, `apps/ops-console/fixtures/`)
- integration tests on the lead → PDF round-trip
- knowledge-base validation
- audit-log replay
- CI green against the example registry, no live secrets required

Do not rely on external chat, private repos, or human memory for behavior that future agents need to preserve.
