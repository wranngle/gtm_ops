# gtm_ops

Voice-AI-led GTM motion runtime. An inbound voice agent enriches the lead from CRM context, structured LLM extraction generates a branded PDF proposal, every step writes audit logs, and operators review the result in the ops-console — one repo, one runnable thing, end-to-end against synthetic fixtures (`DEMO_MODE`) or a live backend.

## What's in here

- **`apps/ops-console/`** — operator UI: React (loaded via UMD + babel-standalone, no build step) for the main `/console/`, plus static dashboards at `/evaluation/` and `/eval-runs/`. Same code runs static (`DEMO_MODE`) or against the live backend. Includes the **Agents** route — live ElevenLabs ConvAI playgrounds for the Sales Coach + Sarah Intake agents wired to app context.
- **`lib/`** — intake, CRM enrichment, post-call processing, LLM extraction, branded PDF generation, audit log surface, evaluation hooks.
- **`server.js`** — Express `/api/*` surface (live mode, full Express backend).
- **`functions/api/`** — Cloudflare Pages Functions mirror of the same `/api/*` surface so the Pages deploy is full-stack. Pages Functions read from D1 first and fall back to the bundled fixtures when D1 is empty or unbound.
- **`cli.js`** — presales pipeline CLI.
- **`templates/`** — branded PDF templates rendered with `tokens/`.
- **`tokens/`** — machine-readable extracts of the brand system (`tokens.css`, `tokens.json`, `tokens.tailwind.js`); see [`DESIGN.md`](DESIGN.md) for the long-form spec.

The n8n workflow library is the single source of truth at [`wranngle/n8n`](https://github.com/wranngle/n8n) — not duplicated here.

## Demo

The deployed Pages site at [`gtm-ops.pages.dev`](https://gtm-ops.pages.dev) runs in DEMO_MODE end-to-end against the bundled fixtures. Open `/console/` to drive the operator UI, `/evaluation/` for the eval dashboard, `/eval-runs/` for the harness output surface. The Generate page replays a canned 11-step pipeline trace so you can see the proposal flow without a live backend. A 3-minute architecture walkthrough video lives at the project's README on GitHub when published.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the product layers (intake → enrichment → voice → post-call → presales → ops-console) and how this repo connects to its satellites:

- [`wranngle/voice_ai_agent_evals`](https://github.com/wranngle/voice_ai_agent_evals) — eval harness wired to the live ElevenLabs agent
- [`wranngle/n8n`](https://github.com/wranngle/n8n) — full sanitized n8n workflow library

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

**ElevenLabs Sales Coach + Sarah Intake** mount as live ConvAI widgets when `unpkg.com/@elevenlabs/convai-widget-embed` is reachable. If the embed script can't load (corporate network, strict CSP), the widget container shows a fallback message + deep link to the agent on `elevenlabs.io`. Append `?admin=1` to the `/console/` URL to reveal admin-only agents.

## Tests

```bash
bun run typecheck         # tsc --noEmit
bun run test:run          # vitest unit tests (~10s)
bun run test:console      # Playwright UI suite — 100+ tests
bun run test:e2e          # Playwright PDF/report suite
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
