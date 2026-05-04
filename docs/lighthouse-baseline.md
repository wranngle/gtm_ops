# Lighthouse baseline — gtm-ops.pages.dev

> **⚠ Stale:** captured at commit `a2e5c27` (the production-app polish
> baseline). The repo has shipped substantial UI changes since — mobile
> responsive layout, focus management on every dialog, ARIA tabs, light
> + dark theme color-contrast token tier, reduced-motion support, print
> stylesheet, og:image switched to PNG, font-fallback hardening, ConvAI
> widget unreachability fallback. Re-run before quoting any number from
> this file in marketing or PR copy.

Re-run any time the landing surface changes; commit the new numbers
next to the old ones below.

## How to reproduce

```bash
CHROME_PATH=/home/wranngle/.cache/ms-playwright/chromium-1194/chrome-linux/chrome \
  npx lighthouse https://gtm-ops.pages.dev/ \
    --form-factor=mobile --screenEmulation.mobile \
    --output=json --output-path=/tmp/lh-mobile.json \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" \
    --only-categories=performance,accessibility,best-practices,seo

CHROME_PATH=/home/wranngle/.cache/ms-playwright/chromium-1194/chrome-linux/chrome \
  npx lighthouse https://gtm-ops.pages.dev/ \
    --preset=desktop \
    --output=json --output-path=/tmp/lh-desktop.json \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" \
    --only-categories=performance,accessibility,best-practices,seo
```

## 2026-05-03 — `/` landing page

| Category        | Mobile | Desktop |
| --------------- | -----: | ------: |
| Performance     |  89    |  98     |
| Accessibility   |  94    |  94     |
| Best Practices  | 100    | 100     |
| SEO             | 100    | 100     |

### Core web vitals

| Metric            | Mobile | Desktop |
| ----------------- | -----: | ------: |
| Largest Contentful Paint (LCP) | 3.0 s | 0.8 s |
| Cumulative Layout Shift (CLS)  | 0     | 0.013 |
| Total Blocking Time (TBT)      | 0 ms  | 0 ms  |
| First Contentful Paint (FCP)   | 3.0 s | 0.8 s |
| Speed Index                    | 3.0 s | 0.8 s |

### Notes

- LCP on mobile is dominated by Google Fonts loading. If we drop sub 3 s
  becomes desirable, self-host the Bricolage / Inter / JetBrains Mono
  WOFF2 files under `/assets/fonts/` and remove the `<link>` to fonts.googleapis.com.
- A11y was 94 at the captured date because the og:image was an inline
  SVG that triggered Lighthouse's "image without text alternative"
  heuristic. As of the changes since `a2e5c27`, og:image is a PNG
  with explicit `og:image:width`, `og:image:height`, and
  `twitter:image:alt` — that specific finding is no longer expected.
  The next re-run should clear it.
- CLS on desktop is 0.013, well under the 0.1 "good" threshold, driven
  by the hero pipeline card popping in after font load.
