/**
 * Pipeline Data Factory
 * Provides pre-computed pipeline stage outputs for testing
 * Eliminates need for LLM calls in most tests
 */
import { join } from 'path';
import { faker } from '@faker-js/faker';
import { createDentalIntake, type IntakeData } from './intake.factory';
import { createIntegrationResearch, type IntegrationResearch } from './integration.factory';

/**
 * Project Identity - Generated from intake
 */
export type ProjectIdentity = {
  client_name: string;
  client_slug: string;
  process_name: string;
  process_slug: string;
  friendly_name: string;
  document_slug: string;
  process_date: string;
  process_date_display: string;
  valid_until: string;
  valid_until_display: string;
  year: number;
}

export function createProjectIdentity(overrides: Partial<ProjectIdentity> = {}): ProjectIdentity {
  const clientName = overrides.client_name || 'Bright Smile Dental';
  const clientSlug = clientName.toLowerCase().replaceAll(/[^a-z\d]+/g, '-').slice(0, 15);
  const processName = overrides.process_name || 'Patient Scheduling';
  const processSlug = processName.toLowerCase().replaceAll(/[^a-z\d]+/g, '-').slice(0, 15);
  const year = new Date().getFullYear();

  return {
    client_name: clientName,
    client_slug: clientSlug,
    process_name: processName,
    process_slug: processSlug,
    friendly_name: overrides.friendly_name || 'Operation Smile Boost',
    document_slug: `WRN-AI-${clientSlug}-${processSlug}-${String(year).slice(2)}r1`,
    process_date: new Date().toISOString().split('T')[0],
    process_date_display: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    valid_until_display: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    year,
    ...overrides
  };
}

/**
 * Tier Assessment
 */
export type TierAssessment = {
  key: string;
  label: string;
  base_hours: number;
  risk_multiplier: number;
  rationale: string;
}

export function createTierAssessment(overrides: Partial<TierAssessment> = {}): TierAssessment {
  const tiers = [
    { key: 'standard', label: 'Standard', base_hours: 80, risk_multiplier: 1 },
    { key: 'moderate', label: 'Moderate', base_hours: 120, risk_multiplier: 1.15 },
    { key: 'complex', label: 'Complex', base_hours: 180, risk_multiplier: 1.3 },
    { key: 'enterprise', label: 'Enterprise', base_hours: 280, risk_multiplier: 1.5 }
  ];

  const selected = faker.helpers.arrayElement(tiers);

  return {
    key: selected.key,
    label: selected.label,
    base_hours: selected.base_hours,
    risk_multiplier: selected.risk_multiplier,
    rationale: `Selected ${selected.label} tier based on integration complexity and volume requirements.`,
    ...overrides
  };
}

/**
 * Bleed Calculation
 */
export type BleedCalculation = {
  volume_per_period: number;
  period_unit: string;
  current_cost_per_item: number;
  monthly_volume: number;
  annual_volume: number;
  monthly_bleed: number;
  annual_bleed: number;
  monthly_bleed_display: string;
  annual_bleed_display: string;
}

export function createBleedCalculation(overrides: Partial<BleedCalculation> = {}): BleedCalculation {
  const volumePerPeriod = overrides.volume_per_period || faker.number.int({ min: 100, max: 500 });
  const periodUnit = overrides.period_unit || 'day';
  const costPerItem = overrides.current_cost_per_item || faker.number.float({ min: 5, max: 25, fractionDigits: 2 });

  // Calculate monthly volume based on period
  let monthlyVolume: number;
  switch (periodUnit) {
    case 'day': {
      monthlyVolume = volumePerPeriod * 22; // Working days
      break;
    }

    case 'week': {
      monthlyVolume = volumePerPeriod * 4;
      break;
    }

    case 'month': {
      monthlyVolume = volumePerPeriod;
      break;
    }

    default: {
      monthlyVolume = volumePerPeriod * 22;
    }
  }

  const annualVolume = monthlyVolume * 12;
  const monthlyBleed = Math.round(monthlyVolume * costPerItem);
  const annualBleed = monthlyBleed * 12;

  return {
    volume_per_period: volumePerPeriod,
    period_unit: periodUnit,
    current_cost_per_item: costPerItem,
    monthly_volume: monthlyVolume,
    annual_volume: annualVolume,
    monthly_bleed: monthlyBleed,
    annual_bleed: annualBleed,
    monthly_bleed_display: `$${monthlyBleed.toLocaleString()}`,
    annual_bleed_display: `$${annualBleed.toLocaleString()}`,
    ...overrides
  };
}

/**
 * Pricing Structure
 */
export type PricingStructure = {
  currency: string;
  pricing_model: string;
  hourly_rate: number;
  total_hours: number;
  subtotal: number;
  audit_credit: number | undefined;
  early_adopter_discount: number | undefined;
  final_price: number;
  final_price_display: string;
  milestones: Record<string, MilestonePayment>;
}

