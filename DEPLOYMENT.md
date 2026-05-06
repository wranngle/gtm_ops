# Deployment — gtm-ops.wranngle.com

The console + landing page deploy as a single Cloudflare Pages project named `gtm-ops`. CI is the source of truth (`bun run build` → `apps/ops-console`); the custom domain `gtm-ops.wranngle.com` is dashboard-attached and not declared in `wrangler.toml`.

## Custom domain attach (one-time, dashboard)

Required because Cloudflare Pages custom domains live as project-level settings, not in `wrangler.toml`:

1. Cloudflare dashboard → **Workers & Pages** → **gtm-ops** → **Custom domains** → **Set up a custom domain**.
2. Enter `gtm-ops.wranngle.com` and confirm. Cloudflare adds the CNAME on `wranngle.com` automatically because the zone is on the same account.
3. Wait for cert issuance (typically <2 min). Status flips from "Pending" to "Active".
4. Verify: `curl -I https://gtm-ops.wranngle.com/` returns `HTTP/2 200` and the cert SAN covers the host.

> **Hostname note:** the canonical host uses a hyphen (`gtm-ops`), not an underscore. Underscore subdomains are RFC 1035 invalid for HTTPS and Cloudflare will refuse to issue a cert. If "gtm_ops.wranngle.com" appears in any source it is a typo for `gtm-ops.wranngle.com`.

## What's been wired in code

- `apps/ops-console/index.html` canonical / og:url / og:image / twitter:image → `https://gtm-ops.wranngle.com/`.
- `apps/ops-console/assets/og-card.svg` watermark → `gtm-ops.wranngle.com`. After cert is live, re-rasterize:

  ```bash
  bun run scripts/render-og-card.mjs
  ```

- All HTML entry points (`/`, `/console/`, `/evaluation/`, `/eval-runs/`, `/404.html`) load `/assets/favicon.png` (matching `wranngle.com`) plus a 180×180 apple-touch-icon. The legacy SVG is kept as a manifest fallback for browsers that prefer it.
- `apps/ops-console/console/index.html` DEMO_MODE host detector still flags `*.pages.dev` so the `gtm-ops.pages.dev` mirror keeps the demo fixtures shim. The custom-domain host serves real data once D1 is bound.

## Pages → D1 / KV / Browser bindings

Unchanged from `wrangler.toml` header — operator runs `wrangler d1 create presales-d1`, `wrangler kv namespace create TEMPLATES`, enables Browser Rendering, then binds them in **Pages → gtm-ops → Settings → Functions → Bindings**.

## DNS sanity

Once attached, `wranngle.com` zone should show:

```
gtm-ops    CNAME    gtm-ops.pages.dev    (proxied)
```

Cloudflare creates this automatically when the custom domain is added through the dashboard.
