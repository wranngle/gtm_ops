import { z } from 'zod';

export const PersonEnrichmentSourceSchema = z.enum(['manual', 'pdl', 'enrich_so', 'mixed']);
export type PersonEnrichmentSource = z.infer<typeof PersonEnrichmentSourceSchema>;

export const SenioritySchema = z.enum(['entry', 'mid', 'senior', 'executive', 'c_suite']);
export type Seniority = z.infer<typeof SenioritySchema>;

export const PersonProfileSchema = z.object({
  contact_email: z.string().email().optional(),
  contact_name: z.string().optional(),
  company_name: z.string().optional(),
  contact_phone: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  contact_title: z.string().optional(),
  seniority: SenioritySchema.optional(),
  department: z.string().optional(),
  work_email: z.string().email().optional(),
  enrichment_source: PersonEnrichmentSourceSchema.optional(),
  enriched_at: z.string().optional(),
  confidence_score: z.number().min(0).max(100).optional(),
});

export type PersonProfile = z.infer<typeof PersonProfileSchema>;
