/**
 * Project Identity Schema
 * 
 * Validates the document identity used across all presales documents.
 * 
 * @module src/schemas/identity
 */

import { z } from 'zod';

// =============================================================================
// SLUG PATTERNS
// =============================================================================

/**
 * Valid slug pattern: lowercase letters, numbers, hyphens
 * Examples: "acme-corp", "order-fulfillment-2025"
 */
const SlugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Document slug pattern: WRN-AI-{client}-{process}-{YY}r{revision}
 * Example: WRN-AI-acme-corp-order-fulfillment-25r1
 */
const DocumentSlugPattern = /^WRN-AI-[a-z0-9-]+-\d{2}r\d+$/;

// =============================================================================
// PROJECT IDENTITY
// =============================================================================

export const ProjectIdentitySchema = z.object({
  // Client information
  client_name: z.string()
    .min(1, { message: 'Client name is required' })
    .max(100, { message: 'Client name too long' }),
  
  client_slug: z.string()
    .regex(SlugPattern, { message: 'Client slug must be lowercase alphanumeric with hyphens' })
    .max(30, { message: 'Client slug too long (max 30 chars)' }),
  
  // Project/Process information
  project_name: z.string()
    .min(1, { message: 'Project name is required' })
    .max(150, { message: 'Project name too long' }),
  
  project_slug: z.string()
    .regex(SlugPattern, { message: 'Project slug must be lowercase alphanumeric with hyphens' })
    .max(30, { message: 'Project slug too long (max 30 chars)' }),
  
  process_name: z.string()
    .min(1, { message: 'Process name is required' }),
  
  // Document identification
  document_slug: z.string()
    .regex(DocumentSlugPattern, { 
      message: 'Document slug must match WRN-AI-{client}-{process}-{YY}r{revision} format' 
    }),
  
  // Optional friendly name (catchy project name)
  friendly_name: z.string()
    .max(100, { message: 'Friendly name too long' })
    .optional()
    .default(''),
  
  // Dates
  process_date: z.string()
    .datetime({ message: 'Process date must be ISO 8601 datetime' }),
  
  process_date_display: z.string()
    .min(1, { message: 'Process date display is required' }),
  
  valid_until: z.string()
    .datetime({ message: 'Valid until must be ISO 8601 datetime' })
    .optional(),
  
  valid_until_display: z.string()
    .optional(),
  
  validity_days: z.number()
    .int()
    .min(1, { message: 'Validity must be at least 1 day' })
    .max(365, { message: 'Validity cannot exceed 1 year' })
    .default(14),
  
  // Year for copyright/dating
  year: z.number()
    .int()
    .min(2024, { message: 'Year must be 2024 or later' })
    .max(2100, { message: 'Year seems too far in future' })
});

export type ProjectIdentity = z.infer<typeof ProjectIdentitySchema>;

// =============================================================================
// DOCUMENT TYPES
// =============================================================================

export const DocumentTypeSchema = z.enum([
  'audit',        // AI Process Audit Report
  'project_plan', // Project Plan / Scope of Work
  'proposal'      // Phase 2 Proposal
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

// =============================================================================
// PREPARED FOR (Client Contact)
// =============================================================================

export const PreparedForSchema = z.object({
  account_name: z.string().min(1),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  industry: z.string().optional()
});

export type PreparedFor = z.infer<typeof PreparedForSchema>;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a valid client slug from a company name
 */
export function slugifyClient(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

/**
 * Generate a valid project slug from a project name
 */
export function slugifyProject(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

/**
 * Generate a document slug
 */
export function generateDocumentSlug(
  clientSlug: string,
  projectSlug: string,
  year: number,
  revision: number = 1
): string {
  const yearSuffix = String(year).slice(-2);
  
  // Truncate slugs to fit in document slug format
  const maxClientLen = 15;
  const maxProjectLen = 15;
  
  const shortClient = clientSlug.slice(0, maxClientLen);
  const shortProject = projectSlug.slice(0, maxProjectLen);
  
  return `WRN-AI-${shortClient}-${shortProject}-${yearSuffix}r${revision}`;
}

/**
 * Validate a project identity object
 */
export function validateProjectIdentity(data: unknown): ProjectIdentity {
  return ProjectIdentitySchema.parse(data);
}

/**
 * Safe parse with error details
 */
export function safeParseIdentity(data: unknown): {
  success: boolean;
  data?: ProjectIdentity;
  errors?: string[];
} {
  const result = ProjectIdentitySchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
  };
}
