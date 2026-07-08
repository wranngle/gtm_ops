import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichBusinessProfile, enrichPersonProfile, clearEnrichmentCache } from '../../lib/enrichment.js';

beforeEach(() => {
  clearEnrichmentCache();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[P0] enrichBusinessProfile', () => {
  it('returns input unchanged when no company_url', async () => {
    const profile = { industry: 'healthcare' };
    const result = await enrichBusinessProfile(profile);
    expect(result).toEqual(profile);
  });

  it('returns input unchanged when no API keys configured', async () => {
    delete process.env.N8N_ENRICHMENT_WEBHOOK_URL;
    delete process.env.PDL_API_KEY;
    delete process.env.ABSTRACT_API_KEY;
    delete process.env.ENRICH_SO_API_KEY;
    const profile = { company_url: 'https://example.com' };
    const result = await enrichBusinessProfile(profile);
    expect(result).toEqual(profile);
  });

  it('skips enrichment when profile already has 4+ fields', async () => {
    const profile = {
      company_name: 'Acme',
      company_url: 'https://acme.com',
      employee_count: 200,
      industry: 'tech',
      revenue_estimate: '$5M-10M',
    };
    const result = await enrichBusinessProfile(profile);
    expect(result.enrichment_source).toBe('manual');
  });

  it('calls n8n webhook when N8N_ENRICHMENT_WEBHOOK_URL is set', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://localhost:5678/webhook/enrich');
    const mockResponse = {
      company_name: 'Enriched Corp',
      employee_count: 300,
      industry: 'healthcare',
      tech_stack: ['Epic', 'Salesforce'],
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await enrichBusinessProfile({ company_url: 'https://example.com' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:5678/webhook/enrich',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.company_name).toBe('Enriched Corp');
    expect(result.employee_count).toBe(300);
    expect(result.enrichment_source).toBe('clay_n8n');
    expect(result.enriched_at).toBeDefined();
  });

  it('falls back to PDL when n8n webhook fails', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://bad-url');
    vi.stubEnv('PDL_API_KEY', 'test-pdl-key');

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'PDL Corp',
          employee_count: 150,
          industry: 'technology',
          tags: ['react', 'node'],
        }),
      } as any);

    const result = await enrichBusinessProfile({ company_url: 'https://example.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.company_name).toBe('PDL Corp');
    expect(result.enrichment_source).toBe('pdl');
  });

  it('falls back to Abstract API when n8n and PDL fail', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://bad-url');
    vi.stubEnv('PDL_API_KEY', 'test-pdl-key');
    vi.stubEnv('ABSTRACT_API_KEY', 'test-abstract-key');

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('n8n down'))
      .mockResolvedValueOnce({ ok: false } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          company_name: 'Abstract Corp',
          employee_count: '250',
          industry: 'fintech',
          technologies: ['React', 'Node.js'],
          revenue_range: '$10M-50M',
        }),
      } as any);

    const result = await enrichBusinessProfile({ company_url: 'https://example.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.company_name).toBe('Abstract Corp');
    expect(result.employee_count).toBe(250);
    expect(result.industry).toBe('fintech');
    expect(result.tech_stack).toEqual(['React', 'Node.js']);
    expect(result.revenue_estimate).toBe('$10M-50M');
    expect(result.enrichment_source).toBe('abstract');
  });

  it('falls back to Enrich.so when all others fail', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://bad-url');
    vi.stubEnv('PDL_API_KEY', 'test-pdl-key');
    vi.stubEnv('ABSTRACT_API_KEY', 'test-abstract-key');
    vi.stubEnv('ENRICH_SO_API_KEY', 'test-enrich-so-key');

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('n8n down'))
      .mockResolvedValueOnce({ ok: false } as any)
      .mockResolvedValueOnce({ ok: false } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            name: 'EnrichSo Corp',
            staff: { total: 420 },
            industries: ['Healthcare', 'SaaS'],
            revenue_range: '$50M-100M',
          },
        }),
      } as any);

    const result = await enrichBusinessProfile({ company_url: 'https://example.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(result.company_name).toBe('EnrichSo Corp');
    expect(result.employee_count).toBe(420);
    expect(result.industry).toBe('Healthcare');
    expect(result.revenue_estimate).toBe('$50M-100M');
    expect(result.enrichment_source).toBe('enrich_so');
  });

  it('Abstract API parses employee_count string to number', async () => {
    vi.stubEnv('ABSTRACT_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        company_name: 'Parsed Corp',
        employee_count: '1500',
        industry: 'tech',
      }),
    } as any);

    const result = await enrichBusinessProfile({ company_url: 'https://example.com' });
    expect(result.employee_count).toBe(1500);
    expect(typeof result.employee_count).toBe('number');
  });

  it('Enrich.so handles flat response without data wrapper', async () => {
    vi.stubEnv('ENRICH_SO_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Flat Corp',
        employee_count: 80,
        industry: 'retail',
      }),
    } as any);

    const result = await enrichBusinessProfile({ company_url: 'https://example.com' });
    expect(result.company_name).toBe('Flat Corp');
    expect(result.employee_count).toBe(80);
    expect(result.industry).toBe('retail');
  });

  it('provided fields win over enriched data', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://localhost:5678/webhook/enrich');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        company_name: 'Enriched Name',
        industry: 'enriched_industry',
        employee_count: 999,
      }),
    } as any);

    const result = await enrichBusinessProfile({
      company_url: 'https://example.com',
      industry: 'healthcare',
    });

    expect(result.industry).toBe('healthcare');
    expect(result.company_name).toBe('Enriched Name');
  });

  it('merges tech_stack arrays without duplicates', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://localhost:5678/webhook/enrich');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tech_stack: ['Salesforce', 'HubSpot', 'Slack'],
      }),
    } as any);

    const result = await enrichBusinessProfile({
      company_url: 'https://example.com',
      tech_stack: ['Salesforce', 'Notion'],
    });

    expect(result.tech_stack).toEqual(['Salesforce', 'Notion', 'HubSpot', 'Slack']);
  });

  it('returns input on fetch error', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://bad-url');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));

    const profile = { company_url: 'https://example.com' };
    const result = await enrichBusinessProfile(profile);

    expect(result).toEqual(profile);
  });

  it('caches results for same domain', async () => {
    vi.stubEnv('N8N_ENRICHMENT_WEBHOOK_URL', 'http://localhost:5678/webhook/enrich');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ company_name: 'Cached Corp', employee_count: 50 }),
    } as any);

    await enrichBusinessProfile({ company_url: 'https://example.com' });
    await enrichBusinessProfile({ company_url: 'https://example.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Abstract API sends api_key as query param, not header', async () => {
    vi.stubEnv('ABSTRACT_API_KEY', 'my-secret-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ company_name: 'Test' }),
    } as any);

    await enrichBusinessProfile({ company_url: 'https://example.com' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('api_key=my-secret-key');
    expect(calledUrl).toContain('domain=example.com');
    expect(calledUrl).toContain('companyenrichment.abstractapi.com');
  });

  it('Enrich.so sends Bearer token in Authorization header', async () => {
    vi.stubEnv('ENRICH_SO_API_KEY', 'my-bearer-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'Test' }),
    } as any);

    await enrichBusinessProfile({ company_url: 'https://example.com' });

    const calledOptions = fetchSpy.mock.calls[0][1] as any;
    expect(calledOptions.headers.Authorization).toBe('Bearer my-bearer-token');
  });
});

