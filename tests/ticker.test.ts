// Contract test for the anonymized ticker telemetry feed.
//
// The feed's central promise is "10 anonymized booking events, no PII, ever".
// These tests assert that contract end-to-end: shape, count, bucket domain,
// and PII absence — both on the happy fixture path and on the D1 failure
// fall-through path that a preview deploy hits.

import {describe, expect, it} from 'vitest';
import {findPiiKey, getTickerEvents, TICKER_ALLOWED_KEYS} from '../lib/ticker.js';

const VALUE_BUCKETS = new Set(['<5k', '5-25k', '25k+']);

describe('ticker telemetry contract', () => {
  it('returns exactly 10 events in DEMO_MODE (no DB binding)', async () => {
    const events = await getTickerEvents({});
    expect(events).toHaveLength(10);
  });

  it('every event has the four required keys and nothing else', async () => {
    const events = await getTickerEvents({});
    for (const event of events) {
      const keys = Object.keys(event);
      expect(keys.length).toBe(TICKER_ALLOWED_KEYS.size);
      for (const key of keys) {
        expect(TICKER_ALLOWED_KEYS.has(key)).toBe(true);
      }
      expect(typeof event.ts).toBe('string');
      expect(() => new Date(event.ts).toISOString()).not.toThrow();
      expect(typeof event.vertical).toBe('string');
      expect(event.vertical.length).toBeGreaterThan(0);
      expect(VALUE_BUCKETS.has(event.value_bucket)).toBe(true);
      expect(typeof event.region).toBe('string');
      expect(event.region.length).toBeGreaterThan(0);
    }
  });

  it('payload contains zero PII keys at any depth', async () => {
    const events = await getTickerEvents({});
    const offender = findPiiKey(events);
    expect(offender, `unexpected PII key at ${offender}`).toBeNull();
  });

  it('explicitly rejects name, email, phone, address keys via findPiiKey', () => {
    expect(findPiiKey([{name: 'Alice'}])).not.toBeNull();
    expect(findPiiKey([{email: 'a@b.co'}])).not.toBeNull();
    expect(findPiiKey([{phone: '555-1234'}])).not.toBeNull();
    expect(findPiiKey([{address: '1 Main St'}])).not.toBeNull();
    expect(findPiiKey([{nested: {first_name: 'Bob'}}])).not.toBeNull();
  });

  it('falls through to fixture when D1 throws', async () => {
    const env = {
      DB: {
        prepare() {
          return {
            async all(): Promise<{results?: unknown[]}> {
              throw new Error('simulated D1 outage');
            },
          };
        },
      },
    };
    const events = await getTickerEvents(env);
    expect(events).toHaveLength(10);
    expect(findPiiKey(events)).toBeNull();
  });

  it('falls through to fixture when D1 returns fewer than 10 rows', async () => {
    const env = {
      DB: {
        prepare() {
          return {
            async all(): Promise<{results?: unknown[]}> {
              return {
                results: [
                  {
                    ts: '2026-05-14T00:00:00.000Z',
                    vertical: 'dental',
                    value_bucket: '5-25k',
                    region: 'us-west',
                  },
                ],
              };
            },
          };
        },
      },
    };
    const events = await getTickerEvents(env);
    expect(events).toHaveLength(10);
  });

  it('uses D1 rows when exactly 10 valid rows are returned', async () => {
    const rows = Array.from({length: 10}, (_, i) => ({
      ts: new Date(2026, 4, 14, 12, -i * 5).toISOString(),
      vertical: 'logistics',
      value_bucket: '25k+',
      region: 'us-midwest',
    }));
    const env = {
      DB: {
        prepare() {
          return {
            async all(): Promise<{results?: unknown[]}> {
              return {results: rows};
            },
          };
        },
      },
    };
    const events = await getTickerEvents(env);
    expect(events).toHaveLength(10);
    expect(events.every((event) => event.vertical === 'logistics')).toBe(true);
    expect(findPiiKey(events)).toBeNull();
  });

  it('strips extra columns from D1 rows so a future schema add cannot leak', async () => {
    const rows = Array.from({length: 10}, () => ({
      ts: '2026-05-14T00:00:00.000Z',
      vertical: 'dental',
      value_bucket: '<5k',
      region: 'us-south',
      // Schema-drift simulation: a future migration adds these columns.
      name: 'Should Never Leak',
      email: 'leak@example.com',
    }));
    const env = {
      DB: {
        prepare() {
          return {
            async all(): Promise<{results?: unknown[]}> {
              return {results: rows};
            },
          };
        },
      },
    };
    const events = await getTickerEvents(env);
    expect(events).toHaveLength(10);
    expect(findPiiKey(events)).toBeNull();
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(
        ['region', 'ts', 'value_bucket', 'vertical'],
      );
    }
  });
});
