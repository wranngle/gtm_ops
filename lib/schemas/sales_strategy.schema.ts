/**
 * Sales Strategy Schema - Internal sales playbook configuration
 * @module lib/schemas/sales_strategy.schema
 *
 * This schema validates the sales strategy configuration loaded from
 * config/sales_strategy.json. Data is injected ONLY into internal
 * templates, never client-facing documents.
 */

import { z } from 'zod';

// =============================================================================
// Market Context
// =============================================================================

export const CoreProblemSchema = z.object({
  headline: z.string(),
  description: z.string(),
});

export const ValueMetricSchema = z.object({
  range_low: z.number().optional(),
  range_high: z.number().optional(),
  display: z.string(),
  description: z.string(),
  citation: z.string().optional(),
  percent: z.number().optional(),
});

export const AnnualLossEstimateSchema = z.object({
  segment: z.string(),
  amount: z.number().optional(),
  display: z.string(),
  assumption: z.string(),
  citation: z.string().optional(),
});

export const SpeedToLeadSchema = z.object({
  window_minutes: z.number(),
  display: z.string(),
  description: z.string(),
  citation: z.string().optional(),
});

export const CompetitorPivotSchema = z.object({
  percent: z.number(),
  display: z.string(),
  description: z.string(),
  citation: z.string().optional(),
});

export const CompetitiveLandscapeItemSchema = z.object({
  option: z.string(),
  cost: z.string(),
  limitations: z.string(),
  citation: z.string().optional(),
});

export const WebChatEconomicsSchema = z.object({
  text_preference_percent: z.number(),
  display: z.string(),
  description: z.string(),
  zero_click_lead: z.string(),
  citation: z.string().optional(),
});

export const MarketContextSchema = z.object({
  core_problem: CoreProblemSchema,
  missed_call_value: ValueMetricSchema,
  voicemail_abandonment: ValueMetricSchema,
  speed_to_lead: SpeedToLeadSchema.optional(),
  competitor_pivot: CompetitorPivotSchema.optional(),
  competitive_landscape: z.array(CompetitiveLandscapeItemSchema).optional(),
  web_chat_economics: WebChatEconomicsSchema.optional(),
  annual_loss_estimates: z.array(AnnualLossEstimateSchema),
  value_framing: z.string(),
});

export type MarketContext = z.infer<typeof MarketContextSchema>;

// =============================================================================
// Pricing Strategy
// =============================================================================

export const PricingPackageSchema = z.object({
  name: z.string(),
  label: z.string(),
  price: z.number(),
  period: z.string(),
  display: z.string(),
  includes: z.string(),
  badge: z.string(),
  badge_class: z.enum(['info', 'healthy', 'warning', 'critical']),
  is_anchor: z.boolean().optional(),
  is_target: z.boolean().optional(),
  is_floor: z.boolean().optional(),
  floor_price: z.number().optional(),
});

export const PricingStrategySchema = z.object({
  approach: z.string(),
  packages: z.array(PricingPackageSchema),
});

export type PricingStrategy = z.infer<typeof PricingStrategySchema>;

// =============================================================================
// Compensation Structure
// =============================================================================

export const CompensationComponentSchema = z.object({
  name: z.string(),
  structure: z.string(),
  rationale: z.string(),
  citation: z.string().optional(),
});

export const EstimatedMetricsSchema = z.object({
  monthly_churn: z.string().optional(),
  annual_contract_value: z.string().optional(),
});

export const VestingSchema = z.object({
  schedule: z.string(),
  mechanism: z.string(),
});

export const PerformanceVestingSchema = z.object({
  description: z.string(),
  milestones: z.array(z.string()),
  rationale: z.string(),
});

export const EquityStructureSchema = z.object({
  range: z.string(),
  rationale: z.string(),
  vesting: VestingSchema,
  performance_vesting: PerformanceVestingSchema,
  citation: z.string().optional(),
});

export const CompensationSchema = z.object({
  role_type: z.string(),
  components: z.array(CompensationComponentSchema),
  equity: EquityStructureSchema.optional(),
  estimated_metrics: EstimatedMetricsSchema.optional(),
});

export type Compensation = z.infer<typeof CompensationSchema>;

// =============================================================================
// Scripts
// =============================================================================

export const ScriptSegmentSchema = z.object({
  label: z.string(),
  script: z.string(),
});

export const ColdCallScriptSchema = z.object({
  goal: z.string(),
  segments: z.array(ScriptSegmentSchema),
});

export const AlternateScriptSchema = z.object({
  goal: z.string(),
  segments: z.array(ScriptSegmentSchema),
  why_it_works: z.string(),
});

export const ScriptsSchema = z.object({
  cold_call: ColdCallScriptSchema,
  plumbers_nightmare: AlternateScriptSchema.optional(),
  reciprocity_negotiation: AlternateScriptSchema.optional(),
});

export type Scripts = z.infer<typeof ScriptsSchema>;

// =============================================================================
// Objections
// =============================================================================

export const ObjectionSchema = z.object({
  trigger: z.string(),
  response: z.string(),
  citation: z.string().optional(),
  _last: z.boolean().optional(), // Mustache helper for last item styling
});

export type Objection = z.infer<typeof ObjectionSchema>;

// =============================================================================
// Compliance
// =============================================================================

export const ComplianceNoteSchema = z.object({
  title: z.string(),
  content: z.string(),
  citation: z.string().optional(),
  style: z.string().optional(),
  style_warning: z.boolean().optional(),
  style_healthy: z.boolean().optional(),
});

export type ComplianceNote = z.infer<typeof ComplianceNoteSchema>;

// =============================================================================
// Sources
// =============================================================================

export const SourcesSchema = z.object({
  label: z.string(),
  citations: z.string(),
});

// =============================================================================
// Complete Sales Strategy Schema
// =============================================================================

export const SalesStrategySchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default('1.0.0'),
  industry: z.string().optional(),
  industry_label: z.string(),
  product_name: z.string().optional(),
  last_updated: z.string().optional(),

  market_context: MarketContextSchema,
  pricing_strategy: PricingStrategySchema,
  compensation: CompensationSchema,
  scripts: ScriptsSchema,
  objections: z.array(ObjectionSchema),
  compliance: z.array(ComplianceNoteSchema),
  sources: SourcesSchema,
});

export type SalesStrategy = z.infer<typeof SalesStrategySchema>;

// =============================================================================
// Validation Helper
// =============================================================================

/**
 * Validates sales strategy configuration with helpful error messages.
 * Returns null if file doesn't exist or is invalid (graceful degradation).
 */
export function validateSalesStrategy(data: unknown): SalesStrategy | null {
  const result = SalesStrategySchema.safeParse(data);

  if (result.success) {
    // Add _last flag to last objection for Mustache styling
    const strategy = result.data;
    if (strategy.objections.length > 0) {
      strategy.objections[strategy.objections.length - 1]._last = true;
    }
    return strategy;
  }

  console.warn(
    '[SALES_STRATEGY] Validation failed, internal sheet will render without sales data:',
    result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  );

  return null;
}
