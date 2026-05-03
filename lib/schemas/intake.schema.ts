/**
 * Intake Schema - Validated structure from LLM extraction
 * @module lib/schemas/intake.schema
 */

import { z } from 'zod';
import { PeriodUnitSchema, TimeUnitSchema } from './common.schema.js';

// =============================================================================
// Prepared For (Client Info)
// =============================================================================

export const PreparedForSchema = z.object({
  account_id: z.string().optional(),
  account_name: z.string().min(1, 'Account name is required'),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
});

export type PreparedFor = z.infer<typeof PreparedForSchema>;

// =============================================================================
// Section A: Workflow Definition
// =============================================================================

export const SectionASchema = z.object({
  q01_workflow_name: z.string().min(1, 'Workflow name is required'),
  q02_trigger_event: z.string().optional(),
  q03_business_objective: z.string().optional(),
  q04_end_condition: z.string().optional(),
  q05_outcome_owner: z.string().optional(),
  // Legacy field names for backward compatibility
  q02_expected_trigger_frequency: z.string().optional(),
  q03_workflow_start_triggers: z.array(z.string()).optional(),
});

export type SectionA = z.infer<typeof SectionASchema>;

// =============================================================================
// Section B: Volume & Timing
// =============================================================================

export const SectionBSchema = z.object({
  q06_runs_per_period: z.union([z.string(), z.number()]),
  q06_period_unit: PeriodUnitSchema.optional().default('day'),
  q07_avg_trigger_to_end: z.union([z.string(), z.number()]).optional(),
  q07_time_unit: TimeUnitSchema.optional().default('minutes'),
  q08_worst_case_delay: z.union([z.string(), z.number(), z.null()]).optional(),
  q08_delay_unit: TimeUnitSchema.nullable().optional(),
  q09_business_hours_expected: z.string().nullable().optional(),
});

export type SectionB = z.infer<typeof SectionBSchema>;

// =============================================================================
// Section C: Systems & Handoffs
// =============================================================================

export const SectionCSchema = z.object({
  q10_systems_involved: z.array(z.string()).default([]),
  q11_manual_data_transfers: z.string().optional(),
  q11_data_flow_touchpoints: z.array(z.string()).optional(),
  q12_human_decision_gates: z.string().optional(),
  q12_auth_types: z.array(z.string()).optional(),
  q13_data_sensitivity: z.string().optional(),
});

export type SectionC = z.infer<typeof SectionCSchema>;

// =============================================================================
// Section D: Failure & Cost
// =============================================================================

export const SectionDSchema = z.object({
  q13_common_failures: z.string().optional(),
  q14_cost_if_slow_or_failed: z.string().optional(),
});

export type SectionD = z.infer<typeof SectionDSchema>;

// =============================================================================
// Section E: Priority
// =============================================================================

export const SectionESchema = z.object({
  q15_one_thing_to_fix: z.string().optional(),
});

export type SectionE = z.infer<typeof SectionESchema>;

// =============================================================================
// Pain Points (Alternative Section B Structure)
// =============================================================================

export const ActivitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  frequency: z.string().optional(),
  duration: z.string().optional(),
});

export const SectionBPainPointsSchema = z.object({
  q04_time_sink_activities: z.array(ActivitySchema).optional(),
  q05_error_prone_steps: z.array(z.string()).optional(),
  q06_revenue_impacting_delays: z.array(z.string()).optional(),
  q07_compliance_concerns: z.array(z.string()).optional(),
  q08_repetitive_decisions: z.array(z.string()).optional(),
  q09_satisfaction_issues: z.array(z.string()).optional(),
});

// =============================================================================
// Attachments
// =============================================================================

export const AttachmentsSchema = z.object({
  evidence_uris: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type Attachments = z.infer<typeof AttachmentsSchema>;

// =============================================================================
// Project (Legacy/Alternative Structure)
// =============================================================================

export const ProjectSchema = z.object({
  integrations: z.array(z.string()).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});

// =============================================================================
// Complete Intake Schema
// =============================================================================

export const IntakeSchema = z.object({
  // Metadata
  intake_version: z.string().optional().default('1.0.0'),
  captured_at: z.string().optional(),
  captured_by: z.string().optional(),

  // Client Information
  prepared_for: PreparedForSchema,

  // Sections (using underscore naming for Mustache compatibility)
  section_a_workflow_definition: SectionASchema,
  section_b_volume_timing: SectionBSchema.optional(),
  section_b_pain_points: SectionBPainPointsSchema.optional(),
  section_c_systems_handoffs: SectionCSchema,
  section_d_failure_cost: SectionDSchema.optional(),
  section_e_priority: SectionESchema.optional(),

  // Additional Fields
  attachments: AttachmentsSchema.optional(),
  project: ProjectSchema.optional(),
});

export type Intake = z.infer<typeof IntakeSchema>;

// =============================================================================
// Partial Intake (for incremental validation)
// =============================================================================

export const PartialIntakeSchema = IntakeSchema.partial();

export type PartialIntake = z.infer<typeof PartialIntakeSchema>;

// =============================================================================
// Intake Extraction Result (wrapper with metadata)
// =============================================================================

export const IntakeExtractionResultSchema = z.object({
  success: z.boolean(),
  intake: IntakeSchema.optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  extraction_time_ms: z.number().optional(),
  model_used: z.string().optional(),
  retry_count: z.number().optional(),
});

export type IntakeExtractionResult = z.infer<typeof IntakeExtractionResultSchema>;
