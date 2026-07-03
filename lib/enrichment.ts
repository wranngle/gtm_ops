// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Business Profile Enrichment Service
 *
 * Provider-agnostic enrichment with waterfall chain:
 * 1. n8n + Clay webhook (if N8N_ENRICHMENT_WEBHOOK_URL set)
 * 2. People Data Labs (if PDL_API_KEY set) — 100 free calls/mo
 * 3. Abstract API (if ABSTRACT_API_KEY set) — 100 free calls/mo
 * 4. Enrich.so (if ENRICH_SO_API_KEY set) — 25 free credits on signup
 *
 * All providers are optional. Without API keys, returns input unchanged.
 */

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

/**
 * Enrich a business profile from company_url using available providers.
 * Provided fields always win over enriched data.
 * @param {Partial<import('./schemas/business-profile.schema.js').BusinessProfile>} profile
 * @returns {Promise<Partial<import('./schemas/business-profile.schema.js').BusinessProfile>>}
 */
export async function enrichBusinessProfile(profile) {
  if (!profile?.company_url) return profile;

  const populatedFields = [
    profile.company_name,
    profile.employee_count,
    profile.industry,
    profile.revenue_estimate,
    profile.tech_stack?.length > 0 ? true : null,
    profile.funding_stage,
  ].filter(Boolean).length;

  if (populatedFields >= 4) return { ...profile, enrichment_source: 'manual' };

  const domain = extractDomain(profile.company_url);
  if (!domain) return profile;

  const cached = cache.get(domain);
  if (cached) return mergeProfiles(cached, profile);

  const enriched = await tryProviders(domain);
  if (!enriched) return profile;

  cache.set(domain, enriched);
  setTimeout(() => cache.delete(domain), CACHE_TTL);

  return mergeProfiles(enriched, profile);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function tryProviders(domain) {
  // 1. n8n + Clay webhook
  const n8nUrl = process.env.N8N_ENRICHMENT_WEBHOOK_URL;
  if (n8nUrl) {
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET;
    if (!n8nSecret) {
      // Secret is recommended (the receiving n8n workflow should validate it
      // via X-Webhook-Secret) but not strictly required — calling the webhook
      // is still useful in dev/test where the n8n instance may be unsecured.
      // Warn loudly so prod operators notice; do not block the call.
      console.warn(
        'N8N_ENRICHMENT_WEBHOOK_URL is set but N8N_WEBHOOK_SECRET is missing; calling without auth header. Set N8N_WEBHOOK_SECRET in production.'
      );
    }
    const headers = { 'Content-Type': 'application/json' };
    if (n8nSecret) headers['X-Webhook-Secret'] = n8nSecret;
    const result = await fetchWithTimeout(n8nUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ domain }),
    });
    if (result) return { ...mapN8nResponse(result), enrichment_source: 'clay_n8n' };
  }

  // 2. People Data Labs
  const pdlKey = process.env.PDL_API_KEY;
  if (pdlKey) {
    const url = `https://api.peopledatalabs.com/v5/company/enrich?website=${encodeURIComponent(domain)}`;
    const result = await fetchWithTimeout(url, {
      headers: { 'X-Api-Key': pdlKey },
    });
    if (result) return { ...mapPdlResponse(result), enrichment_source: 'pdl' };
  }

  // 3. Abstract API
  const abstractKey = process.env.ABSTRACT_API_KEY;
  if (abstractKey) {
    const url = `https://companyenrichment.abstractapi.com/v2/?api_key=${encodeURIComponent(abstractKey)}&domain=${encodeURIComponent(domain)}`;
    const result = await fetchWithTimeout(url);
    if (result) return { ...mapAbstractResponse(result), enrichment_source: 'abstract' };
  }

  // 4. Enrich.so
  const enrichSoKey = process.env.ENRICH_SO_API_KEY;
  if (enrichSoKey) {
    const url = `https://api.enrich.so/v1/api/company?domain=${encodeURIComponent(domain)}`;
    const result = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${enrichSoKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (result) return { ...mapEnrichSoResponse(result), enrichment_source: 'enrich_so' };
  }

  return null;
}

