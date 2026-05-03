/**
 * Intake Schema
 * 
 * Validates LLM extraction output from raw input documents.
 * Uses .passthrough() to allow unknown fields during migration.
 * 
 * @module src/schemas/intake
 */

import { z } from 'zod';
import { PreparedForSchema } from './identity.js';

// =============================================================================
// SECTION A: OVERVIEW
// =============================================================================

export const SectionAOverviewSchema = z.object({
  process_under_review: z.string().min(1),
  primary_objective: z.string().optional(),
  business_context: z.string().optional(),
  stakeholders: z.array(z.string()).optional()
}).passthrough(); // Allow additional fields from LLM

// =============================================================================
// SECTION B: WORKFLOW DETAILS
// =============================================================================

export const WorkflowStepSchema = z.object({
  step_number: z.number().int().positive().optional(),
  description: z.string(),
  actor: z.string().optional(),
  system: z.string().optional(),
  duration_estimate: z.string().optional()
}).passthrough();

export const SectionBWorkflowSchema = z.object({
  workflow_name: z.string().optional(),
  trigger: z.string().optional(),
  frequency: z.string().optional(),
  steps: z.array(WorkflowStepSchema).optional(),
  bottlenecks: z.array(z.string()).optional()
}).passthrough();

// =============================================================================
// SECTION C: SYSTEMS & HANDOFFS
// =============================================================================

export const SystemInvolvedSchema = z.object({
  system_name: z.string(),
  role_in_process: z.string().optional(),
  integration_type: z.enum(['native', 'api', 'manual', 'unknown']).optional(),
  complexity: z.enum(['low', 'medium', 'high']).optional()
}).passthrough();

export const SectionCSystemsSchema = z.object({
  systems_involved: z.array(SystemInvolvedSchema).optional(),
  handoffs: z.array(z.object({
    from: z.string(),
    to: z.string(),
    method: z.string().optional()
  })).optional(),
  pain_points: z.array(z.string()).optional()
}).passthrough();

// =============================================================================
// SECTION D: VOLUME & METRICS
// =============================================================================

export const MetricSchema = z.object({
  name: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  period: z.string().optional(),
  source: z.string().optional()
}).passthrough();

export const SectionDMetricsSchema = z.object({
  volume_per_day: z.number().optional(),
  volume_per_week: z.number().optional(),
  volume_per_month: z.number().optional(),
  time_per_item_minutes: z.number().optional(),
  time_per_item_hours: z.number().optional(),
  metrics: z.array(MetricSchema).optional(),
  labor_cost_context: z.object({
    hourly_rate: z.number().optional(),
    salary_annual: z.number().optional(),
    fte_count: z.number().optional()
  }).optional()
}).passthrough();

// =============================================================================
// SECTION E: GOALS & SUCCESS CRITERIA
// =============================================================================

export const SuccessCriterionSchema = z.object({
  criterion: z.string(),
  measurable: z.boolean().optional(),
  target: z.string().optional()
}).passthrough();

export const SectionEGoalsSchema = z.object({
  primary_goals: z.array(z.string()).optional(),
  success_criteria: z.array(SuccessCriterionSchema).optional(),
  constraints: z.array(z.string()).optional(),
  timeline_requirements: z.string().optional()
}).passthrough();

// =============================================================================
// FULL INTAKE
// =============================================================================

/**
 * Complete intake schema
 * 
 * Uses .passthrough() at all levels to allow additional fields from LLM.
 * This is intentional during migration - can tighten later.
 */
export const IntakeSchema = z.object({
  // Client information
  prepared_for: PreparedForSchema.optional(),
  
  // Structured sections
  section_a_overview: SectionAOverviewSchema.optional(),
  section_b_workflow: SectionBWorkflowSchema.optional(),
  section_c_systems_handoffs: SectionCSystemsSchema.optional(),
  section_d_volume_metrics: SectionDMetricsSchema.optional(),
  section_e_goals: SectionEGoalsSchema.optional(),
  
  // Legacy flat fields (for backward compatibility)
  process_name: z.string().optional(),
  workflow_name: z.string().optional(),
  trigger: z.string().optional(),
  objective: z.string().optional(),
  
  // Extraction metadata
  extraction_confidence: z.enum(['high', 'medium', 'low']).optional(),
  extraction_notes: z.array(z.string()).optional()
}).passthrough();

export type Intake = z.infer<typeof IntakeSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate intake with permissive defaults
 * 
 * Returns validated data even if some fields are missing.
 * Use for LLM output which may be incomplete.
 */
export function validateIntake(data: unknown): {
  valid: boolean;
  data: Partial<Intake>;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Try strict parse first
  const strictResult = IntakeSchema.safeParse(data);
  if (strictResult.success) {
    return { valid: true, data: strictResult.data, warnings };
  }
  
  // If strict fails, try to salvage what we can
  const partial: Partial<Intake> = {};
  
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    
    // Copy over any valid fields
    for (const [key, value] of Object.entries(obj)) {
      partial[key as keyof Intake] = value as any;
    }
    
    // Log what failed
    for (const error of strictResult.error.issues) {
      warnings.push(`${error.path.join('.')}: ${error.message}`);
    }
  }
  
  return { 
    valid: false, 
    data: partial, 
    warnings 
  };
}

/**
 * Extract key metrics from intake
 */
export function extractMetrics(intake: Intake): {
  volume_per_day?: number;
  minutes_per_item?: number;
  hourly_rate?: number;
} {
  const metrics = intake.section_d_volume_metrics || {};
  const laborContext = metrics.labor_cost_context || {};
  
  return {
    volume_per_day: metrics.volume_per_day,
    minutes_per_item: metrics.time_per_item_minutes || 
      (metrics.time_per_item_hours ? metrics.time_per_item_hours * 60 : undefined),
    hourly_rate: laborContext.hourly_rate
  };
}
