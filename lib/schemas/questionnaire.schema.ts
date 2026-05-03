/**
 * Questionnaire Schema - Intake assessment questions and lead qualification
 * @module lib/schemas/questionnaire.schema
 *
 * This schema defines the structure for:
 * - Question registry (typed form fields)
 * - Validation rules (client & server side)
 * - Conditional display logic
 * - Lead qualification scoring
 */

import { z } from 'zod';

// =============================================================================
// Field Types
// =============================================================================

export const FieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'currency',
  'select',
  'multiselect',
  'range',
  'date',
  'email',
  'phone',
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

// =============================================================================
// Section Identifiers
// =============================================================================

export const QuestionSectionSchema = z.enum([
  'A', // Client & Workflow Identity
  'B', // Volume & Timing
  'C', // Systems & Integration
  'D', // Pain & Cost
  'E', // Priority & Timeline
  'F', // Lead Qualification
]);

export type QuestionSection = z.infer<typeof QuestionSectionSchema>;

// =============================================================================
// Validation Rules
// =============================================================================

export const ValidationRuleTypeSchema = z.enum([
  'required',
  'min',
  'max',
  'minLength',
  'maxLength',
  'pattern',
  'oneOf',
  'custom',
]);

export type ValidationRuleType = z.infer<typeof ValidationRuleTypeSchema>;

export const ValidationRuleSchema = z.object({
  type: ValidationRuleTypeSchema,
  value: z.union([z.number(), z.string(), z.array(z.string())]).optional(),
  message: z.string(),
});

export type ValidationRule = z.infer<typeof ValidationRuleSchema>;

// =============================================================================
// Conditional Display Logic
// =============================================================================

export const ConditionalOperatorSchema = z.enum([
  '==',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'in',
  'not_in',
  'not_empty',
  'empty',
]);

export type ConditionalOperator = z.infer<typeof ConditionalOperatorSchema>;

// Base condition for single field comparison
export const SimpleConditionSchema = z.object({
  field: z.string(),
  operator: ConditionalOperatorSchema,
  value: z.any().optional(),
});

export type SimpleCondition = z.infer<typeof SimpleConditionSchema>;

// Recursive type for AND/OR conditions
export const ConditionalRuleSchema: z.ZodType<ConditionalRule> = z.lazy(() =>
  z.object({
    show_when: z.union([
      SimpleConditionSchema,
      z.object({ and: z.array(ConditionalRuleSchema) }),
      z.object({ or: z.array(ConditionalRuleSchema) }),
    ]),
  })
);

export interface ConditionalRule {
  show_when:
    | SimpleCondition
    | { and: ConditionalRule[] }
    | { or: ConditionalRule[] };
}

// =============================================================================
// Select/Multiselect Options
// =============================================================================

export const SelectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  description: z.string().optional(),
  is_default: z.boolean().optional(),
});

export type SelectOption = z.infer<typeof SelectOptionSchema>;

// =============================================================================
// Question Definition
// =============================================================================

