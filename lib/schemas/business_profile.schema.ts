import { z } from 'zod';

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

  // Check named ranges first (e.g., "$10M-50M", "10m_50m")
  const normalized = trimmed.replace(/[$\s]/g, '').replace(/[-–]/g, '_');
  if (REVENUE_RANGES[normalized]) return REVENUE_RANGES[normalized];

  // Try pattern match
  const match = trimmed.match(REVENUE_PATTERN);
  if (!match) return null;

  const low = parseNumber(match[1], match[2]);
  if (match[3]) {
    const high = parseNumber(match[3], match[4]);
    return { min: low, max: high, midpoint: (low + high) / 2 };
  }

  // Single value — treat as midpoint, ±30% range
  return { min: low * 0.7, max: low * 1.3, midpoint: low };
}

export const CompanySizeSegmentSchema = z.enum([
  'smb',
  'mid_market',
  'enterprise',
  'large_enterprise',
]);

export type CompanySizeSegment = z.infer<typeof CompanySizeSegmentSchema>;

export function getCompanySizeSegment(employeeCount: number): CompanySizeSegment {
  if (employeeCount < 100) return 'smb';
  if (employeeCount <= 500) return 'mid_market';
  if (employeeCount <= 2000) return 'enterprise';
  return 'large_enterprise';
}

export const EnrichmentSourceSchema = z.enum(['manual', 'clay_n8n', 'pdl', 'abstract', 'enrich_so', 'mixed']);
export type EnrichmentSource = z.infer<typeof EnrichmentSourceSchema>;

export const BusinessProfileSchema = z.object({
  company_name: z.string().optional(),
  company_url: z.string().url().optional(),
  employee_count: z.number().int().positive().optional(),
  industry: z.string().optional(),
  tech_stack: z.array(z.string()).default([]),
  revenue_estimate: z.string().optional(),
  funding_stage: z.string().optional(),
  enrichment_source: EnrichmentSourceSchema.optional(),
  enriched_at: z.string().optional(),
});

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export { REVENUE_RANGES };