export type MilestonePayment = {
  milestone_name: string;
  percentage: number;
  amount: number;
  amount_display: string;
}

export function createPricingStructure(totalHours?: number, overrides: Partial<PricingStructure> = {}): PricingStructure {
  const hours = totalHours || faker.number.int({ min: 80, max: 200 });
  const hourlyRate = overrides.hourly_rate || 95;
  const subtotal = hours * hourlyRate;
  const auditCredit = overrides.audit_credit ?? 500;
  const discount = overrides.early_adopter_discount ?? 0;
  const finalPrice = subtotal - (auditCredit || 0) - (discount || 0);

  const milestones: Record<string, MilestonePayment> = {
    design: {
      milestone_name: 'Design & Planning',
      percentage: 20,
      amount: Math.round(finalPrice * 0.2),
      amount_display: `$${Math.round(finalPrice * 0.2).toLocaleString()}`
    },
    build: {
      milestone_name: 'Build & Configure',
      percentage: 45,
      amount: Math.round(finalPrice * 0.45),
      amount_display: `$${Math.round(finalPrice * 0.45).toLocaleString()}`
    },
    test: {
      milestone_name: 'Test & Refine',
      percentage: 25,
      amount: Math.round(finalPrice * 0.25),
      amount_display: `$${Math.round(finalPrice * 0.25).toLocaleString()}`
    },
    deploy: {
      milestone_name: 'Deploy & Support',
      percentage: 10,
      amount: Math.round(finalPrice * 0.1),
      amount_display: `$${Math.round(finalPrice * 0.1).toLocaleString()}`
    }
  };

  return {
    currency: 'USD',
    pricing_model: 'fixed_price',
    hourly_rate: hourlyRate,
    total_hours: hours,
    subtotal,
    audit_credit: auditCredit,
    early_adopter_discount: discount,
    final_price: finalPrice,
    final_price_display: `$${finalPrice.toLocaleString()}`,
    milestones,
    ...overrides
  };
}

/**
 * FinOps / ROI Calculation
 */
export type FinOpsCalculation = {
  payback_period_months: number;
  payback_period_display: string;
  roi_percentage: number;
  value_breakdown: {
    hard_savings: { monthly: number; annual: number; monthly_display: string; annual_display: string };
    modeled_opportunity: { monthly: number; annual: number; monthly_display: string; annual_display: string };
    total_monthly_value: number;
    total_annual_value: number;
    total_monthly_display: string;
    total_annual_display: string;
  };
}

export function createFinOpsCalculation(pricing?: PricingStructure, bleed?: BleedCalculation): FinOpsCalculation {
  const pricingData = pricing || createPricingStructure();
  const bleedData = bleed || createBleedCalculation();

  // Hard savings = 70% of bleed captured
  const hardSavingsMonthly = Math.round(bleedData.monthly_bleed * 0.7);
  const hardSavingsAnnual = hardSavingsMonthly * 12;

  // Modeled opportunity = 30% additional
  const modeledMonthly = Math.round(bleedData.monthly_bleed * 0.3);
  const modeledAnnual = modeledMonthly * 12;

  const totalMonthly = hardSavingsMonthly + modeledMonthly;
  const totalAnnual = hardSavingsAnnual + modeledAnnual;

  // Payback = investment / monthly savings
  const paybackMonths = totalMonthly > 0 ? Math.ceil(pricingData.final_price / totalMonthly) : 12;

  // ROI = (annual value - investment) / investment * 100
  const roi = pricingData.final_price > 0
    ? Math.round(((totalAnnual - pricingData.final_price) / pricingData.final_price) * 100)
    : 0;

  return {
    payback_period_months: paybackMonths,
    payback_period_display: paybackMonths <= 1 ? '< 1 month' : `${paybackMonths} months`,
    roi_percentage: roi,
    value_breakdown: {
      hard_savings: {
        monthly: hardSavingsMonthly,
        annual: hardSavingsAnnual,
        monthly_display: `$${hardSavingsMonthly.toLocaleString()}`,
        annual_display: `$${hardSavingsAnnual.toLocaleString()}`
      },
      modeled_opportunity: {
        monthly: modeledMonthly,
        annual: modeledAnnual,
        monthly_display: `$${modeledMonthly.toLocaleString()}`,
        annual_display: `$${modeledAnnual.toLocaleString()}`
      },
      total_monthly_value: totalMonthly,
      total_annual_value: totalAnnual,
      total_monthly_display: `$${totalMonthly.toLocaleString()}`,
      total_annual_display: `$${totalAnnual.toLocaleString()}`
    }
  };
}

