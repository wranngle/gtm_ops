/**
 * Unit tests for BrandingManager.verifyCustomDomain — the DNS-backed custom
 * domain verification wired in when /api/branding/domain/verify stopped being
 * a mock that could never verify. Resolvers are injected (providers boundary),
 * so no network is touched; persistence goes through the real custom_domains
 * lifecycle in a per-test tmpdir DB.
 */
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let BrandingManager: any;
let DomainStatus: any;
let branding: any;

beforeEach(async () => {
  const module = await import('../../lib/branding.js');
  BrandingManager = module.BrandingManager;
  DomainStatus = module.DomainStatus;
  branding = new BrandingManager(
    path.join(
      os.tmpdir(),
      `branding_domain_verify_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
    )
  );
});

afterEach(async () => {
  if (branding) {
    await branding.close();
  }
});

const resolversFor = (txtValue: string | null, cnameValue: string | null) => ({
  async resolveTxt(_name: string) {
    if (txtValue === null) {
      throw Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    return [[txtValue]];
  },
  async resolveCname(_name: string) {
    if (cnameValue === null) {
      throw Object.assign(new Error('queryCname ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    return [cnameValue];
  },
});

describe('[P0] BrandingManager.verifyCustomDomain', () => {
  it('[P0] verifies and persists VERIFIED when TXT token and CNAME both match', async () => {
    const registration = await branding.addCustomDomain('ws_1', 'client.example.com');
    const result = await branding.verifyCustomDomain(
      'ws_1',
      'client.example.com',
      resolversFor(registration.verification_token, 'app.wranngle.com.')
    );

    expect(result.verified).toBe(true);
    expect(result.status).toBe(DomainStatus.VERIFIED);
    expect(result.checks.txt.ok).toBe(true);
    expect(result.checks.cname.ok).toBe(true);

    const row = await branding.getCustomDomain('ws_1');
    expect(row.status).toBe(DomainStatus.VERIFIED);
    expect(row.verified_at).toBeTruthy();
  });

  it('[P0] stays pending when the TXT record is missing (NXDOMAIN is a pending check, not an error)', async () => {
    const result = await branding.verifyCustomDomain(
      'ws_1',
      'client.example.com',
      resolversFor(null, 'app.wranngle.com')
    );

    expect(result.verified).toBe(false);
    expect(result.status).toBe(DomainStatus.PENDING);
    expect(result.checks.txt.ok).toBe(false);
    expect(result.checks.cname.ok).toBe(true);
    expect(result.instructions.txt.name).toBe('_wranngle-verify.client.example.com');
    expect(result.instructions.cname.value).toBe('app.wranngle.com');
  });

  it('[P0] rejects a wrong TXT token', async () => {
    const result = await branding.verifyCustomDomain(
      'ws_1',
      'client.example.com',
      resolversFor('wrn-wrong-token', 'app.wranngle.com')
    );
    expect(result.verified).toBe(false);
    expect(result.checks.txt.ok).toBe(false);
  });

  it('[P1] auto-registers unknown domains (idempotent add) and normalizes case', async () => {
    const result = await branding.verifyCustomDomain('ws_1', 'Fresh.Example.COM', resolversFor(null, null));
    expect(result.success).toBe(true);
    expect(result.domain).toBe('fresh.example.com');
    expect(result.verification_token).toBeTruthy();

    const row = await branding.getCustomDomain('ws_1');
    expect(row.domain).toBe('fresh.example.com');
    expect(row.status).toBe(DomainStatus.PENDING);
  });

  it('[P1] refuses a domain registered to another workspace', async () => {
    await branding.addCustomDomain('ws_1', 'client.example.com');
    const result = await branding.verifyCustomDomain('ws_2', 'client.example.com', resolversFor(null, null));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/another workspace/);
  });

  it('[P1] does not downgrade a VERIFIED domain on a later transient DNS miss', async () => {
    const registration = await branding.addCustomDomain('ws_1', 'client.example.com');
    await branding.verifyCustomDomain(
      'ws_1',
      'client.example.com',
      resolversFor(registration.verification_token, 'app.wranngle.com')
    );

    const later = await branding.verifyCustomDomain('ws_1', 'client.example.com', resolversFor(null, null));
    expect(later.verified).toBe(true);
    expect(later.status).toBe(DomainStatus.VERIFIED);
  });
});
