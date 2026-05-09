/**
 * Questionnaire Schema - Intake assessment questions and lead qualification
 * @module lib/schemas/questionnaire.schema
 */

import { type } from 'arktype';

// =============================================================================
// Field Types
// =============================================================================

export const FieldTypeSchema = type(
  "'text' | 'textarea' | 'number' | 'currency' | 'select' | 'multiselect' | 'range' | 'date' | 'email' | 'phone'",
);

export type FieldType = typeof FieldTypeSchema.infer;

// =============================================================================
// Section Identifiers
// =============================================================================

export const QuestionSectionSchema = type("'A' | 'B' | 'C' | 'D' | 'E' | 'F'");
export type QuestionSection = typeof QuestionSectionSchema.infer;

// =============================================================================
// Validation Rules
// =============================================================================

export const ValidationRuleTypeSchema = type(
  "'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'oneOf' | 'custom'",
);

export type ValidationRuleType = typeof ValidationRuleTypeSchema.infer;

export const ValidationRuleSchema = type({
  type: ValidationRuleTypeSchema,
  'value?': 'number | string | string[]',
  message: 'string',
});

export type ValidationRule = typeof ValidationRuleSchema.infer;

// =============================================================================
// Conditional Display Logic
// =============================================================================

export const ConditionalOperatorSchema = type(
  "'==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'not_empty' | 'empty'",
);

export type ConditionalOperator = typeof ConditionalOperatorSchema.infer;

export const SimpleConditionSchema = type({
  field: 'string',
  operator: ConditionalOperatorSchema,
  'value?': 'unknown',
});

export type SimpleCondition = typeof SimpleConditionSchema.infer;

// Recursive ConditionalRule defined via interface (ArkType supports recursion via lazy thunk).
export interface ConditionalRule {
  show_when:
    | SimpleCondition
    | { and: ConditionalRule[] }
    | { or: ConditionalRule[] };
}

const ConditionalRuleSchema = type({
  show_when: 'unknown',
}) as unknown as { infer: ConditionalRule } & ((d: unknown) => ConditionalRule | type.errors);

export { ConditionalRuleSchema };

// =============================================================================
// Select/Multiselect Options
// =============================================================================

export const SelectOptionSchema = type({
  value: 'string',
  label: 'string',
  'description?': 'string',
  'is_default?': 'boolean',
});

export type SelectOption = typeof SelectOptionSchema.infer;

// =============================================================================
// Question Definition
// =============================================================================

const ScoringRuleSchema = type({
  condition: SimpleConditionSchema,
  points: 'number',
});

export const QuestionSchema = type({
  id: 'string >= 1',
  section: QuestionSectionSchema,
  order: 'number.integer >= 0',
  field_type: FieldTypeSchema,
  'schema_path?': 'string',
  'measurement_path?': 'string',
  label: 'string >= 1',
  'help_text?': 'string',
  'placeholder?': 'string',
  'examples?': 'string[]',
  'options?': SelectOptionSchema.array(),
  'options_from?': 'string',
  required: type('boolean').default(false),
  'validation?': ValidationRuleSchema.array(),
  'conditional?': 'unknown',
  'min?': 'number',
  'max?': 'number',
  'step?': 'number',
  currency: type('string').default('USD'),
  'qualification_weight?': '0 <= number <= 10',
  'scoring_rules?': ScoringRuleSchema.array(),
});

export type Question = typeof QuestionSchema.infer;

// =============================================================================
// Section Metadata
// =============================================================================

export const SectionMetadataSchema = type({
  id: QuestionSectionSchema,
  title: 'string',
  'description?': 'string',
  'icon?': 'string',
  order: 'number.integer >= 0',
  collapsible: type('boolean').default(false),
  collapsed_by_default: type('boolean').default(false),
});

export type SectionMetadata = typeof SectionMetadataSchema.infer;

// =============================================================================
// Lead Qualification Configuration
// =============================================================================

export const LeadStatusSchema = type("'hot' | 'warm' | 'cold'");
export type LeadStatus = typeof LeadStatusSchema.infer;

export const QualificationThresholdsSchema = type({
  hot: type('0 <= number <= 100').default(80),
  warm: type('0 <= number <= 100').default(50),
});

export type QualificationThresholds = typeof QualificationThresholdsSchema.infer;

export const QualificationWeightsSchema = type({
  budget_alignment: type('0 <= number <= 100').default(20),
  integration_complexity: type('0 <= number <= 100').default(15),
  volume_potential: type('0 <= number <= 100').default(15),
  timeline_urgency: type('0 <= number <= 100').default(10),
  decision_maker_access: type('0 <= number <= 100').default(15),
  pain_severity: type('0 <= number <= 100').default(15),
  api_readiness: type('0 <= number <= 100').default(10),
});

export type QualificationWeights = typeof QualificationWeightsSchema.infer;

export const QualificationConfigSchema = type({
  max_score: type('number').default(100),
  thresholds: QualificationThresholdsSchema,
  weights: QualificationWeightsSchema,
});

export type QualificationConfig = typeof QualificationConfigSchema.infer;

// =============================================================================
// Lead Score Result
// =============================================================================

export const QualificationComponentSchema = type({
  name: 'string',
  weight: 'number',
  raw_score: '0 <= number <= 100',
  weighted_score: 'number',
  status: "'healthy' | 'warning' | 'critical'",
  label: 'string',
});

export type QualificationComponent = typeof QualificationComponentSchema.infer;

