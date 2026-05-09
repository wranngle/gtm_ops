/**
 * Sales Strategy Schema - Internal sales playbook configuration
 * @module lib/schemas/sales-strategy.schema
 *
 * This schema validates the sales strategy configuration loaded from
 * config/sales_strategy.json. Data is injected ONLY into internal
 * templates, never client-facing documents.
 */

import { type } from 'arktype';

// =============================================================================
// Market Context
// =============================================================================

export const CoreProblemSchema = type({
  headline: 'string',
  description: 'string',
});

export const ValueMetricSchema = type({
  'range_low?': 'number',
  'range_high?': 'number',
  display: 'string',
  description: 'string',
  'citation?': 'string',
  'percent?': 'number',
});

export const AnnualLossEstimateSchema = type({
  segment: 'string',
  'amount?': 'number',
  display: 'string',
  assumption: 'string',
  'citation?': 'string',
});

export const SpeedToLeadSchema = type({
  window_minutes: 'number',
  display: 'string',
  description: 'string',
  'citation?': 'string',
});

export const CompetitorPivotSchema = type({
  percent: 'number',
  display: 'string',
  description: 'string',
  'citation?': 'string',
});

export const CompetitiveLandscapeItemSchema = type({
  option: 'string',
  cost: 'string',
  limitations: 'string',
  'citation?': 'string',
});

export const WebChatEconomicsSchema = type({
  text_preference_percent: 'number',
  display: 'string',
  description: 'string',
  zero_click_lead: 'string',
  'citation?': 'string',
});

export const MarketContextSchema = type({
  core_problem: CoreProblemSchema,
  missed_call_value: ValueMetricSchema,
  voicemail_abandonment: ValueMetricSchema,
  'speed_to_lead?': SpeedToLeadSchema,
  'competitor_pivot?': CompetitorPivotSchema,
  'competitive_landscape?': CompetitiveLandscapeItemSchema.array(),
  'web_chat_economics?': WebChatEconomicsSchema,
  annual_loss_estimates: AnnualLossEstimateSchema.array(),
  value_framing: 'string',
});

export type MarketContext = typeof MarketContextSchema.infer;

// =============================================================================
// Pricing Strategy
// =============================================================================

export const PricingPackageSchema = type({
  name: 'string',
  label: 'string',
  price: 'number',
  period: 'string',
  display: 'string',
  includes: 'string',
  badge: 'string',
  badge_class: "'info' | 'healthy' | 'warning' | 'critical'",
  'is_anchor?': 'boolean',
  'is_target?': 'boolean',
  'is_floor?': 'boolean',
  'floor_price?': 'number',
});

export const PricingStrategySchema = type({
  approach: 'string',
  packages: PricingPackageSchema.array(),
});

export type PricingStrategy = typeof PricingStrategySchema.infer;

// =============================================================================
// Compensation Structure
// =============================================================================

export const CompensationComponentSchema = type({
  name: 'string',
  structure: 'string',
  rationale: 'string',
  'citation?': 'string',
});

export const EstimatedMetricsSchema = type({
  'monthly_churn?': 'string',
  'annual_contract_value?': 'string',
});

export const VestingSchema = type({
  schedule: 'string',
  mechanism: 'string',
});

export const PerformanceVestingSchema = type({
  description: 'string',
  milestones: 'string[]',
  rationale: 'string',
});

export const EquityStructureSchema = type({
  range: 'string',
  rationale: 'string',
  vesting: VestingSchema,
  performance_vesting: PerformanceVestingSchema,
  'citation?': 'string',
});

export const CompensationSchema = type({
  role_type: 'string',
  components: CompensationComponentSchema.array(),
  'equity?': EquityStructureSchema,
  'estimated_metrics?': EstimatedMetricsSchema,
});

export type Compensation = typeof CompensationSchema.infer;

// =============================================================================
// Scripts
// =============================================================================

export const ScriptSegmentSchema = type({
  label: 'string',
  script: 'string',
});

export const ColdCallScriptSchema = type({
  goal: 'string',
  segments: ScriptSegmentSchema.array(),
});

export const AlternateScriptSchema = type({
  goal: 'string',
  segments: ScriptSegmentSchema.array(),
  why_it_works: 'string',
});

export const ScriptsSchema = type({
  cold_call: ColdCallScriptSchema,
  'plumbers_nightmare?': AlternateScriptSchema,
  'reciprocity_negotiation?': AlternateScriptSchema,
});

export type Scripts = typeof ScriptsSchema.infer;

// =============================================================================
// Objections
// =============================================================================

export const ObjectionSchema = type({
  trigger: 'string',
  response: 'string',
  'citation?': 'string',
  '_last?': 'boolean',
});

export type Objection = typeof ObjectionSchema.infer;

// =============================================================================
// Compliance
// =============================================================================

export const ComplianceNoteSchema = type({
  title: 'string',
  content: 'string',
  'citation?': 'string',
  'style?': 'string',
  'style_warning?': 'boolean',
  'style_healthy?': 'boolean',
});

export type ComplianceNote = typeof ComplianceNoteSchema.infer;

// =============================================================================
// Sources
// =============================================================================

export const SourcesSchema = type({
  label: 'string',
  citations: 'string',
});

// =============================================================================
// Complete Sales Strategy Schema
// =============================================================================

export const SalesStrategySchema = type({
  '$schema?': 'string',
  version: type('string').default('1.0.0'),
  'industry?': 'string',
  industry_label: 'string',
  'product_name?': 'string',
  'last_updated?': 'string',
  market_context: MarketContextSchema,
  pricing_strategy: PricingStrategySchema,
  compensation: CompensationSchema,
  scripts: ScriptsSchema,
  objections: ObjectionSchema.array(),
  compliance: ComplianceNoteSchema.array(),
  sources: SourcesSchema,
});

export type SalesStrategy = typeof SalesStrategySchema.infer;

// =============================================================================
// Validation Helper
// =============================================================================

export function validateSalesStrategy(data: unknown): SalesStrategy | null {
  const result = SalesStrategySchema(data);

  if (!(result instanceof type.errors)) {
    const lastObjection = result.objections.at(-1);
    if (lastObjection) {
      lastObjection._last = true;
    }
    return result;
  }

  console.warn(
    '[SALES_STRATEGY] Validation failed, internal sheet will render without sales data:',
    result.summary,
  );

  return null;
}
