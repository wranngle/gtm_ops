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

### 3. Voice agent — external (ElevenLabs) + `voice_ai_agent_evals`

The live voice agent runs on ElevenLabs; this repo doesn't host the agent runtime. What this repo owns is the integration surface: the prompt schema feeding `agent.prompt` shape, the tool definitions exposed via webhook (`server.js` `/tools/*`), and the regression hooks that wire `voice_ai_agent_evals` to the live agent for CI gating. Prompt versioning, tool-call evaluation, and methodology live in the satellite — `gtm_ops` references the satellite's `tests/runs/` output via the ops-console eval-runs page.

### 4. Post-call — `lib/post_call/` + `server.js` webhooks

Receives ElevenLabs post-call webhooks at `/api/webhooks/post-call`. Verifies the `ElevenLabs-Signature` header (HMAC-SHA256 over `<timestamp>.<body>`) before any side effect. On success, fans out:

- transcript + analysis → presales pipeline
- structured payload → audit log
- summary + booking outcome → CRM update via `lib/enrichment/`
- regression payload → eval harness queue (consumed by `voice_ai_agent_evals` next run)

Drop-and-log on signature failure; no retry. See `voice_ai_agent_evals/docs/webhook-security.md` for the verification pattern.

### 5. Presales pipeline — `lib/extraction/`, `lib/pdf_generator/`, `lib/branding/`, `lib/pricing/`, `lib/audit/`

Structured LLM extraction over the post-call payload produces a typed proposal. The proposal is rendered as a branded PDF via `templates/` (using `tokens/` from this repo's design system). Branding is per-tenant via `lib/branding/`; in `DEMO_MODE` it reads `config/branding.example.json` directly, in live mode it reads SQLite. Every step writes to the audit log surface (`/api/audit-logs/*` in `server.js`) — proposal generation, branding writes, webhook deliveries, and CRM updates are all replayable.

### 6. Ops-console — `apps/ops-console/`

Internal operational UI for non-technical operators. Pages:

- `index.html` — lead / proposal dashboard
- `evaluation/` — per-proposal eval review
- `eval-runs/` — surfaces `voice_ai_agent_evals/tests/runs/` output

Same code runs in two modes:

- **Live** — `bun run start` → `server.js` exposes `/api/*` and serves `public/`
- **Static / DEMO_MODE** — `python -m http.server` from `apps/ops-console/`; `/api/*` calls fall through to `fixtures/*.json`

## Cross-cutting

### Audit log

The `/api/audit-logs/*` surface is the integrity layer — not generic CRUD logging. Every proposal generation, branding write, webhook delivery, and CRM update lands here with a deterministic event ID and the originating request signature. This is RevOps-grade traceability, not application logging.

### Design system

Brand tokens live in `tokens/{tokens.css, tokens.json, tokens.tailwind.js}`, extracted from `DESIGN.md` (which itself mirrors `~/.dotfiles/DESIGN.md`). Every PDF template, ops-console page, and email surface vendors from this token set. See `DESIGN.md` for the full system; see `tokens/` for the machine-readable extracts.

### Workflow library

Three to five sanitized n8n workflows ship in `workflows/` as showcase examples. The full library lives at `wranngle/n8n` — a single source of truth, not duplicated here.

### Eval harness

The eval harness lives at `wranngle/voice_ai_agent_evals` — referenced, not duplicated. The ops-console `eval-runs/` page is the only thing in this repo that surfaces eval output.

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
├── DESIGN.md                # synced from ~/.dotfiles/DESIGN.md
├── ARCHITECTURE.md          # this file
├── README.md
├── CHANGELOG.md
├── DEPLOYMENT.md
├── LICENSE
├── apps/ops-console/        # vanilla HTML/JS operator UI; DEMO_MODE static + live modes
├── lib/                     # intake, enrichment, post_call, extraction, pdf_generator,
│                            # branding, pricing, audit, evaluation
├── prompts/                 # LLM extraction prompts (versioned)
├── server.js                # Express /api/* surface for live mode
├── cli.js                   # presales pipeline CLI
├── examples/                # synthetic input set (5–10 fake companies)
├── templates/               # PDF templates rendered with tokens/
├── public/                  # static asset root for server.js (live mode)
├── config/
│   └── branding.example.json
├── migrations/              # SQL schema (live-mode persistence)
├── workflows/               # 3–5 sanitized n8n samples; full library at wranngle/n8n
├── tokens/                  # tokens.css, tokens.json, tokens.tailwind.js
├── docs/
│   ├── walkthrough-lead-comes-in.md
│   └── images/
├── scripts/
│   ├── lint-file-size.sh
│   ├── lint-json-parse-boundary.sh
│   ├── lint-layered-architecture.sh
│   ├── lint-naming-conventions.sh
│   ├── lint-structured-logging.sh
│   └── lint-time-in-providers.sh
├── tests/integration/       # synthetic input → PDF round-trip
└── openspec/
    ├── AGENTS.md
    ├── project.md
    └── specs/
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