export const QuestionSchema = z.object({
  // Identification
  id: z.string().min(1),
  section: QuestionSectionSchema,
  order: z.number().int().nonnegative(),

  // Field configuration
  field_type: FieldTypeSchema,
  schema_path: z.string().optional(), // Dot-notation path to IntakeSchema field
  measurement_path: z.string().optional(), // Path to measurements field

  // Display
  label: z.string().min(1),
  help_text: z.string().optional(),
  placeholder: z.string().optional(),
  examples: z.array(z.string()).optional(),

  // Options (for select/multiselect)
  options: z.array(SelectOptionSchema).optional(),
  options_from: z.string().optional(), // Reference to external options catalog

  // Constraints
  required: z.boolean().default(false),
  validation: z.array(ValidationRuleSchema).optional(),
  conditional: ConditionalRuleSchema.optional(),

  // Range field specifics
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),

  // Currency field specifics
  currency: z.string().optional().default('USD'),

  // Lead scoring
  qualification_weight: z.number().min(0).max(10).optional(),
  scoring_rules: z
    .array(
      z.object({
        condition: SimpleConditionSchema,
        points: z.number(),
      })
    )
    .optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

// =============================================================================
// Section Metadata
// =============================================================================

export const SectionMetadataSchema = z.object({
  id: QuestionSectionSchema,
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().nonnegative(),
  collapsible: z.boolean().optional().default(false),
  collapsed_by_default: z.boolean().optional().default(false),
});

export type SectionMetadata = z.infer<typeof SectionMetadataSchema>;

// =============================================================================
// Lead Qualification Configuration
// =============================================================================

export const LeadStatusSchema = z.enum(['hot', 'warm', 'cold']);

export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const QualificationThresholdsSchema = z.object({
  hot: z.number().min(0).max(100).default(80),
  warm: z.number().min(0).max(100).default(50),
});

export type QualificationThresholds = z.infer<typeof QualificationThresholdsSchema>;

export const QualificationWeightsSchema = z.object({
  budget_alignment: z.number().min(0).max(100).default(20),
  integration_complexity: z.number().min(0).max(100).default(15),
  volume_potential: z.number().min(0).max(100).default(15),
  timeline_urgency: z.number().min(0).max(100).default(10),
  decision_maker_access: z.number().min(0).max(100).default(15),
  pain_severity: z.number().min(0).max(100).default(15),
  api_readiness: z.number().min(0).max(100).default(10),
});

export type QualificationWeights = z.infer<typeof QualificationWeightsSchema>;

export const QualificationConfigSchema = z.object({
  max_score: z.number().default(100),
  thresholds: QualificationThresholdsSchema,
  weights: QualificationWeightsSchema,
});

export type QualificationConfig = z.infer<typeof QualificationConfigSchema>;

// =============================================================================
// Lead Score Result
// =============================================================================

export const QualificationComponentSchema = z.object({
  name: z.string(),
  weight: z.number(),
  raw_score: z.number().min(0).max(100),
  weighted_score: z.number(),
  status: z.enum(['healthy', 'warning', 'critical']),
  label: z.string(),
});

export type QualificationComponent = z.infer<typeof QualificationComponentSchema>;

export const LeadQualificationResultSchema = z.object({
  score: z.number().min(0).max(100),
  score_display: z.string(),
  status: LeadStatusSchema,
  status_label: z.string(),
  components: z.array(QualificationComponentSchema),
  captured_at: z.string().optional(),
});

export type LeadQualificationResult = z.infer<typeof LeadQualificationResultSchema>;

// =============================================================================
// Complete Question Database
// =============================================================================

export const QuestionDatabaseSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default('1.0.0'),
  sections: z.array(SectionMetadataSchema),
  questions: z.array(QuestionSchema),
  qualification_config: QualificationConfigSchema,
});

export type QuestionDatabase = z.infer<typeof QuestionDatabaseSchema>;

// =============================================================================
// Form Submission
// =============================================================================

export const FormSubmissionSchema = z.object({
  version: z.string().optional(),
  submitted_at: z.string(),
  responses: z.record(z.string(), z.any()),
  lead_qualification: LeadQualificationResultSchema.optional(),
});

export type FormSubmission = z.infer<typeof FormSubmissionSchema>;

// =============================================================================
// Systems Catalog (for multiselect options)
// =============================================================================

export const SystemCategorySchema = z.enum([
  'healthcare',
  'crm',
  'communication',
  'payment',
  'erp',
  'productivity',
  'marketing',
  'other',
]);

export type SystemCategory = z.infer<typeof SystemCategorySchema>;

export const SystemEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: SystemCategorySchema,
  has_api: z.boolean().default(false),
  has_native_node: z.boolean().default(false),
  native_node_name: z.string().optional(),
  common_in: z.array(z.string()).optional(), // Industries where common
});

export type SystemEntry = z.infer<typeof SystemEntrySchema>;

export const SystemsCatalogSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default('1.0.0'),
  systems: z.array(SystemEntrySchema),
});

export type SystemsCatalog = z.infer<typeof SystemsCatalogSchema>;

// =============================================================================
// System Intelligence (Unified Lookup Result)
// =============================================================================

