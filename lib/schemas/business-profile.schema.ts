import { type } from 'arktype';

const REVENUE_RANGES: Record<string, { min: number; max: number; midpoint: number }> = {
  'under_1m': { min: 0, max: 1_000_000, midpoint: 500_000 },
  '1m_5m': { min: 1_000_000, max: 5_000_000, midpoint: 3_000_000 },
  '5m_10m': { min: 5_000_000, max: 10_000_000, midpoint: 7_500_000 },
  '10m_50m': { min: 10_000_000, max: 50_000_000, midpoint: 30_000_000 },
  '50m_100m': { min: 50_000_000, max: 100_000_000, midpoint: 75_000_000 },
  '100m_500m': { min: 100_000_000, max: 500_000_000, midpoint: 300_000_000 },
  '500m_plus': { min: 500_000_000, max: Infinity, midpoint: 750_000_000 },
};

const REVENUE_PATTERN = /^\$?([\d,.]+)\s*([kmb])?(?:\s*[-–]\s*\$?([\d,.]+)\s*([kmb])?)?$/i;

function parseNumber(raw: string, suffix?: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, ''));
  if (Number.isNaN(n)) return 0;
  const multipliers: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  return n * (multipliers[suffix?.toLowerCase() ?? ''] ?? 1);
}

export function parseRevenueEstimate(input: string): { min: number; max: number; midpoint: number } | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim().toLowerCase();

  const normalized = trimmed.replace(/[$\s]/g, '').replace(/[-–]/g, '_');
  if (REVENUE_RANGES[normalized]) return REVENUE_RANGES[normalized];

  const match = trimmed.match(REVENUE_PATTERN);
  if (!match) return null;

  const low = parseNumber(match[1], match[2]);
  if (match[3]) {
    const high = parseNumber(match[3], match[4]);
    return { min: low, max: high, midpoint: (low + high) / 2 };
  }

  return { min: low * 0.7, max: low * 1.3, midpoint: low };
}

export const CompanySizeSegmentSchema = type("'smb' | 'mid_market' | 'enterprise' | 'large_enterprise'");
export type CompanySizeSegment = typeof CompanySizeSegmentSchema.infer;

export function getCompanySizeSegment(employeeCount: number): CompanySizeSegment {
  if (employeeCount < 100) return 'smb';
  if (employeeCount <= 500) return 'mid_market';
  if (employeeCount <= 2000) return 'enterprise';
  return 'large_enterprise';
}

export const EnrichmentSourceSchema = type("'manual' | 'clay_n8n' | 'pdl' | 'abstract' | 'enrich_so' | 'mixed'");
export type EnrichmentSource = typeof EnrichmentSourceSchema.infer;

// `tech_stack` defaults to [] in the legacy zod schema; ArkType applies defaults via `.default(...)`.
export const BusinessProfileSchema = type({
  'company_name?': 'string',
  'company_url?': 'string.url',
  'employee_count?': 'number.integer > 0',
  'industry?': 'string',
  tech_stack: type('string[]').default(() => []),
  'revenue_estimate?': 'string',
  'funding_stage?': 'string',
  'enrichment_source?': EnrichmentSourceSchema,
  'enriched_at?': 'string',
});

export type BusinessProfile = typeof BusinessProfileSchema.infer;

export { REVENUE_RANGES };
