# gtm_ops

> ### Try it in 60s
>
> **[Launch the canned proposal trace →](https://app.wranngle.com/console/?route=generate&demo=1)**
>
> Click once. The Generate page auto-loads the HVAC sample brief and replays the 11-step pipeline (intake → extract → enrichment → pricing → compliance → scope → PDF render → audit). No backend, no signup, no operator interaction. Lands on a ready-to-review proposal in about 60 seconds.
>
> *(A 60-second screencapture GIF rendered by [`wranngle/auto_demo`](https://github.com/wranngle/auto_demo) drops in here once the demo CI publishes it.)*

Voice-AI-led GTM motion runtime. An inbound voice agent enriches the lead from CRM context, structured LLM extraction generates a branded PDF proposal, every step writes audit logs, and operators review the result in the ops-console — one repo, one runnable thing, end-to-end against synthetic fixtures (`DEMO_MODE`) or a live backend.

## What's in here

- **`apps/ops-console/`** — operator UI: React (loaded via UMD + babel-standalone, no build step) for the main `/console/`; `/evaluation/` is a compatibility redirect into `/console/?route=evals`, and `/eval-runs/` remains the static harness output surface. Same code runs static (`DEMO_MODE`) or against the live backend. Includes the **Agents** route and the **Evals** regression lab — live ElevenLabs ConvAI playgrounds for the Sales Coach + Sarah Intake agents wired to app context.
- **`lib/`** — intake, CRM enrichment, post-call processing, LLM extraction, branded PDF generation, audit log surface, evaluation hooks.
- **`server.ts`** — Express `/api/*` surface (live mode, full Express backend).
- **`functions/api/`** — Cloudflare Pages Functions mirror of the same `/api/*` surface so the Pages deploy is full-stack. Pages Functions read from D1 first and fall back to the bundled fixtures when D1 is empty or unbound.
- **`cli.ts`** — presales pipeline CLI.
- **`templates/`** — branded PDF templates rendered with `tokens/`.
- **`tokens/`** — machine-readable extracts of the brand system (`tokens.css`, `tokens.json`, `tokens.tailwind.js`); see [`DESIGN.md`](DESIGN.md) for the long-form spec.

The n8n workflow library is the single source of truth at [`wranngle/n8n`](https://github.com/wranngle/n8n) — not duplicated here.

## Demo

The deployed Pages site at [`app.wranngle.com`](https://app.wranngle.com) (Cloudflare Pages project `gtm-ops`, also reachable at `gtm-ops.pages.dev`) runs in DEMO_MODE end-to-end against the bundled fixtures. The bare `/` and `/index.html` on `gtm-ops.pages.dev` 301 to `app.wranngle.com` so the wranngle.com landing demo button reaches the console without a middleman page. Open `/console/` to drive the operator UI, `/console/?route=evals` for the native eval dashboard, and `/eval-runs/` for the harness output surface. The Generate page replays a canned 11-step pipeline trace so you can see the proposal flow without a live backend. A 3-minute architecture walkthrough video lives at the project's README on GitHub when published.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the product layers (intake → enrichment → voice → post-call → presales → ops-console) and how this repo connects to its satellites:

- [`wranngle/voice_ai_agent_evals`](https://github.com/wranngle/voice_ai_agent_evals) — eval harness wired to the live ElevenLabs agent
- [`wranngle/n8n`](https://github.com/wranngle/n8n) — full sanitized n8n workflow library

The app-to-harness boundary is encoded in [`eval-harness.manifest.json`](eval-harness.manifest.json)
and documented in [`docs/eval-harness-contract.md`](docs/eval-harness-contract.md).
`gtm_ops` owns app fixtures and Playwright/Vitest semantics; the harness consumes
the manifest and normalizes results.

## Running it

**Live mode** (full Express backend):

```bash
bun install
bun run start  # Express server on :3000
```

**Static / DEMO_MODE** (no backend, fixture-driven UI):

```bash
cd apps/ops-console
python3 -m http.server 4173   # then open http://localhost:4173/console/
```

In `DEMO_MODE`, every `/api/*` call falls through to JSON in `apps/ops-console/fixtures/`. The same UI runs in both modes. A small "demo data" pill appears in the topbar when the backend returns no historic runs.

**ElevenLabs Sales Coach + Sarah Intake** mount as live ConvAI widgets from the coach launcher, Agents route, and Evals regression lab when `unpkg.com/@elevenlabs/convai-widget-embed` is reachable. If the embed script can't load (corporate network, strict CSP), the widget container shows a fallback message + deep link to the agent on `elevenlabs.io`. Append `?admin=1` to the `/console/` URL to reveal admin-only agents.

## Tests

```bash
bun run typecheck         # tsc --noEmit
bun run test:run          # vitest unit tests (~10s)
bun run test:console      # Playwright UI suite — 100+ tests
bun run test:e2e          # Playwright PDF/report suite
bun run eval:harness      # optional: run this repo through voice_ai_agent_evals
```

CI runs `static`, `unit`, and `console-e2e` jobs on every PR (see `.github/workflows/test.yml`).

## Brand system

[`DESIGN.md`](DESIGN.md) is the canonical brand system. Token extracts in [`tokens/`](tokens/) (`tokens.css`, `tokens.json`, `tokens.tailwind.js`) are the machine-readable surface — vendor those into consumer repos rather than copy the long-form spec.

## License

See [`LICENSE`](./LICENSE).

## Deploy (Cloudflare Pages — full-stack)

`apps/ops-console/` deploys to Cloudflare Pages, and every `/api/*` route is
served by a Pages Function under `functions/api/*` (D1-backed where bindings
are configured, falling back to the bundled fixtures otherwise). The DEMO_MODE
shim in each HTML page also intercepts `/api/*` client-side, so the site stays
interactive even if no backend is wired.

### One-time setup

```bash
npx wrangler login                                  # browser OAuth
wrangler pages project create gtm-ops --production-branch main
```

Or connect the GitHub repo in the Cloudflare dashboard:
- Build command: *(none — static)*
- Build output directory: `apps/ops-console`
- Root directory: `/`

### Deploy

```bash
bun run deploy                                      # production
bun run deploy:preview                              # preview branch
bun run pages:dev                                   # local CF Pages emulator
```

### Files

- [`wrangler.toml`](wrangler.toml) — Pages config (`pages_build_output_dir = "apps/ops-console"`)
- [`apps/ops-console/_headers`](apps/ops-console/_headers) — security + cache headers (X-Frame-Options, immutable tokens, fixture caching)
- [`apps/ops-console/_redirects`](apps/ops-console/_redirects) — `/api/*` → `/fixtures/*.json` fallback for non-shim consumers

### Live Express alternative (separate hosting)

The full Express runtime (`bun run start`) is a node-friendlier alternative to
the Pages Functions deploy when you need things Pages Functions can't easily
do — long-running streams, native binary deps, big-memory PDF rendering.
Options: Fly.io, Render, Railway. Pages Functions remain the canonical
deploy target.