export const ResearchFreshnessSchema = z.object({
  days: z.number(),
  stale: z.boolean(),
  score: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export type ResearchFreshness = z.infer<typeof ResearchFreshnessSchema>;

export const LaborFactorSchema = z.object({
  factor: z.string(),
  impact: z.string(), // 'high' | 'medium' | 'low'
  notes: z.string().optional(),
});

export type LaborFactor = z.infer<typeof LaborFactorSchema>;

export const CitationSchema = z.object({
  id: z.number().optional(),
  url: z.string(),
  type: z.string().optional(), // 'api_docs' | 'repository' | 'other'
});

export type Citation = z.infer<typeof CitationSchema>;

/**
 * System Intelligence Schema
 * Unified result from merging Systems Catalog with Technical Research
 * Used at runtime only - not persisted to catalog JSON
 */
export const SystemIntelligenceSchema = z.object({
  // From Catalog (static baseline)
  id: z.string(),
  name: z.string(),
  category: z.string(),
  has_api: z.boolean(),
  has_native_node: z.boolean(),
  native_node_name: z.string().nullable(),
  common_in: z.array(z.string()),

  // From Research (dynamic enrichment)
  complexity_score: z.number().min(1).max(10).nullable(),
  complexity_tier: z.string().nullable(), // 'simple' | 'moderate' | 'complex'
  auth_type: z.string().nullable(),
  gotchas: z.array(z.string()).optional(),
  rate_limits: z.string().nullable(),
  base_hours: z.number().nullable(),
  labor_factors: z.array(LaborFactorSchema).optional(),
  citations: z.array(CitationSchema).optional(),

  // Match metadata
  match_type: z.string(), // 'exact_id' | 'exact_name' | 'alias' | 'fuzzy' | 'research_only' | 'none'
  match_confidence: z.number().min(0).max(1),

  // Source tracking
  source: z.enum(['catalog', 'research', 'merged']),
  research_freshness: ResearchFreshnessSchema.nullable().optional(),
  last_researched: z.string().nullable().optional(), // ISO date
});

export type SystemIntelligence = z.infer<typeof SystemIntelligenceSchema>;

// =============================================================================
// Company Profile (for internal sheet)
// =============================================================================

export const CompanyProfileSchema = z.object({
  account_name: z.string(),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  contact_email: z.string().optional(),
  contact_phone: z.string().optional(),
  industry: z.string().optional(),
  company_size: z.string().optional(),
  workflow_name: z.string(),
  volume_display: z.string().optional(),
  time_per_item_display: z.string().optional(),
  monthly_bleed_display: z.string().optional(),
  systems_involved: z.array(z.string()).default([]),
});

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// =============================================================================
// Key Metrics Summary (for internal sheet)
// =============================================================================

export const KeyMetricsSchema = z.object({
  systems_count: z.number().nonnegative(),
  systems_count_display: z.string().optional(),
  complexity_score: z.number().min(0).max(10),
  complexity_display: z.string().optional(),
  risk_level: z.enum(['low', 'medium', 'high']),
  risk_display: z.string().optional(),
  roi_potential: z.enum(['low', 'medium', 'high']),
  roi_display: z.string().optional(),
});

export type KeyMetrics = z.infer<typeof KeyMetricsSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates a question database configuration.
 * Returns null if invalid with logged warnings.
 */
export function validateQuestionDatabase(data: unknown): QuestionDatabase | null {
  const result = QuestionDatabaseSchema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  console.warn(
    '[QUESTIONNAIRE] Validation failed:',
    result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  );

  return null;
}

/**
 * Validates a systems catalog configuration.
 */
export function validateSystemsCatalog(data: unknown): SystemsCatalog | null {
  const result = SystemsCatalogSchema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  console.warn(
    '[SYSTEMS_CATALOG] Validation failed:',
    result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  );

  return null;
}

/**
 * Evaluates a conditional rule against form data.
 */
export function evaluateCondition(
  condition: ConditionalRule,
  formData: Record<string, unknown>
): boolean {
  const { show_when } = condition;

  // AND condition
  if ('and' in show_when) {
    return show_when.and.every((c) => evaluateCondition(c, formData));
  }

  // OR condition
  if ('or' in show_when) {
    return show_when.or.some((c) => evaluateCondition(c, formData));
  }

  // Simple condition
  const { field, operator, value } = show_when as SimpleCondition;
  const fieldValue = formData[field];

  switch (operator) {
    case '==':
      return fieldValue === value;
    case '!=':
      return fieldValue !== value;
    case '>':
      return typeof fieldValue === 'number' && fieldValue > (value as number);
    case '<':
      return typeof fieldValue === 'number' && fieldValue < (value as number);
    case '>=':
      return typeof fieldValue === 'number' && fieldValue >= (value as number);
    case '<=':
      return typeof fieldValue === 'number' && fieldValue <= (value as number);
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);
    case 'not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    case 'empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    default:
      return true;
  }
}
