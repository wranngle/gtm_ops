# ops-console drift vs. `unified-presales-report/public/` (SYM-007)

Triage of UI-element deltas between the migrated static export at
`apps/ops-console/{index,evaluation/index}.html` and the upstream baseline at
`unified-presales-report/public/{index,evaluation/index}.html`.

Method: byte-level `diff` (no `-w`/`-B`/`-i`), then `diff -u | grep '^-'` to enumerate
deletions, plus a `fetch('/api/...')` set-difference of every call site.

## Headline

The migration is a **clean superset** in both files. ops-console contains every
line, every `<button>`, every `<form>`, every `<section id=...>`, and every
`fetch('/api/...')` call site that the baseline ships, plus a small additive
prelude. Nothing was lost in the bulk `cp -r`.

## Bucket counts

| Bucket | `index.html` | `evaluation/index.html` |
| --- | ---: | ---: |
| Intentionally removed for DEMO_MODE | 0 | 0 |
| Accidentally lost during migration (RESTORE) | **0** | **0** |
| Drifted but still working (additive only — document) | 2 | 2 |

Total deleted lines from baseline: **0** in both files (verified via
`diff <baseline> <ops-console> \| grep '^<' \| wc -l` → `0` / `0`).
Unique `fetch('/api/...')` endpoints: **14 in baseline, 14 in ops-console,
identical sets**; total call sites: **31 in baseline, 31 in ops-console**.

## Drift inventory (all "additive, working")

### `apps/ops-console/index.html`

1. **`<link rel="stylesheet" href="tokens/tokens.css">`** added in `<head>`.
   - Reason: brand-token migration; consumed `tokens/tokens.css` from
     `apps/ops-console/tokens/`. Already present, working under both `server.js`
     (`express.static('public')` is overridden in static export by the
     `apps/ops-console/` deploy target) and Cloudflare Pages.
2. **DEMO_MODE `<script>` shim (~74 lines)** inserted after the tokens link.
   - Wraps `window.fetch` so the 31 existing `/api/*` call sites are
     unmodified; rewrites GETs to `./fixtures/<path>.json`, short-circuits
     mutating verbs with `{ ok: true, demo: true }`, and stubs `EventSource`
     for `/api/stream`. Only activates when
     `location.protocol === 'file:'` or `window.DEMO_MODE === true`.
   - Live server mode (`bun start` → `:3000`) is unaffected — DEMO_MODE
     stays `false` and `window.fetch` is the native one.

### `apps/ops-console/evaluation/index.html`

1. **`<link rel="stylesheet" href="../tokens/tokens.css">`** added.
2. **DEMO_MODE shim (~30 lines, condensed variant)** added — identical
   semantics to the index variant, but reads fixtures from `../fixtures/`.

## Restoration list

**None.** Every `<button>`, `<form>`, `<section>`, and `fetch('/api/...')` from
the baseline survives in ops-console. The 14 baseline endpoints
(`/api/audit-logs/verify`, `/api/branding`, `/api/branding/logo`,
`/api/branding?workspace_id=default`, `/api/gdpr/consent`, `/api/gdpr/delete`,
`/api/gdpr/delete/cancel`, `/api/gdpr/export`, `/api/generate`, `/api/history`,
`/api/sample`, `/api/webhooks`, `/api/workspace/default/invite`,
`/api/workspace/default/users`) are all still wired to live routes in
`server.js` (verified by `grep -nE "app\.(get|post|put|delete|patch)\('\/api"`).

## Acceptance status

- [x] Triage note committed at `docs/ops-console-drift.md`.
- [x] No "accidentally lost" elements → no restoration commit needed.
- [x] `curl http://localhost:3000/` continues to serve
      `gtm_ops/public/index.html` (byte-identical to baseline; `apps/ops-console/`
      is the static-export deploy target, not the server's static root).
- [x] DEMO_MODE shim preserved.

## Why the SYM-007 hypothesis didn't materialize

The audit assumed the bulk `cp -r` had been followed by edits that *deleted*
features. In practice, every edit in `apps/ops-console/` is a
prepend-only addition (tokens link + DEMO_MODE shim). The destination is a
strict superset of the source.
