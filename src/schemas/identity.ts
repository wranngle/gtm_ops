/**
 * Project Identity Schema
 *
 * Validates the document identity used across all presales documents.
 *
 * @module src/schemas/identity
 */

import { type } from 'arktype';

// =============================================================================
// SLUG PATTERNS
// =============================================================================

const SlugPattern = /^[a-z\d][a-z\d-]*[a-z\d]$|^[a-z\d]$/;
const DocumentSlugPattern = /^WRN-AI-[a-z\d-]+-\d{2}r\d+$/;

const SlugString = type('string').narrow(
  (v: string, ctx: any) =>
    SlugPattern.test(v) || ctx.reject('a lowercase alphanumeric/hyphen slug'),
);

const DocumentSlugString = type('string').narrow(
  (v: string, ctx: any) =>
    DocumentSlugPattern.test(v) || ctx.reject('WRN-AI-{client}-{process}-{YY}r{revision} format'),
);

// =============================================================================
// PROJECT IDENTITY
// =============================================================================

export const ProjectIdentitySchema = type({
  client_name: '1 <= string <= 100',
  client_slug: SlugString.narrow((v: string, ctx: any) =>
    v.length <= 30 || ctx.reject('client_slug ≤ 30 chars'),
  ),
  project_name: '1 <= string <= 150',
  project_slug: SlugString.narrow((v: string, ctx: any) =>
    v.length <= 30 || ctx.reject('project_slug ≤ 30 chars'),
  ),
  process_name: 'string >= 1',
  document_slug: DocumentSlugString,
  friendly_name: type('string <= 100').default(''),
  process_date: 'string.date.iso',
  process_date_display: 'string >= 1',
  'valid_until?': 'string.date.iso',
  'valid_until_display?': 'string',
  validity_days: type('1 <= number.integer <= 365').default(14),
  year: '2024 <= number.integer <= 2100',
});

export type ProjectIdentity = typeof ProjectIdentitySchema.infer;

// =============================================================================
// DOCUMENT TYPES
// =============================================================================

export const DocumentTypeSchema = type("'audit' | 'project_plan' | 'proposal'");
export type DocumentType = typeof DocumentTypeSchema.infer;

// =============================================================================
// PREPARED FOR (Client Contact)
// =============================================================================

export const PreparedForSchema = type({
  account_name: 'string >= 1',
  'contact_name?': 'string',
  'contact_email?': 'string.email',
  'contact_phone?': 'string',
  'industry?': 'string',
});

export type PreparedFor = typeof PreparedForSchema.infer;

// =============================================================================
// HELPERS
// =============================================================================

export function slugifyClient(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 30);
}

export function slugifyProject(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 30);
}

export function generateDocumentSlug(
  clientSlug: string,
  projectSlug: string,
  year: number,
  revision = 1,
): string {
  const yearSuffix = String(year).slice(-2);
  const shortClient = clientSlug.slice(0, 15);
  const shortProject = projectSlug.slice(0, 15);
  return `WRN-AI-${shortClient}-${shortProject}-${yearSuffix}r${revision}`;
}

export function validateProjectIdentity(data: unknown): ProjectIdentity {
  const result = ProjectIdentitySchema(data);
  if (result instanceof type.errors) {
    throw new Error(`Project identity validation failed: ${result.summary}`);
  }
  return result;
}

export function safeParseIdentity(data: unknown): {
  success: boolean;
  data?: ProjectIdentity;
  errors?: string[];
} {
  const result = ProjectIdentitySchema(data);
  if (!(result instanceof type.errors)) {
    return { success: true, data: result };
  }
  return {
    success: false,
    errors: [...result].map((issue: any) =>
      `${Array.isArray(issue.path) ? issue.path.join('.') : issue.path ?? ''}: ${issue.message ?? String(issue)}`),
  };
}