describe('[P1] enrichPersonProfile', () => {
  it('returns input unchanged when no signals', async () => {
    const profile = { seniority: 'mid' };
    const result = await enrichPersonProfile(profile);
    expect(result).toEqual(profile);
  });

  it('calls PDL person API with email signal', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        full_name: 'Jane Doe',
        job_title: 'VP of Operations',
        job_title_levels: ['vp'],
        job_company_name: 'Acme Corp',
        work_email: 'jane@acme.com',
        likelihood: 85,
      }),
    } as any);

    const result = await enrichPersonProfile({ contact_email: 'jane@acme.com' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/v5/person/enrich');
    expect(calledUrl).toContain('email=jane%40acme.com');
    expect(result.contact_name).toBe('Jane Doe');
    expect(result.contact_title).toBe('VP of Operations');
    expect(result.seniority).toBe('executive');
    expect(result.enrichment_source).toBe('pdl');
    expect(result.confidence_score).toBe(85);
  });

  it('calls PDL with name+company when no email', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        full_name: 'John Smith',
        job_title: 'Operations Manager',
        work_email: 'jsmith@example.com',
      }),
    } as any);

    const result = await enrichPersonProfile({
      contact_name: 'John Smith',
      company_name: 'Example Corp',
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('name=John+Smith');
    expect(calledUrl).toContain('company=Example+Corp');
    expect(result.contact_email).toBe('jsmith@example.com');
  });

  it('skips enrichment when 3+ fields populated', async () => {
    const profile = {
      contact_email: 'jane@example.com',
      contact_name: 'Jane Doe',
      contact_title: 'VP Operations',
    };
    const result = await enrichPersonProfile(profile);
    expect(result.enrichment_source).toBe('manual');
  });

  it('provided fields win over enriched data', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        full_name: 'Wrong Name',
        job_title: 'Wrong Title',
      }),
    } as any);

    const result = await enrichPersonProfile({
      contact_email: 'jane@example.com',
      contact_title: 'VP Operations',
    });

    expect(result.contact_title).toBe('VP Operations');
    expect(result.contact_name).toBe('Wrong Name');
  });

  it('maps PDL seniority levels correctly', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');

    const testCases = [
      { levels: ['cxo'], expected: 'c_suite' },
      { levels: ['owner'], expected: 'c_suite' },
      { levels: ['vp'], expected: 'executive' },
      { levels: ['director'], expected: 'executive' },
      { levels: ['senior'], expected: 'senior' },
      { levels: ['manager'], expected: 'mid' },
      { levels: ['entry'], expected: 'entry' },
    ];

    for (const { levels, expected } of testCases) {
      clearEnrichmentCache();
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_title_levels: levels }),
      } as any);

      const result = await enrichPersonProfile({ contact_email: `test-${expected}@example.com` });
      expect(result.seniority).toBe(expected);
    }
  });

  it('falls back to Enrich.so when PDL fails', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');
    vi.stubEnv('ENRICH_SO_API_KEY', 'test-enrich-key');

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('PDL down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            full_name: 'Enrich Person',
            title: 'Director of Sales',
            email: 'enriched@example.com',
          },
        }),
      } as any);

    const result = await enrichPersonProfile({ contact_email: 'test@example.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.contact_name).toBe('Enrich Person');
    expect(result.contact_title).toBe('Director of Sales');
    expect(result.enrichment_source).toBe('enrich_so');
  });

  it('caches results for same email', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ full_name: 'Cached Person' }),
    } as any);

    await enrichPersonProfile({ contact_email: 'cached@example.com' });
    await enrichPersonProfile({ contact_email: 'cached@example.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns input when all providers fail', async () => {
    vi.stubEnv('PDL_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('all down'));

    const profile = { contact_email: 'test@example.com' };
    const result = await enrichPersonProfile(profile);
    expect(result).toEqual(profile);
  });
});
