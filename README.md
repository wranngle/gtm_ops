# gtm_ops

Voice-AI-led GTM motion runtime. An inbound voice agent enriches the lead from CRM context, structured LLM extraction generates a branded PDF proposal, every step writes audit logs, and operators review the result in the ops-console — one repo, one runnable thing, end-to-end against synthetic fixtures (`DEMO_MODE`) or a live backend.

## What's in here

- **`apps/ops-console/`** — operator UI (vanilla HTML/JS) for proposal review, eval-run triage, and audit-log inspection. Same code runs static (`DEMO_MODE`) or against the live backend.
- **`lib/`** — intake, CRM enrichment, post-call processing, LLM extraction, branded PDF generation, audit log surface, evaluation hooks.
- **`server.js`** — Express `/api/*` surface (live mode).
- **`cli.js`** — presales pipeline CLI.
- **`templates/`** — branded PDF templates rendered with `tokens/`.
- **`workflows/`** — three to five sanitized n8n example workflows; the full library lives at [`wranngle/n8n`](https://github.com/wranngle/n8n).
- **`tokens/`** — machine-readable extracts of the brand system (`tokens.css`, `tokens.json`, `tokens.tailwind.js`); see [`DESIGN.md`](DESIGN.md) for the long-form spec.

## Demo

🎬 _Loom walkthrough coming soon — 3-min architecture tour: lead intake → enrichment → voice → post-call → presales → ops-console._

<!-- Replace with: <a href="https://www.loom.com/share/<id>"><img src="https://cdn.loom.com/sessions/thumbnails/<id>-with-play.gif" alt="Architecture walkthrough"></a> -->

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the product layers (intake → enrichment → voice → post-call → presales → ops-console) and how this repo connects to its satellites:

- [`wranngle/voice_ai_agent_evals`](https://github.com/wranngle/voice_ai_agent_evals) — eval harness wired to the live ElevenLabs agent
- [`wranngle/n8n`](https://github.com/wranngle/n8n) — full sanitized n8n workflow library

## Running it

**Live mode** (full backend):

```bash
bun install
bun run start  # Express server on :3000
```

**Static / DEMO_MODE** (no backend, fixture-driven UI):

```bash
cd apps/ops-console
python -m http.server  # then open http://localhost:8000
```

In `DEMO_MODE`, every `/api/*` call falls through to JSON in `apps/ops-console/fixtures/`. The same UI runs in both modes.

## Brand system

[`DESIGN.md`](DESIGN.md) is the canonical brand system. Token extracts in [`tokens/`](tokens/) (`tokens.css`, `tokens.json`, `tokens.tailwind.js`) are the machine-readable surface — vendor those into consumer repos rather than copy the long-form spec.

## License

See [`LICENSE`](./LICENSE).

## Deploy (Cloudflare Pages — DEMO_MODE only)

The static `apps/ops-console/` UI is deployable to Cloudflare Pages out of the
box. The `server.js` Express runtime is NOT included in this deploy; the
DEMO_MODE shim in each HTML page intercepts every `/api/*` call and resolves
to `apps/ops-console/fixtures/*.json`, so the deployed site is fully
interactive without a backend.

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

### Live runtime (separate hosting)

The live Express runtime (`bun run start`) needs a different host since CF
Pages is static + Workers Functions only. Options: Fly.io, Render, Railway.
That deploy isn't set up yet; the Pages target is DEMO_MODE only.
