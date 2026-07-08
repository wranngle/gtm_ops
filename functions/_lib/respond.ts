// Shared response shape + D1-with-fixture-fallback for every ported route.
// Fallback model: try D1 → if unbound / empty / throws, return the bundled
// fixture. Keeps preview deploys observably "live when D1 has data, demo
// when it doesn't" with no 500s in front of the user.

export type Env = {
  DB?: D1Database;
  // Pages-provided static asset binding (always present on deployed Pages;
  // optional here for local test harnesses). Used by the /api catch-all to
  // serve fixture fallbacks on preview hosts.
  ASSETS?: Fetcher;
  // Forward-looking bindings from the wrangler.toml operator steps — typed so
  // the dashboard wiring compiles the day a consumer lands; nothing reads
  // TEMPLATES or BROWSER yet.
  TEMPLATES?: KVNamespace;
  BROWSER?: Fetcher;
  GEMINI_API_KEY?: string;
  N8N_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGIN?: string;
  // Cloudflare Pages auto-injected build metadata. Surfaced via /api/health
  // so operators can correlate "what's deployed" with bug reports.
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_BRANCH?: string;
  CF_PAGES_URL?: string;
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...securityHeaders,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

// tryD1: returns the query result if D1 is bound AND returns a non-empty
// shape, else null. Catches every error path so fixture fallback always
// runs. The truthiness check is shape-aware: arrays must have ≥1 entry,
// objects must have ≥1 key.
export async function tryD1<T>(
  db: D1Database | undefined,
  query: (db: D1Database) => Promise<T>,
): Promise<T | null> {
  if (!db) return null;
  try {
    const result = await query(db);
    if (result === null || result === undefined) return null;
    if (Array.isArray(result) && result.length === 0) return null;
    if (
      typeof result === 'object' &&
      !Array.isArray(result) &&
      Object.keys(result as Record<string, unknown>).length === 0
    ) {
      return null;
    }

    return result;
  } catch (error: unknown) {
    console.warn(
      '[tryD1] query failed, falling through to fixture:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
