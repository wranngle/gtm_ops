/**
 * Schema v2 Compatibility Layer
 *
 * Provides backwards compatibility during migration from v1 to v2 schema.
 * The canonical identity source is `schema.identity` - this module
 * mirrors that data to legacy paths for template compatibility.
 *
 * @module lib/schema_compat
 */

// =============================================================================
// TYPES
// =============================================================================

export type Identity = {
  client_name: string;
  client_slug: string;
  project_name: string;
  project_slug: string;
  process_name: string;
  document_slug: string;
  process_date: string;
  process_date_display: string;
  year: number;
};

type PreparedFor = {
  account_name?: string;
};

type SectionAWorkflowDefinition = {
  q01_workflow_name?: string;
};

type Intake = {
  prepared_for?: PreparedFor;
  section_a_workflow_definition?: SectionAWorkflowDefinition;
};

type Proposal = {
  project_identity?: Identity;
  prepared_for?: PreparedFor;
  [key: string]: any;
};

type AuditReport = {
  project_identity?: Identity;
  [key: string]: any;
};

type ProjectPlan = {
  project_identity?: Identity;
  [key: string]: any;
};

type Estimate = {
  project_identity?: Identity;
  [key: string]: any;
};

export type Schema = {
  identity?: Identity;
  project_identity?: Identity;
  proposal?: Proposal;
  audit_report?: AuditReport;
  project_plan?: ProjectPlan;
  estimate?: Estimate;
  intake?: Intake;
  [key: string]: any;
};

export type ValidationResult = {
  valid: boolean;
  missing: string[];
};

// =============================================================================
// LEGACY PATH EXPANSION
// =============================================================================

/**
 * Expand canonical identity to legacy paths
 *
 * Schema v2 uses a single `identity` section as the source of truth.
 * This function mirrors that data to all legacy locations so templates
 * continue working during migration.
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
export function expandLegacyPaths(schema: Schema): Schema {
  if (!schema.identity) {
    console.warn('[schema_compat] No canonical identity found, skipping expansion');
    return schema;
  }

  const identity = schema.identity;

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

// =============================================================================
// CANONICAL IDENTITY EXTRACTION
// =============================================================================

/**
 * Extract canonical identity from legacy schema
 *
 * During migration, this extracts identity from wherever it exists
 * and returns a canonical identity object.
 */
export function extractCanonicalIdentity(schema: Schema): Identity | null {
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
    const intake = schema.intake;
    const accountName = intake.prepared_for?.account_name || 'Unknown';
    const workflowName = intake.section_a_workflow_definition?.q01_workflow_name;
    return {
      client_name: accountName,
      client_slug: slugifySimple(accountName),
      project_name: workflowName || 'Unknown Project',
      project_slug: slugifySimple(workflowName || 'unknown'),
      process_name: workflowName || 'Unknown Process',
      document_slug: 'WRN-AI-unknown',
      process_date: new Date().toISOString(),
      process_date_display: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      year: new Date().getFullYear()
    };
  }

  return null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Simple slugify helper (avoid circular dependency with project_identity.js)
 */
function slugifySimple(text: string | undefined | null): string {
  if (!text || typeof text !== 'string') return 'unknown';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 15);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate identity data completeness
 */
export function validateIdentity(identity: Identity | null | undefined): ValidationResult {
  const required = [
    'client_name',
    'client_slug',
    'project_name',
    'document_slug',
    'process_date_display'
  ];

  const missing = required.filter(field => !identity?.[field as keyof Identity]);

  return {
    valid: missing.length === 0,
    missing
  };
}

// =============================================================================
// LEGACY PATH REMOVAL
// =============================================================================

/**
 * Remove legacy identity duplication from schema
 *
 * After full migration to v2, call this to clean up redundant data.
 * Templates must be updated to use `identity.*` paths first.
 */
export function removeLegacyPaths(schema: Schema): Schema {
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

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  expandLegacyPaths,
  extractCanonicalIdentity,
  validateIdentity,
  removeLegacyPaths
};
