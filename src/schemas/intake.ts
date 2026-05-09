/**
 * Intake Schema
 *
 * Validates LLM extraction output from raw input documents.
 * Uses ArkType's `[string]: unknown` index signature to mirror zod's
 * `.passthrough()` semantics — extra fields are allowed during migration.
 *
 * @module src/schemas/intake
 */

import { type } from 'arktype';
import { PreparedForSchema } from './identity.js';

// =============================================================================
// SECTION A: OVERVIEW
// =============================================================================

export const SectionAOverviewSchema = type({
  process_under_review: 'string >= 1',
  'primary_objective?': 'string',
  'business_context?': 'string',
  'stakeholders?': 'string[]',
  '[string]': 'unknown',
});

// =============================================================================
// SECTION B: WORKFLOW DETAILS
// =============================================================================

export const WorkflowStepSchema = type({
  'step_number?': 'number.integer > 0',
  description: 'string',
  'actor?': 'string',
  'system?': 'string',
  'duration_estimate?': 'string',
  '[string]': 'unknown',
});

export const SectionBWorkflowSchema = type({
  'workflow_name?': 'string',
  'trigger?': 'string',
  'frequency?': 'string',
  'steps?': WorkflowStepSchema.array(),
  'bottlenecks?': 'string[]',
  '[string]': 'unknown',
});

// =============================================================================
// SECTION C: SYSTEMS & HANDOFFS
// =============================================================================

export const SystemInvolvedSchema = type({
  system_name: 'string',
  'role_in_process?': 'string',
  'integration_type?': "'native' | 'api' | 'manual' | 'unknown'",
  'complexity?': "'low' | 'medium' | 'high'",
  '[string]': 'unknown',
});

const HandoffSchema = type({
  from: 'string',
  to: 'string',
  'method?': 'string',
});

export const SectionCSystemsSchema = type({
  'systems_involved?': SystemInvolvedSchema.array(),
  'handoffs?': HandoffSchema.array(),
  'pain_points?': 'string[]',
  '[string]': 'unknown',
});

// =============================================================================
// SECTION D: VOLUME & METRICS
// =============================================================================

export const MetricSchema = type({
  name: 'string',
  value: 'number | string',
  'unit?': 'string',
  'period?': 'string',
  'source?': 'string',
  '[string]': 'unknown',
});

const LaborCostContextSchema = type({
  'hourly_rate?': 'number',
  'salary_annual?': 'number',
  'fte_count?': 'number',
});

export const SectionDMetricsSchema = type({
  'volume_per_day?': 'number',
  'volume_per_week?': 'number',
  'volume_per_month?': 'number',
  'time_per_item_minutes?': 'number',
  'time_per_item_hours?': 'number',
  'metrics?': MetricSchema.array(),
  'labor_cost_context?': LaborCostContextSchema,
  '[string]': 'unknown',
});

// =============================================================================
// SECTION E: GOALS & SUCCESS CRITERIA
// =============================================================================

export const SuccessCriterionSchema = type({
  criterion: 'string',
  'measurable?': 'boolean',
  'target?': 'string',
  '[string]': 'unknown',
});

export const SectionEGoalsSchema = type({
  'primary_goals?': 'string[]',
  'success_criteria?': SuccessCriterionSchema.array(),
  'constraints?': 'string[]',
  'timeline_requirements?': 'string',
  '[string]': 'unknown',
});

// =============================================================================
// FULL INTAKE
// =============================================================================

export const IntakeSchema = type({
  'prepared_for?': PreparedForSchema,
  'section_a_overview?': SectionAOverviewSchema,
  'section_b_workflow?': SectionBWorkflowSchema,
  'section_c_systems_handoffs?': SectionCSystemsSchema,
  'section_d_volume_metrics?': SectionDMetricsSchema,
  'section_e_goals?': SectionEGoalsSchema,
  'process_name?': 'string',
  'workflow_name?': 'string',
  'trigger?': 'string',
  'objective?': 'string',
  'extraction_confidence?': "'high' | 'medium' | 'low'",
  'extraction_notes?': 'string[]',
  '[string]': 'unknown',
});

export type Intake = typeof IntakeSchema.infer;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateIntake(data: unknown): {
  valid: boolean;
  data: Partial<Intake>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const result = IntakeSchema(data);

  if (!(result instanceof type.errors)) {
    return { valid: true, data: result, warnings };
  }

  const partial: Partial<Intake> = {};
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      partial[key as keyof Intake] = value as never;
    }
    for (const issue of [...result] as any[]) {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? '');
      warnings.push(`${path}: ${issue.message ?? String(issue)}`);
    }
  }

  return { valid: false, data: partial, warnings };
}

export function extractMetrics(intake: Intake): {
  volume_per_day?: number;
  minutes_per_item?: number;
  hourly_rate?: number;
} {
  const metrics = intake.section_d_volume_metrics ?? {};
  const laborContext = metrics.labor_cost_context ?? {};

  return {
    volume_per_day: metrics.volume_per_day,
    minutes_per_item: metrics.time_per_item_minutes ??
      (metrics.time_per_item_hours ? metrics.time_per_item_hours * 60 : undefined),
    hourly_rate: laborContext.hourly_rate,
  };
}