async function fetchWithTimeout(url, options = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[Enrichment] Fetch failed: ${err.message}`);
    return null;
  }
}

function mapN8nResponse(data) {
  return {
    company_name: data.company_name || data.name || undefined,
    employee_count: typeof data.employee_count === 'number' ? data.employee_count : (typeof data.employees === 'number' ? data.employees : undefined),
    industry: data.industry || undefined,
    tech_stack: Array.isArray(data.tech_stack) ? data.tech_stack : (Array.isArray(data.technologies) ? data.technologies : []),
    revenue_estimate: data.revenue_estimate || data.revenue || undefined,
    funding_stage: data.funding_stage || data.funding || undefined,
  };
}

function parsePdlEmployeeCount(data) {
  if (typeof data.employee_count === 'number') return data.employee_count;
  const size = data.size ?? data.employee_count;
  if (typeof size === 'string') {
    const match = size.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (match) return Math.round((Number(match[1]) + Number(match[2])) / 2);
    const single = Number.parseInt(size, 10);
    if (Number.isFinite(single)) return single;
  }
  return undefined;
}

function parsePdlIndustry(data) {
  if (data.naics?.[0]?.sector) return data.naics[0].sector;
  return data.industry || undefined;
}

function mapPdlResponse(data) {
  return {
    company_name: data.display_name || data.name || undefined,
    employee_count: parsePdlEmployeeCount(data),
    industry: parsePdlIndustry(data),
    tech_stack: Array.isArray(data.tags) ? data.tags.filter(t => typeof t === 'string') : [],
    revenue_estimate: data.estimated_revenue_range || data.inferred_revenue || undefined,
    funding_stage: data.latest_funding_stage || undefined,
  };
}

function mapAbstractResponse(data) {
  const empCount = Number.parseInt(data.employee_count, 10);
  return {
    company_name: data.company_name || undefined,
    employee_count: Number.isFinite(empCount) ? empCount : undefined,
    industry: data.industry || undefined,
    tech_stack: Array.isArray(data.technologies) ? data.technologies.filter(t => typeof t === 'string') : [],
    revenue_estimate: data.revenue_range || data.annual_revenue || undefined,
    funding_stage: undefined,
  };
}

function mapEnrichSoResponse(data) {
  const company = data.data || data;
  const staffCount = company.staff?.total || company.employee_count;
  return {
    company_name: company.name || undefined,
    employee_count: typeof staffCount === 'number' ? staffCount : undefined,
    industry: Array.isArray(company.industries) ? company.industries[0] : (company.industry || undefined),
    tech_stack: [],
    revenue_estimate: company.revenue_range || company.annual_revenue || undefined,
    funding_stage: undefined,
  };
}

function mergeProfiles(enriched, provided) {
  return {
    company_name: provided.company_name || enriched.company_name,
    company_url: provided.company_url || enriched.company_url,
    employee_count: provided.employee_count || enriched.employee_count,
    industry: provided.industry || enriched.industry,
    tech_stack: [...new Set([...(provided.tech_stack || []), ...(enriched.tech_stack || [])])],
    revenue_estimate: provided.revenue_estimate || enriched.revenue_estimate,
    funding_stage: provided.funding_stage || enriched.funding_stage,
    enrichment_source: enriched.enrichment_source || 'manual',
    enriched_at: new Date().toISOString(),
  };
}

// =============================================================================
// Person Enrichment
// =============================================================================

export async function enrichPersonProfile(profile) {
  if (!profile?.contact_email && !profile?.contact_name) return profile;

  const populatedFields = [
    profile.contact_email,
    profile.contact_name,
    profile.contact_title,
    profile.work_email,
    profile.seniority,
  ].filter(Boolean).length;

  if (populatedFields >= 3) return { ...profile, enrichment_source: 'manual' };

  const cacheKey = `person:${profile.contact_email || `${profile.contact_name}:${profile.company_name}`}`;
  const cached = cache.get(cacheKey);
  if (cached) return mergePersonProfiles(cached, profile);

  const enriched = await tryPersonProviders(profile);
  if (!enriched) return profile;

  cache.set(cacheKey, enriched);
  setTimeout(() => cache.delete(cacheKey), CACHE_TTL);

  return mergePersonProfiles(enriched, profile);
}

async function tryPersonProviders(profile) {
  const pdlKey = process.env.PDL_API_KEY;
  if (pdlKey) {
    const params = new URLSearchParams();
    if (profile.contact_email) params.set('email', profile.contact_email);
    if (profile.contact_phone) params.set('phone', profile.contact_phone);
    if (profile.linkedin_url) params.set('profile', profile.linkedin_url);
    if (profile.contact_name && profile.company_name) {
      params.set('name', profile.contact_name);
      params.set('company', profile.company_name);
    }

    if (params.toString()) {
      const url = `https://api.peopledatalabs.com/v5/person/enrich?${params}`;
      const result = await fetchWithTimeout(url, {
        headers: { 'X-Api-Key': pdlKey },
      });
      if (result) return { ...mapPdlPersonResponse(result), enrichment_source: 'pdl' };
    }
  }

  const enrichSoKey = process.env.ENRICH_SO_API_KEY;
  if (enrichSoKey && profile.contact_email) {
    const url = `https://api.enrich.so/v1/api/person?email=${encodeURIComponent(profile.contact_email)}`;
    const result = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${enrichSoKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (result) return { ...mapEnrichSoPersonResponse(result), enrichment_source: 'enrich_so' };
  }

  return null;
}

