# ops-console

Operator UI for the `gtm_ops` runtime. Three surfaces ship here, all backed
by the same fixture / Pages-Functions / Express live-mode contract:

| Path | Surface | Stack |
|---|---|---|
| `index.html` | Public landing page (Get-a-real-run lead form) | Vanilla HTML + inline JS |
| `console/` | Main operator UI — home, pipeline, calls, proposals, evals with a contextual ElevenLabs regression lab, **agents** (live ElevenLabs ConvAI playgrounds for Sales Coach + Sarah Intake), settings, generate | React 18 (UMD + babel-standalone, no build step) |
| `evaluation/` | Compatibility redirect into `/console/?route=evals` so evals stay inside the console shell | HTML bridge |
| `eval-runs/` | Per-run harness output surface | Vanilla HTML + inline JS |

A 404.html ships at the root. Every entrypoint pulls brand colors and
type from the shared `tokens/` extracts.

## Three modes

The same UI runs against three different backends. The DEMO_MODE shim in
each HTML page swaps live fetches for fixture reads when no backend is
reachable, so the static deploy stays interactive.

### 1. Static / DEMO_MODE (no backend)

When the page loads from `file://`, from a `*.pages.dev` host, or with
`window.DEMO_MODE === true` set before script load, every `/api/*` fetch
is rewritten to read fixture JSON from `./fixtures/`. Mutating verbs
(POST/PUT/DELETE) short-circuit to `{ ok: true, demo: true }`; the UI
is read-only.

Run it locally:

```sh
# from this directory
python3 -m http.server 4173
# then open http://localhost:4173/console/
```

### 2. Cloudflare Pages — full-stack

Pages Functions under `gtm_ops/functions/api/*` serve `/api/*` directly,
backed by D1 where bindings are configured and falling back to the
bundled fixtures otherwise. See `gtm_ops/wrangler.toml` for the operator
setup steps and `gtm_ops/.github/workflows/test.yml` for CI gates.

### 3. Local Express (legacy live mode)

```sh
# from gtm_ops/ root
bun run start
```

`server.ts` exposes `/api/*` and serves this directory's static files.
Useful when you need long-running streams, native binary deps, or
big-memory PDF rendering that Pages Functions can't easily host.

## ElevenLabs ConvAI integration

The coach launcher, `/console/agents`, and `/console/evals` regression lab
mount live ElevenLabs ConvAI widgets for the Sales Coach and Sarah Intake
agents. Agent IDs and surface bindings live in `console/agents-registry.js`.
The widget script is loaded lazily from
`unpkg.com/@elevenlabs/convai-widget-embed`; if that load is blocked
(strict CSP, corporate firewall) the widget container renders a local
recovery panel that opens the in-console agent admin. The only external
ElevenLabs dashboard escape hatch lives under Settings → Integrations →
ElevenLabs after the local wrapper is surfaced.

Append `?admin=1` to the `/console/` URL to reveal admin-only agents.

## Fixtures

`fixtures/` holds synthetic JSON replacements for every `/api/*` endpoint
the UI consumes. All names, phone numbers, and prices are fictional —
guarded by `gtm_ops/tests/unit/fixture-pii.test.ts` on every PR.

The DEMO_MODE shim in each HTML page maps `/api/foo/123` →
`./fixtures/foo/default.json` (numeric or snake-case path segments
collapse to `default`) and `/api/foo` → `./fixtures/foo.json`. If a
fixture is missing, the shim returns `[]` so consumers don't throw.

## Tokens

`tokens/` is vendored from the repo-root `tokens/` directory (the
canonical machine-readable slice of the brand system). Do not edit
here — edit `DESIGN.md` at the repo root, re-extract the token set,
then re-vendor.

See `gtm_ops/DESIGN.md` for the long-form design system.

## Notes

- The DEMO_MODE shim is per-page (small, self-contained block at the
  top of each HTML file). It overrides `window.fetch` and
  `window.EventSource` only when DEMO_MODE is detected — live mode
  is untouched.
- The React console has no build step. JSX is transpiled in-browser
  via babel-standalone for ergonomics; this trades ~3 MB of bundle
  weight for zero build infrastructure. React itself ships as the
  production-min UMD build.
