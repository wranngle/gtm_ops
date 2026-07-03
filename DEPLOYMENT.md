# Deployment — app.wranngle.com

The console + landing page deploy as a single Cloudflare Pages project named `gtm-ops`. CI is the source of truth (`bun run build` → `apps/ops-console`); the custom domain `app.wranngle.com` is dashboard-attached and not declared in `wrangler.toml`. The preview host stays `gtm-ops.pages.dev`.

> **Host history:** `gtm-ops.wranngle.com` was the original custom domain; it was superseded by `app.wranngle.com` (shorter, product-neutral). If `gtm-ops.wranngle.com` appears in any doc or asset it is stale — the code (canonical/og URLs, og-card watermark) already points at `app.wranngle.com`.

## Custom domain attach (one-time, dashboard)

Required because Cloudflare Pages custom domains live as project-level settings, not in `wrangler.toml`:

1. Cloudflare dashboard → **Workers & Pages** → **gtm-ops** → **Custom domains** → **Set up a custom domain**.
2. Enter `app.wranngle.com` and confirm. Cloudflare adds the CNAME on `wranngle.com` automatically because the zone is on the same account.
3. Wait for cert issuance (typically <2 min). Status flips from "Pending" to "Active".
4. Verify: `curl -I https://app.wranngle.com/` returns `HTTP/2 200` (well, `308` to `/console/` for the bare root — see `_redirects`) and the cert SAN covers the host.

> **Hostname note:** subdomains must use hyphens, never underscores. Underscore subdomains are RFC 1035 invalid for HTTPS and Cloudflare will refuse to issue a cert. If `gtm_ops.wranngle.com` appears in any source it is a typo.

## What's been wired in code

- `apps/ops-console/index.html` canonical / og:url / og:image / twitter:image → `https://app.wranngle.com/`.
- `apps/ops-console/assets/og-card.svg` watermark → `app.wranngle.com`. If the watermark changes, re-rasterize:

  ```bash
  bun run scripts/render-og-card.mjs
  ```

- All HTML entry points (`/`, `/console/`, `/evaluation/`, `/eval-runs/`, `/404.html`) load `/assets/favicon.png` (matching `wranngle.com`) plus a 180×180 apple-touch-icon. The legacy SVG is kept as a manifest fallback for browsers that prefer it.
- `apps/ops-console/console/index.html` DEMO_MODE host detector flags `*.pages.dev`, `file://`, and local static servers, so the `gtm-ops.pages.dev` mirror keeps the demo fixtures shim. `app.wranngle.com` is **not** a DEMO_MODE host: it serves live Pages Functions (D1-backed where bindings are configured, falling back to bundled fixtures otherwise).

## Pages → D1 / KV / Browser bindings

Unchanged from `wrangler.toml` header — operator runs `wrangler d1 create presales-d1`, then binds it in **Pages → gtm-ops → Settings → Functions → Bindings**. The TEMPLATES KV namespace and Browser Rendering steps listed there are forward-looking (no function code consumes them yet).

## DNS sanity

Once attached, the `wranngle.com` zone should show:

```
app    CNAME    gtm-ops.pages.dev    (proxied)
```

Cloudflare creates this automatically when the custom domain is added through the dashboard.
