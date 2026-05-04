/**
 * Fixture PII / secrets sweep — public repo + 70 shipped fixtures
 * means any accidental real name, phone number, email, or API key
 * commits as public artifact. This test runs three pattern scans on
 * every PR and fails on the first match. Synthetic domain whitelist
 * matches the cast of fixture companies (acme, banyan, helix, etc.).
 *
 * If a real test fixture legitimately needs a phone-number-shaped
 * value, add it to the SAFE_PHONE_PATTERNS allowlist with a comment.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Synthetic-only domains used in fixture data. Anything else looks like real PII.
const SYNTHETIC_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test', 'invalid', 'domain', 'placeholder',
  'wranngle.com', 'wranngle',
  // Synthetic company cast across fixtures.
  'acme.com', 'banyan.health', 'helix.io', 'arcadia-ins.com',
  'verdantlog.eu', 'kestrelbio.uk', 'lattice-optics.eu',
  'borealismining.ca', 'fernwood.ed', 'mosaicwealth.com',
  'sablefin.io', 'ironcladcement.com.br', 'thornfield.co',
  'helixrobotics.io', 'banyan.com', 'verdant.com', 'lanspeed.com',
  'northwind.test',
  // External SaaS that legitimately appears in pricing/integration metadata.
  'salesforce.com', 'hubspot.com', 'slack.com', 'gong.io',
  'snowflake.com', 'outreach.io', 'pipedrive.com',
]);

function listFiles(): string[] {
  // Fixture / examples / config trees that ship publicly.
  return [
    ...globSync('apps/ops-console/fixtures/**/*.{json,txt,md}', { cwd: root }),
    ...globSync('tests/fixtures/**/*.{json,txt,md}', { cwd: root }),
    ...globSync('examples/**/*.{json,txt,md}', { cwd: root }),
    ...globSync('config/**/*.{json,txt,md}', { cwd: root }),
  ];
}

describe('fixture PII / secrets sweep', () => {
  const files = listFiles();

  it('scans a non-trivial set of fixture files', () => {
    expect(files.length, 'no fixture files found — globs broken?').toBeGreaterThan(20);
  });

  it('no live-domain emails (only synthetic + SaaS allowlist)', () => {
    const offenders: string[] = [];
    const re = /([a-z0-9._-]+)@([a-z0-9.-]+\.(?:com|net|org|io|ai|co|app|edu|gov|uk|eu|ca|br|de|fr))/gi;
    // RFC 6761 reserves the entire example.* TLD space + .test / .invalid /
    // .localhost / .local as documentation-only. Anything ending in those
    // is by-definition synthetic.
    const isReservedSynthetic = (domain: string) => {
      if (domain === 'example' || domain.startsWith('example.')) return true;
      if (/\.(test|invalid|localhost|local|example)$/i.test(domain)) return true;
      return false;
    };
    for (const f of files) {
      const text = readFileSync(resolve(root, f), 'utf8');
      let m: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((m = re.exec(text))) {
        const domain = m[2].toLowerCase();
        if (SYNTHETIC_DOMAINS.has(domain)) continue;
        if (isReservedSynthetic(domain)) continue;
        // Also allow synthetic-cast domains via root-2-labels match.
        const root2 = domain.split('.').slice(-2).join('.');
        if (SYNTHETIC_DOMAINS.has(root2)) continue;
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders, `unexpected real-domain emails:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no US-shaped phone numbers in fixtures', () => {
    const offenders: string[] = [];
    // Match \+?1?-?(area)-(prefix)-(line) where area + prefix start with 2-9.
    // Only flags when surrounded by word boundaries to avoid false hits on
    // long numeric IDs. Allow 555-prefix as obviously-fake.
    const re = /\b([2-9]\d{2})[-. ]([2-9]\d{2})[-. ](\d{4})\b/g;
    for (const f of files) {
      const text = readFileSync(resolve(root, f), 'utf8');
      let m: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((m = re.exec(text))) {
        if (m[2].startsWith('555')) continue; // 555 prefix = fictitious by convention
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders, `phone-shaped values:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no API key / token patterns in fixtures', () => {
    const offenders: string[] = [];
    const re = /(sk-[a-zA-Z0-9]{20,}|pk_(?:live|test)_[a-zA-Z0-9]{20,}|AC[a-f0-9]{32}|gh[psoru]_[a-zA-Z0-9]{20,}|xoxb-[\d]+|xoxp-[\d]+|AKIA[0-9A-Z]{16}|aws_secret_access_key)/g;
    for (const f of files) {
      const text = readFileSync(resolve(root, f), 'utf8');
      let m: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((m = re.exec(text))) {
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders, `secret-shaped values:\n${offenders.join('\n')}`).toEqual([]);
  });
});
