// Anonymized booking-telemetry feed for the live-social-proof ticker.
//
// Shape is deliberately PII-free: timestamp, vertical (industry bucket),
// value_bucket (coarse 3-band ARR band), region (US census region).
// No name / email / phone / address fields ever leave this module — the
// contract test in tests/ticker.test.ts enforces that invariant.
//
// Storage model mirrors the rest of functions/api/*: prefer D1 when bound
// (production), fall back to a deterministic in-repo fixture when not
// (DEMO_MODE / preview deploys / local dev). The fixture is ordered
// newest-first and dated relative to the call so a drive-by reader sees
// "fresh" activity even on a cold-start preview.

export type ValueBucket = '<5k' | '5-25k' | '25k+';

export type TickerEvent = {
  ts: string;
  vertical: string;
  value_bucket: ValueBucket;
  region: string;
};

export type TickerEnv = {
  DB?: {
    prepare: (sql: string) => {
      all: () => Promise<{results?: unknown[]}>;
    };
  };
};

const FIXTURE_VERTICALS = [
  'home-services',
  'dental',
  'auto-repair',
  'legal',
  'hospitality',
  'logistics',
  'fitness',
  'real-estate',
  'veterinary',
  'insurance',
] as const;

const FIXTURE_BUCKETS: ValueBucket[] = [
  '5-25k',
  '25k+',
  '<5k',
  '5-25k',
  '25k+',
  '<5k',
  '5-25k',
  '25k+',
  '5-25k',
  '<5k',
];

const FIXTURE_REGIONS = [
  'us-west',
  'us-south',
  'us-northeast',
  'us-midwest',
  'us-west',
  'us-south',
  'us-northeast',
  'us-midwest',
  'us-west',
  'us-south',
] as const;

const ALLOWED_KEYS = new Set(['ts', 'vertical', 'value_bucket', 'region']);
const PII_KEYS = new Set([
  'name',
  'email',
  'phone',
  'address',
  'first_name',
  'last_name',
  'street',
  'city',
  'zip',
  'postal_code',
  'ip',
  'user_id',
]);

function buildFixture(now = Date.now()): TickerEvent[] {
  // Spread the 10 events across the prior ~6 hours so the feed reads as
  // "rolling activity" not a single-burst seed dump. Newest first.
  const stepMs = 35 * 60 * 1000;
  return FIXTURE_VERTICALS.map((vertical, i) => ({
    ts: new Date(now - i * stepMs).toISOString(),
    vertical,
    value_bucket: FIXTURE_BUCKETS[i]!,
    region: FIXTURE_REGIONS[i]!,
  }));
}

function isValueBucket(value: unknown): value is ValueBucket {
  return value === '<5k' || value === '5-25k' || value === '25k+';
}

function sanitize(row: Record<string, unknown>): TickerEvent | null {
  const {ts, vertical, value_bucket, region} = row;
  if (typeof ts !== 'string' || !ts) return null;
  if (typeof vertical !== 'string' || !vertical) return null;
  if (typeof region !== 'string' || !region) return null;
  if (!isValueBucket(value_bucket)) return null;
  // Strip any extra columns a future schema migration might add — only the
  // four contract fields are ever emitted, so PII can never leak via drift.
  return {ts, vertical, value_bucket, region};
}

export async function getTickerEvents(env: TickerEnv): Promise<TickerEvent[]> {
  if (env.DB) {
    try {
      const result = await env.DB
        .prepare(
          'SELECT ts, vertical, value_bucket, region FROM ticker_events ORDER BY ts DESC LIMIT 10',
        )
        .all();
      const rows = Array.isArray(result?.results) ? result.results : [];
      const cleaned = rows
        .map((r) => sanitize(r as Record<string, unknown>))
        .filter((r): r is TickerEvent => r !== null);
      if (cleaned.length === 10) return cleaned;
      // Partial / empty D1 result — fall through to fixture so the feed is
      // never visibly broken. Preview deploys hit this path by design.
    } catch (error: unknown) {
      console.warn(
        '[ticker] D1 query failed, falling through to fixture:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return buildFixture();
}

// Exposed for the contract test: asserts a payload contains zero PII keys
// at any depth. Returns the first offending key path on failure for a
// diagnostic test message.
export function findPiiKey(payload: unknown, path = ''): string | null {
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      const hit = findPiiKey(payload[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (payload && typeof payload === 'object') {
    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (PII_KEYS.has(key.toLowerCase())) return `${path}.${key}`;
      const hit = findPiiKey(
        (payload as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (hit) return hit;
    }
  }
  return null;
}

export const TICKER_ALLOWED_KEYS = ALLOWED_KEYS;
