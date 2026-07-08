// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Schema v2 Compatibility Layer
 *
 * Provides backwards compatibility during migration from v1 to v2 schema.
 * The canonical identity source is `schema.identity` - this module
 * mirrors that data to legacy paths for template compatibility.
 *
 * @module lib/schema_compat
 */

/**
 * Expand canonical identity to legacy paths
 *
 * Schema v2 uses a single `identity` section as the source of truth.
 * This function mirrors that data to all legacy locations so templates
 * continue working during migration.
 *
 * @param {Object} schema - Schema with canonical `identity` section
 * @returns {Object} Schema with legacy paths populated
 *
 * @example
 * const schema = {
 *   identity: { client_name: "Acme Corp", ... },
 *   proposal: { ... },
 *   audit_report: { ... }
 * };
 * expandLegacyPaths(schema);
 * // schema.project_identity === schema.identity
 * // schema.proposal.project_identity === schema.identity
 */
export function expandLegacyPaths(schema) {
  if (!schema.identity) {
    console.warn('[schema_compat] No canonical identity found, skipping expansion');
    return schema;
  }

  const {identity} = schema;

  // Root level legacy path
  schema.project_identity = identity;

  // Proposal section
  if (schema.proposal) {
    schema.proposal.project_identity = identity;
    if (schema.proposal.prepared_for) {
      schema.proposal.prepared_for.account_name = identity.client_name;
    }
  }

  // Audit report section
  if (schema.audit_report) {
    schema.audit_report.project_identity = identity;
  }

  // Project plan section
  if (schema.project_plan) {
    schema.project_plan.project_identity = identity;
  }

  // Estimate section
  if (schema.estimate) {
    schema.estimate.project_identity = identity;
  }

  // Intake section (account_name in prepared_for)
  if (schema.intake?.prepared_for) {
    schema.intake.prepared_for.account_name = identity.client_name;
  }

  return schema;
}

/**
 * Extract canonical identity from legacy schema
 *
 * During migration, this extracts identity from wherever it exists
 * and returns a canonical identity object.
 *
 * @param {Object} schema - Schema (v1 or v2)
 * @returns {Object|null} Canonical identity object
 */
export function extractCanonicalIdentity(schema) {
  // v2: Already has canonical identity
  if (schema.identity) {
    return schema.identity;
  }

  // v1: Find from legacy paths (priority order)
  const sources = [
    schema.project_identity,
    schema.proposal?.project_identity,
    schema.audit_report?.project_identity,
    schema.project_plan?.project_identity,
    schema.estimate?.project_identity
  ];

  for (const source of sources) {
    if (source && source.client_name) {
      return source;
    }
  }

  // Fallback: construct from intake
  if (schema.intake?.prepared_for?.account_name) {
    const {intake} = schema;
    return {
      client_name: intake.prepared_for.account_name,
      client_slug: slugifySimple(intake.prepared_for.account_name),
      project_name: intake.section_a_workflow_definition?.q01_workflow_name || 'Unknown Project',
      project_slug: slugifySimple(intake.section_a_workflow_definition?.q01_workflow_name || 'unknown'),
      process_name: intake.section_a_workflow_definition?.q01_workflow_name || 'Unknown Process',
      document_slug: 'WRN-AI-unknown',
      process_date: new Date().toISOString(),
      process_date_display: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      year: new Date().getFullYear()
    };
  }

  return null;
}

/**
 * Simple slugify helper (avoid circular dependency with project-identity.js)
 * @param {string} text - Text to slugify
 * @returns {string} Slugified text
 */
function slugifySimple(text) {
  if (!text || typeof text !== 'string') return 'unknown';
  return text
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 15);
}

/**
 * Validate identity data completeness
 *
 * @param {Object} identity - Identity object to validate
 * @returns {Object} Validation result { valid: boolean, missing: string[] }
 */
export function validateIdentity(identity) {
  const required = [
    'client_name',
    'client_slug',
    'project_name',
    'document_slug',
    'process_date_display'
  ];

  const missing = required.filter(field => !identity?.[field]);

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Remove legacy identity duplication from schema
 *
 * After full migration to v2, call this to clean up redundant data.
 * Templates must be updated to use `identity.*` paths first.
 *
 * @param {Object} schema - Schema with both canonical and legacy paths
 * @returns {Object} Schema with only canonical identity
 */
export function removeLegacyPaths(schema) {
  // Remove legacy root path
  delete schema.project_identity;

  // Remove from nested sections
  if (schema.proposal) {
    delete schema.proposal.project_identity;
  }

  if (schema.audit_report) {
    delete schema.audit_report.project_identity;
  }

  if (schema.project_plan) {
    delete schema.project_plan.project_identity;
  }

  if (schema.estimate) {
    delete schema.estimate.project_identity;
  }

  return schema;
}

export default {
  expandLegacyPaths,
  extractCanonicalIdentity,
  validateIdentity,
  removeLegacyPaths
};
