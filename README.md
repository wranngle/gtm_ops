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

[`DESIGN.md`](DESIGN.md) is the canonical brand system, mirrored from `~/.dotfiles/DESIGN.md`. Token extracts in `tokens/` are vendored by every consumer repo (no long-form duplication).

## License

See [`LICENSE`](./LICENSE).
