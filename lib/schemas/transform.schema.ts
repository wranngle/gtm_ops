/**
 * Transform Schema - Template context for Mustache rendering
 * @module lib/schemas/transform.schema
 */

import { z } from 'zod';

// =============================================================================
// Project Identity
// =============================================================================

export const ProjectIdentitySchema = z.object({
  client_name: z.string(),
  process_name: z.string(),
  friendly_name: z.string().optional(),
  document_slug: z.string(),
  process_date_display: z.string(),
  valid_until_display: z.string().optional(),
  year: z.number(),
});

export type ProjectIdentity = z.infer<typeof ProjectIdentitySchema>;

// =============================================================================
// Technical Approach
// =============================================================================

export const TechStackItemSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  version: z.string().optional(),
});

export type TechStackItem = z.infer<typeof TechStackItemSchema>;

export const IntegrationRowSchema = z.object({
  system: z.string(),
  type: z.string().optional(),
  complexity: z.string().optional(),
  complexity_score: z.number().optional(),
  has_native_node: z.boolean().optional(),
  native_node_name: z.string().optional(),
  notes: z.string().optional(),
});

export type IntegrationRow = z.infer<typeof IntegrationRowSchema>;

export const TechnicalApproachSchema = z.object({
  summary: z.string().optional(),
  technology_stack: z.array(TechStackItemSchema).default([]),
  integrations: z.array(IntegrationRowSchema).default([]),
  labor_factors: z.array(z.object({
    factor: z.string(),
    impact: z.string(),
    notes: z.string().optional(),
  })).default([]),
  citations: z.array(z.object({
    id: z.number().optional(),
    url: z.string(),
    type: z.string().optional(),
  })).default([]),
});

export type TechnicalApproach = z.infer<typeof TechnicalApproachSchema>;

// =============================================================================
// Scorecard Row (AI Audit)
// =============================================================================

export const ScorecardRowSchema = z.object({
  name: z.string(),
  status: z.enum(['healthy', 'warning', 'critical']),
  status_is_critical: z.boolean().optional(),
  status_is_warning: z.boolean().optional(),
  status_is_healthy: z.boolean().optional(),
  value: z.string().optional(),
  value_display: z.string().optional(),
  has_metrics: z.boolean().optional(),
  description: z.string().optional(),
});

export type ScorecardRow = z.infer<typeof ScorecardRowSchema>;

// =============================================================================
// Rendering Metadata
// =============================================================================

export const RenderingSchema = z.object({
  is_conversion_mode: z.boolean().default(false),
  is_efficiency_mode: z.boolean().default(true),
  show_roi_section: z.boolean().default(true),
  show_payment_schedule: z.boolean().default(true),
  show_risk_section: z.boolean().default(true),
});

export type Rendering = z.infer<typeof RenderingSchema>;

// =============================================================================
// Payment Schedule Item
// =============================================================================

export const PaymentScheduleItemSchema = z.object({
  name: z.string(),
  percentage: z.number().min(0).max(1),
  percentage_display: z.string(),
  amount: z.number().nonnegative(),
  amount_display: z.string(),
  trigger: z.string().optional(),
});

export type PaymentScheduleItem = z.infer<typeof PaymentScheduleItemSchema>;

// =============================================================================
// Neural Ops Tier (Proposal)
// =============================================================================

export const NeuralOpsTierSchema = z.object({
  name: z.string(),
  price: z.number().nonnegative(),
  price_display: z.string(),
  hours: z.number().nonnegative(),
  features: z.array(z.string()).default([]),
  is_recommended: z.boolean().default(false),
});

export type NeuralOpsTier = z.infer<typeof NeuralOpsTierSchema>;

// =============================================================================
// Complete Transform Context
// =============================================================================

export const TransformContextSchema = z.object({
  // Identity
  identity: ProjectIdentitySchema,

  // Shared CSS (rendered inline)
  shared_css: z.string().optional(),

  // Pre-rendered header/footer HTML
  unified_header_html: z.string().optional(),
  unified_footer_html: z.string().optional(),

  // Rendering flags
  rendering: RenderingSchema.optional(),

  // AI Audit Sheet
  scorecard: z.object({
    rows: z.array(ScorecardRowSchema).default([]),
    summary: z.string().optional(),
  }).optional(),

  // Bleed section
  bleed: z.object({
    period: z.string().optional(),
    period_display: z.string().optional(),
    total: z.object({
      value: z.number(),
      display: z.string(),
    }).optional(),
    calculations: z.array(z.object({
      label: z.string(),
      formula: z.string().optional(),
      result_display: z.string(),
    })).optional(),
  }).optional(),

  // Executive Summary
  executive_summary: z.string().optional(),
  recommendations: z.array(z.string()).optional(),

  // Project Plan Sheet
  milestones: z.array(z.object({
    number: z.string(),
    name: z.string(),
    description: z.string().optional(),
    deliverables: z.array(z.string()).optional(),
    hours_display: z.string().optional(),
    duration_display: z.string().optional(),
  })).optional(),

  timeline: z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    total_days: z.number().optional(),
    total_days_display: z.string().optional(),
  }).optional(),

  // Proposal Sheet
  pricing: z.object({
    subtotal: z.number().optional(),
    subtotal_display: z.string().optional(),
    contingency: z.number().optional(),
    contingency_display: z.string().optional(),
    total: z.number().optional(),
    total_display: z.string().optional(),
  }).optional(),

  payment_schedule: z.array(PaymentScheduleItemSchema).optional(),

  roi: z.object({
    payback_months: z.number().optional(),
    payback_display: z.string().optional(),
    annual_roi: z.number().optional(),
    annual_roi_display: z.string().optional(),
    annual_value: z.number().optional(),
    annual_value_display: z.string().optional(),
    value_breakdown: z.object({
      hard_savings: z.object({
        annual: z.number().optional(),
        annual_display: z.string().optional(),
        monthly: z.number().optional(),
        monthly_display: z.string().optional(),
      }).optional(),
      modeled_opportunity: z.object({
        annual: z.number().optional(),
        annual_display: z.string().optional(),
        monthly: z.number().optional(),
        monthly_display: z.string().optional(),
      }).optional(),
      total_annual_value: z.number().optional(),
      total_annual_display: z.string().optional(),
    }).optional(),
    validation: z.object({
      all_pass: z.boolean().optional(),
      profit_floor: z.object({ passes: z.boolean() }).optional(),
      hard_floor: z.object({ passes: z.boolean() }).optional(),
      payback_check: z.object({ passes: z.boolean() }).optional(),
    }).optional(),
  }).optional(),

  neural_ops_tiers: z.array(NeuralOpsTierSchema).optional(),

  // Scope of Work Sheet
  scope_boundaries: z.object({
    in_scope: z.array(z.string()).default([]),
    out_of_scope: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
    dependencies: z.array(z.string()).default([]),
  }).optional(),

  technical_approach: TechnicalApproachSchema.optional(),

  // Risk section
  risks: z.array(z.object({
    risk: z.string(),
    likelihood: z.string().optional(),
    impact: z.string().optional(),
    mitigation: z.string().optional(),
    is_high: z.boolean().optional(),
  })).optional(),

  // Helper flags for Mustache (computed)
  _has_savings: z.boolean().optional(),
  _has_opportunity: z.boolean().optional(),
  _has_risks: z.boolean().optional(),
  _has_integrations: z.boolean().optional(),
});

export type TransformContext = z.infer<typeof TransformContextSchema>;