/**
 * Technical Approach
 */
export type TechnicalApproach = {
  summary: string;
  technology_stack: string[];
  integrations: IntegrationItem[];
  labor_factors: LaborFactor[];
  citations: Citation[];
}

export type IntegrationItem = {
  system: string;
  type: string;
  complexity: string;
  has_native_node: boolean;
  notes: string;
}

export type LaborFactor = {
  factor: string;
  impact: string;
  hours_adjustment: number;
}

export type Citation = {
  id: number;
  url: string;
  type: string;
}

export function createTechnicalApproach(systems?: string[]): TechnicalApproach {
  const defaultSystems = [
    'Dentrix G7 (Practice Management)',
    'Weave (Phone/SMS)',
    'Google Calendar',
    'Rectangle Health (Payments)'
  ];

  const systemList = systems || defaultSystems;

  const integrations: IntegrationItem[] = systemList.map((sys, idx) => ({
    system: sys.split(' (')[0],
    type: sys.includes('(') ? (/\(([^)]+)\)/.exec(sys))?.[1] || 'Integration' : 'Integration',
    complexity: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
    has_native_node: faker.datatype.boolean(),
    notes: `Standard ${sys.split(' ')[0]} integration`
  }));

  return {
    summary: `Automation workflow connecting ${systemList.length} systems using n8n orchestration with LLM-assisted decision making.`,
    technology_stack: ['n8n', 'Node.js', 'PostgreSQL', 'Redis', ...systemList.map(s => s.split(' ')[0])],
    integrations,
    labor_factors: [
      { factor: 'Multiple legacy systems', impact: 'Medium', hours_adjustment: 8 },
      { factor: 'Complex data mapping', impact: 'Low', hours_adjustment: 4 }
    ],
    citations: [
      { id: 1, url: 'https://docs.n8n.io/integrations/', type: 'documentation' }
    ]
  };
}

/**
 * Complete Pipeline Schema
 */
export type PipelineSchema = {
  $schema: string;
  version: string;
  generated_at: string;
  project_identity: ProjectIdentity;
  intake: IntakeData;
  tier_assessment: TierAssessment;
  bleed: BleedCalculation;
  pricing: PricingStructure;
  finops: FinOpsCalculation;
  technical_approach: TechnicalApproach;
  integration_research: IntegrationResearch[];
}

export function createPipelineSchema(overrides: Partial<PipelineSchema> = {}): PipelineSchema {
  const intake = overrides.intake || createDentalIntake();
  const tier = overrides.tier_assessment || createTierAssessment({ key: 'moderate', label: 'Moderate', base_hours: 120 });
  const bleed = overrides.bleed || createBleedCalculation();
  const pricing = overrides.pricing || createPricingStructure(tier.base_hours);
  const finops = overrides.finops || createFinOpsCalculation(pricing, bleed);
  const techApproach = overrides.technical_approach || createTechnicalApproach(intake.section_c_systems_handoffs.q10_systems_involved);

  return {
    $schema: 'wranngle://presales/v2',
    version: '2.0.0',
    generated_at: new Date().toISOString(),
    project_identity: overrides.project_identity || createProjectIdentity({
      client_name: intake.prepared_for.account_name,
      process_name: intake.section_a_workflow_definition.q01_workflow_name
    }),
    intake,
    tier_assessment: tier,
    bleed,
    pricing,
    finops,
    technical_approach: techApproach,
    integration_research: overrides.integration_research || [createIntegrationResearch()],
    ...overrides
  };
}

/**
 * Pipeline Result (what run() returns)
 */
export type PipelineResult = {
  success: boolean;
  stats: {
    startTime: number;
    endTime: number;
    duration: number;
    stages: Record<string, unknown>;
  };
  outputs: {
    html: string;
    pdf: string;
    json: string;
  };
  schema: PipelineSchema;
  error?: Error;
}

export function createPipelineResult(success = true, schema?: PipelineSchema): PipelineResult {
  const outputDir = join(process.cwd(), 'output_test');
  const schemaData = schema || createPipelineSchema();
  const slug = schemaData.project_identity.document_slug;

  return {
    success,
    stats: {
      startTime: Date.now() - 30_000,
      endTime: Date.now(),
      duration: 30_000,
      stages: {
        extract: { duration: 5000 },
        research: { duration: 3000 },
        estimate: { duration: 2000 },
        render: { duration: 10_000 },
        polish: { duration: 8000 },
        pdf: { duration: 2000 }
      }
    },
    outputs: {
      html: `${outputDir}/${slug}/unified_report_${slug}.html`,
      pdf: `${outputDir}/${slug}/unified_report_${slug}.pdf`,
      json: `${outputDir}/${slug}/unified_schema_${slug}.json`
    },
    schema: schemaData
  };
}
