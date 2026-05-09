import { type } from 'arktype';

export const PersonEnrichmentSourceSchema = type("'manual' | 'pdl' | 'enrich_so' | 'mixed'");
export type PersonEnrichmentSource = typeof PersonEnrichmentSourceSchema.infer;

export const SenioritySchema = type("'entry' | 'mid' | 'senior' | 'executive' | 'c_suite'");
export type Seniority = typeof SenioritySchema.infer;

export const PersonProfileSchema = type({
  'contact_email?': 'string.email',
  'contact_name?': 'string',
  'company_name?': 'string',
  'contact_phone?': 'string',
  'linkedin_url?': 'string.url',
  'contact_title?': 'string',
  'seniority?': SenioritySchema,
  'department?': 'string',
  'work_email?': 'string.email',
  'enrichment_source?': PersonEnrichmentSourceSchema,
  'enriched_at?': 'string',
  'confidence_score?': '0 <= number <= 100',
});

export type PersonProfile = typeof PersonProfileSchema.infer;