function mapPdlSeniority(levels) {
  if (!Array.isArray(levels) || levels.length === 0) return undefined;
  const level = levels[0].toLowerCase();
  if (level.includes('cxo') || level.includes('owner')) return 'c_suite';
  if (level.includes('vp') || level.includes('director')) return 'executive';
  if (level.includes('senior') || level.includes('lead')) return 'senior';
  if (level.includes('manager')) return 'mid';
  return 'entry';
}

function mapPdlPersonResponse(data) {
  return {
    contact_email: data.work_email || data.personal_emails?.[0] || undefined,
    contact_name: data.full_name || undefined,
    contact_title: data.job_title || undefined,
    seniority: mapPdlSeniority(data.job_title_levels),
    department: data.job_title_role || undefined,
    work_email: data.work_email || undefined,
    company_name: data.job_company_name || undefined,
    linkedin_url: data.linkedin_url || undefined,
    confidence_score: data.likelihood || undefined,
  };
}

function mapEnrichSoPersonResponse(data) {
  const person = data.data || data;
  return {
    contact_email: person.email || undefined,
    contact_name: person.full_name || (person.first_name && person.last_name ? `${person.first_name} ${person.last_name}` : undefined),
    contact_title: person.title || undefined,
    work_email: person.work_email || person.email || undefined,
    company_name: person.company?.name || undefined,
    linkedin_url: person.linkedin_url || undefined,
  };
}

function mergePersonProfiles(enriched, provided) {
  return {
    contact_email: provided.contact_email || enriched.contact_email,
    contact_name: provided.contact_name || enriched.contact_name,
    contact_title: provided.contact_title || enriched.contact_title,
    contact_phone: provided.contact_phone || enriched.contact_phone,
    seniority: provided.seniority || enriched.seniority,
    department: provided.department || enriched.department,
    work_email: provided.work_email || enriched.work_email,
    company_name: provided.company_name || enriched.company_name,
    linkedin_url: provided.linkedin_url || enriched.linkedin_url,
    enrichment_source: enriched.enrichment_source || 'manual',
    enriched_at: new Date().toISOString(),
    confidence_score: enriched.confidence_score,
  };
}

export function clearEnrichmentCache() {
  cache.clear();
}

export default { enrichBusinessProfile, enrichPersonProfile, clearEnrichmentCache };
