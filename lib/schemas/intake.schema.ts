/**
 * Intake Schema - Validated structure from LLM extraction
 * @module lib/schemas/intake.schema
 */

import { type } from 'arktype';
import { PeriodUnitSchema, TimeUnitSchema } from './common.schema.js';

// =============================================================================
// Prepared For (Client Info)
// =============================================================================

export const PreparedForSchema = type({
  'account_id?': 'string',
  account_name: 'string >= 1',
  'contact_name?': 'string',
  'contact_title?': 'string',
  'contact_email?': 'string.email',
  'contact_phone?': 'string',
});

export type PreparedFor = typeof PreparedForSchema.infer;

// =============================================================================
// Section A: Workflow Definition
// =============================================================================

export const SectionASchema = type({
  q01_workflow_name: 'string >= 1',
  'q02_trigger_event?': 'string',
  'q03_business_objective?': 'string',
  'q04_end_condition?': 'string',
  'q05_outcome_owner?': 'string',
  'q02_expected_trigger_frequency?': 'string',
  'q03_workflow_start_triggers?': 'string[]',
});

export type SectionA = typeof SectionASchema.infer;

// =============================================================================
// Section B: Volume & Timing
// =============================================================================

export const SectionBSchema = type({
  q06_runs_per_period: 'string | number',
  q06_period_unit: PeriodUnitSchema.default('day'),
  'q07_avg_trigger_to_end?': 'string | number',
  q07_time_unit: TimeUnitSchema.default('minutes'),
  'q08_worst_case_delay?': 'string | number | null',
  'q08_delay_unit?': TimeUnitSchema.or('null'),
  'q09_business_hours_expected?': 'string | null',
});

export type SectionB = typeof SectionBSchema.infer;

// =============================================================================
// Section C: Systems & Handoffs
// =============================================================================

export const SectionCSchema = type({
  q10_systems_involved: type('string[]').default(() => []),
  'q11_manual_data_transfers?': 'string',
  'q11_data_flow_touchpoints?': 'string[]',
  'q12_human_decision_gates?': 'string',
  'q12_auth_types?': 'string[]',
  'q13_data_sensitivity?': 'string',
});

export type SectionC = typeof SectionCSchema.infer;

// =============================================================================
// Section D: Failure & Cost
// =============================================================================

export const SectionDSchema = type({
  'q13_common_failures?': 'string',
  'q14_cost_if_slow_or_failed?': 'string',
});

export type SectionD = typeof SectionDSchema.infer;

// =============================================================================
// Section E: Priority
// =============================================================================

export const SectionESchema = type({
  'q15_one_thing_to_fix?': 'string',
});

export type SectionE = typeof SectionESchema.infer;

// =============================================================================
// Pain Points (Alternative Section B Structure)
// =============================================================================

export const ActivitySchema = type({
  name: 'string',
  'description?': 'string',
  'frequency?': 'string',
  'duration?': 'string',
});

export const SectionBPainPointsSchema = type({
  'q04_time_sink_activities?': ActivitySchema.array(),
  'q05_error_prone_steps?': 'string[]',
  'q06_revenue_impacting_delays?': 'string[]',
  'q07_compliance_concerns?': 'string[]',
  'q08_repetitive_decisions?': 'string[]',
  'q09_satisfaction_issues?': 'string[]',
});

// =============================================================================
// Attachments
// =============================================================================

export const AttachmentsSchema = type({
  evidence_uris: type('string[]').default(() => []),
  'notes?': 'string',
});

export type Attachments = typeof AttachmentsSchema.infer;

// =============================================================================
// Project (Legacy/Alternative Structure)
// =============================================================================

export const ProjectSchema = type({
  'integrations?': 'string[]',
  'name?': 'string',
  'description?': 'string',
});

// =============================================================================
// Complete Intake Schema
// =============================================================================

export const IntakeSchema = type({
  intake_version: type('string').default('1.0.0'),
  'captured_at?': 'string',
  'captured_by?': 'string',
  prepared_for: PreparedForSchema,
  section_a_workflow_definition: SectionASchema,
  'section_b_volume_timing?': SectionBSchema,
  'section_b_pain_points?': SectionBPainPointsSchema,
  section_c_systems_handoffs: SectionCSchema,
  'section_d_failure_cost?': SectionDSchema,
  'section_e_priority?': SectionESchema,
  'attachments?': AttachmentsSchema,
  'project?': ProjectSchema,
});

export type Intake = typeof IntakeSchema.infer;

// =============================================================================
// Partial Intake (for incremental validation)
// =============================================================================

export const PartialIntakeSchema = IntakeSchema.partial();

export type PartialIntake = typeof PartialIntakeSchema.infer;

// =============================================================================
// Intake Extraction Result (wrapper with metadata)
// =============================================================================

export const IntakeExtractionResultSchema = type({
  success: 'boolean',
  'intake?': IntakeSchema,
  'errors?': 'string[]',
  'warnings?': 'string[]',
  'extraction_time_ms?': 'number',
  'model_used?': 'string',
  'retry_count?': 'number',
});

export type IntakeExtractionResult = typeof IntakeExtractionResultSchema.infer;
