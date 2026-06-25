# gtm_ops

A presales pipeline that turns a raw lead brief into a priced, branded PDF
proposal, plus an operator console (ops-console) to drive and review the runs.
One repo, one runnable thing. It runs the full flow static against bundled
fixtures (`DEMO_MODE`) or against a live backend.

This is a personal operator lab from Wranngle. It is pre-revenue with no external
users. Treat it as a working build, not a hosted product.

## Live demo

A static build is deployed to Cloudflare Pages at
[app.wranngle.com/console](https://app.wranngle.com/console/). It runs the whole
flow in `DEMO_MODE` against the JSON fixtures in
`apps/ops-console/fixtures/`, so there is no backend, signup, or real data.

The Generate page replays a canned pipeline trace, so you can watch the
proposal flow (intake to extraction to pricing to PDF) without wiring an LLM
key. Direct link:
[Generate, demo trace](https://app.wranngle.com/console/?route=generate&demo=1).

## What actually runs

The pipeline (`lib/pipeline.ts`, driven by `cli.ts generate` or the Express
`/api/*` routes):

- **Extraction** (`lib/extract.ts`) parses unstructured text (an info dump,
  interview notes, an RFP) into a structured intake packet using an LLM. The
  provider is Google Gemini (`@google/genai`) with a Groq adapter and a model
  fallback order in `src/services/llm.ts`. LLM JSON is validated and the parse
  boundary is unit-tested.
- **Enrichment** (`lib/enrichment.ts`) is a provider waterfall (n8n/Clay
  webhook, People Data Labs, Abstract, Enrich.so). Every provider is optional;
  with no API keys set it returns the input unchanged.
- **Pricing and estimation** (`lib/estimate.ts`, `lib/pricing-calculator.ts`,
  `lib/milestone-builder.ts`) compute effort, phases, ROI, and line items.
- **Render** (`lib/html-report-generator.ts`, `templates/`) builds HTML from an
  explicit context via Mustache, then `lib/pdf-generator.ts` shells out to a
  Python PyMuPDF runner (`scripts/render-pdf-pymupdf.py`) to produce the PDF.
  In `DEMO_MODE` each sheet is stamped `SYNTHETIC FIXTURE - NOT A REAL QUOTE`.
- **Post-call rollup** (`lib/post-call.ts`) takes a finished call fixture
  (transcript plus tool calls) and emits a deterministic, lexicon-based
  sentiment chip for the call-trace row. It does not run a live call; it scores
  a transcript.

Around the pipeline:

- **`server.ts`** is an Express backend exposing `/api/*` with RBAC
  (`lib/rbac.ts`, viewer/admin roles), audit logging (`lib/audit.ts`), webhooks
  (`lib/webhooks.ts`), usage tracking (`lib/usage.ts`), GDPR export/consent
  (`lib/gdpr.ts`), and branding (`lib/branding.ts`). It binds to loopback by
  default.
- **`functions/api/*`** is a Cloudflare Pages Functions mirror of the same
  `/api/*` surface. Each route reads from D1 first and falls back to the bundled
  fixtures when D1 is empty or unbound.
- **`apps/ops-console/`** is the operator UI: React loaded via UMD plus
  babel-standalone (no build step). The same code runs static (`DEMO_MODE`) or
  against the backend. Routes include Generate, Evals, Agents, and Funnel.
- **`lib/evaluation/*`** is an eval harness (corpus, runner, comparator, masker,
  autofix) wired to `cli.ts eval:*` commands.

The ElevenLabs Sales Coach and Sarah Intake agents mount as ConvAI **widgets**
embedded in the console (Agents route, Evals lab, coach launcher) when the
`@elevenlabs/convai-widget-embed` script loads. If it cannot load (CSP, offline),
the container shows a fallback message and a deep link to the agent. These are
front-end embeds, not a backend voice pipeline in this repo.

## Running it

**Live mode** (Express backend):

```bash
bun install
bun run start            # Express on :3000, loopback by default
```

Generate from the CLI:

```bash
bun run generate <input.txt> <output_dir/>
```

PDF rendering needs Python with PyMuPDF (`pip install -r requirements.txt`).

**Static / DEMO_MODE** (no backend, fixture-driven UI):

```bash
cd apps/ops-console
python3 -m http.server 4173    # then open http://localhost:4173/console/
```

In `DEMO_MODE` every `/api/*` call falls through to JSON in
`apps/ops-console/fixtures/`. A "demo data" pill appears in the topbar when the
backend returns no historic runs. Append `?admin=1` to the `/console/` URL to
reveal admin-only agents.

## Tests

The suite is real: 65 Vitest unit files, 29 Playwright console specs, plus
PDF/report and integration tests.

```bash
bun run typecheck        # tsc --noEmit
bun run test:run         # Vitest unit tests
bun run test:console     # Playwright console UI suite
bun run test:e2e         # Playwright PDF/report suite
bun run eval:full        # run the eval corpus through lib/evaluation
```

CI runs static, unit, and console-e2e jobs on every PR
(`.github/workflows/test.yml`).

## Deploy (Cloudflare Pages)

`apps/ops-console/` deploys to Cloudflare Pages (project `gtm-ops`). Every
`/api/*` route is served by a Pages Function under `functions/api/*`, D1-backed
where bindings exist and falling back to fixtures otherwise. The `DEMO_MODE`
shim also intercepts `/api/*` client-side, so the site stays interactive with no
backend.

```bash
bun run deploy           # production
bun run deploy:preview   # preview branch
bun run pages:dev        # local CF Pages emulator
```

Config lives in `wrangler.toml`, `apps/ops-console/_headers`, and
`apps/ops-console/_redirects`. The full Express runtime (`bun run start`) is an
alternative when you need long-running streams or heavier PDF rendering than
Pages Functions allow.

## Layout

- `lib/`: pipeline, extraction, enrichment, pricing, PDF bridge, RBAC, audit,
  webhooks, GDPR, evaluation.
- `src/`: consolidated TypeScript transforms and the LLM service.
- `apps/ops-console/`: operator UI and its fixtures.
- `functions/api/`: Cloudflare Pages Functions mirror of `/api/*`.
- `templates/`, `tokens/`: branded PDF templates and design-token extracts.
- `tests/`: Vitest and Playwright suites.

The n8n workflow library is not duplicated here; it lives at
[`wranngle/n8n`](https://github.com/wranngle/n8n). The brand system spec lives in
[`DESIGN.md`](DESIGN.md); machine-readable extracts are in
[`tokens/`](tokens/).

## License

MIT. See [`LICENSE`](./LICENSE).