export const LeadQualificationResultSchema = type({
  score: '0 <= number <= 100',
  score_display: 'string',
  status: LeadStatusSchema,
  status_label: 'string',
  components: QualificationComponentSchema.array(),
  'captured_at?': 'string',
});

export type LeadQualificationResult = typeof LeadQualificationResultSchema.infer;

// =============================================================================
// Complete Question Database
// =============================================================================

export const QuestionDatabaseSchema = type({
  '$schema?': 'string',
  version: type('string').default('1.0.0'),
  sections: SectionMetadataSchema.array(),
  questions: QuestionSchema.array(),
  qualification_config: QualificationConfigSchema,
});

export type QuestionDatabase = typeof QuestionDatabaseSchema.infer;

// =============================================================================
// Form Submission
// =============================================================================

export const FormSubmissionSchema = type({
  'version?': 'string',
  submitted_at: 'string',
  responses: 'Record<string, unknown>',
  'lead_qualification?': LeadQualificationResultSchema,
});

export type FormSubmission = typeof FormSubmissionSchema.infer;

// =============================================================================
// Systems Catalog
// =============================================================================

export const SystemCategorySchema = type(
  "'healthcare' | 'crm' | 'communication' | 'payment' | 'erp' | 'productivity' | 'marketing' | 'other'",
);

export type SystemCategory = typeof SystemCategorySchema.infer;

export const SystemEntrySchema = type({
  id: 'string',
  name: 'string',
  category: SystemCategorySchema,
  has_api: type('boolean').default(false),
  has_native_node: type('boolean').default(false),
  'native_node_name?': 'string',
  'common_in?': 'string[]',
});

export type SystemEntry = typeof SystemEntrySchema.infer;

export const SystemsCatalogSchema = type({
  '$schema?': 'string',
  version: type('string').default('1.0.0'),
  systems: SystemEntrySchema.array(),
});

export type SystemsCatalog = typeof SystemsCatalogSchema.infer;

// =============================================================================
// System Intelligence
// =============================================================================

export const ResearchFreshnessSchema = type({
  days: 'number',
  stale: 'boolean',
  score: '0 <= number <= 1',
  'reason?': 'string',
});

export type ResearchFreshness = typeof ResearchFreshnessSchema.infer;

export const LaborFactorSchema = type({
  factor: 'string',
  impact: 'string',
  'notes?': 'string',
});

export type LaborFactor = typeof LaborFactorSchema.infer;

export const CitationSchema = type({
  'id?': 'number',
  url: 'string',
  'type?': 'string',
});

export type Citation = typeof CitationSchema.infer;

export const SystemIntelligenceSchema = type({
  id: 'string',
  name: 'string',
  category: 'string',
  has_api: 'boolean',
  has_native_node: 'boolean',
  native_node_name: 'string | null',
  common_in: 'string[]',
  complexity_score: '1 <= number <= 10 | null',
  complexity_tier: 'string | null',
  auth_type: 'string | null',
  'gotchas?': 'string[]',
  rate_limits: 'string | null',
  base_hours: 'number | null',
  'labor_factors?': LaborFactorSchema.array(),
  'citations?': CitationSchema.array(),
  match_type: 'string',
  match_confidence: '0 <= number <= 1',
  source: "'catalog' | 'research' | 'merged'",
  'research_freshness?': ResearchFreshnessSchema.or('null'),
  'last_researched?': 'string | null',
});

export type SystemIntelligence = typeof SystemIntelligenceSchema.infer;

// =============================================================================
// Company Profile
// =============================================================================

export const CompanyProfileSchema = type({
  account_name: 'string',
  'contact_name?': 'string',
  'contact_title?': 'string',
  'contact_email?': 'string',
  'contact_phone?': 'string',
  'industry?': 'string',
  'company_size?': 'string',
  workflow_name: 'string',
  'volume_display?': 'string',
  'time_per_item_display?': 'string',
  'monthly_bleed_display?': 'string',
  systems_involved: type('string[]').default(() => []),
});

export type CompanyProfile = typeof CompanyProfileSchema.infer;

// =============================================================================
// Key Metrics Summary
// =============================================================================

export const KeyMetricsSchema = type({
  systems_count: 'number >= 0',
  'systems_count_display?': 'string',
  complexity_score: '0 <= number <= 10',
  'complexity_display?': 'string',
  risk_level: "'low' | 'medium' | 'high'",
  'risk_display?': 'string',
  roi_potential: "'low' | 'medium' | 'high'",
  'roi_display?': 'string',
});

export type KeyMetrics = typeof KeyMetricsSchema.infer;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateQuestionDatabase(data: unknown): QuestionDatabase | null {
  const result = QuestionDatabaseSchema(data);
  if (!(result instanceof type.errors)) {
    return result;
  }
  console.warn('[QUESTIONNAIRE] Validation failed:', result.summary);
  return null;
}

export function validateSystemsCatalog(data: unknown): SystemsCatalog | null {
  const result = SystemsCatalogSchema(data);
  if (!(result instanceof type.errors)) {
    return result;
  }
  console.warn('[SYSTEMS_CATALOG] Validation failed:', result.summary);
  return null;
}

export function evaluateCondition(
  condition: ConditionalRule,
  formData: Record<string, unknown>,
): boolean {
  const { show_when } = condition;

  if ('and' in show_when) {
    return show_when.and.every((c) => evaluateCondition(c, formData));
  }

  if ('or' in show_when) {
    return show_when.or.some((c) => evaluateCondition(c, formData));
  }

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
