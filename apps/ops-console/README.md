# ops-console

Vanilla HTML/JS operator UI for the `gtm_ops` runtime. No build system, no
bundler, no framework — open `index.html` in a browser or serve the directory
with any static file server.

## Two modes

### Static / DEMO_MODE (no backend)

When the page is loaded over `file://` *or* when `window.DEMO_MODE === true` is
set before script load, every `/api/*` fetch is rewritten to read fixture JSON
from `./fixtures/`. Mutating verbs (POST/PUT/DELETE) short-circuit to a synthetic
`{ ok: true, demo: true }` response; the UI is read-only in this mode.

Run it locally:

```sh
# from this directory
python -m http.server 8080
# then open http://localhost:8080
```

Or simply double-click `index.html` to open it directly via `file://`.

### Live mode (against `server.js`)

Point `server.js` at this directory's static assets and let `/api/*` calls hit
the real Express handlers in the parent repo:

```sh
# from gtm_ops/ root
bun run start
```

`server.js` serves the live runtime API; this directory's files are the
operator UI on top of it.

## Page index

| Path | What it is |
|---|---|
| `index.html` | Lead intake + proposal-pipeline dashboard (carried forward from `unified-presales-report/public/`, kept in sync with the live runtime UI) |
| `evaluation/index.html` | Evaluation runs review for the presales pipeline scoring |
| `eval-runs/index.html` | Voice-agent eval surface — reads `voice_ai_agent_evals/tests/runs/` output (or fixture in DEMO_MODE) |

## Fixtures

`fixtures/` holds synthetic JSON replacements for every `/api/*` endpoint the
UI consumes. All names, phone numbers, and prices are fictional. The DEMO_MODE
shim in each HTML page maps `/api/foo/123` → `./fixtures/foo/default.json`
(numeric path segments collapse to `default`) and `/api/foo` → `./fixtures/foo.json`.

If a fixture is missing, the shim returns `[]` so consumers don't throw.

## Tokens

`tokens/` is vendored from `gtm_ops/tokens/` (the canonical machine-readable
slice of the brand system). Do not edit here — edit `~/.dotfiles/DESIGN.md`,
re-extract via the dotfiles tooling, then re-vendor.

See `gtm_ops/DESIGN.md` for the long-form design system.

## Notes

- The previous Python/Streamlit operator console is preserved at
  `apps/ops-console-py-legacy/` for reference.
- The DEMO_MODE shim is per-page (small, self-contained block at the top of
  each HTML file). It overrides `window.fetch` and `window.EventSource` only
  when DEMO_MODE is detected — live mode is untouched.
