/**
 * Sales Strategy Factory
 *
 * Generates test data for sales strategy configuration.
 * Used for unit and integration tests of internal sheet rendering.
 */
import { faker } from '@faker-js/faker';

export interface MarketContextData {
  core_problem: {
    headline: string;
    description: string;
  };
  missed_call_value: {
    range_low: number;
    range_high: number;
    display: string;
    description: string;
  };
  voicemail_abandonment: {
    percent: number;
    display: string;
    description: string;
  };
  annual_loss_estimates: Array<{
    segment: string;
    amount: number;
    display: string;
    assumption: string;
  }>;
  value_framing: string;
}

export interface PricingPackage {
  name: string;
  label: string;
  price: number;
  period: 'mo' | 'once';
  display: string;
  includes: string;
  badge?: string;
  badge_class?: string;
  is_anchor?: boolean;
  is_target?: boolean;
  floor_price?: number;
}

export interface ScriptSegment {
  label: string;
  script: string;
}

export interface Objection {
  trigger: string;
  response: string;
  citation?: string;
}

export interface ComplianceNote {
  title: string;
  content: string;
  citation?: string;
  style: 'healthy' | 'warning' | 'critical';
}

export interface SalesStrategyData {
  $schema: string;
  version: string;
  industry: string;
  industry_label: string;
  last_updated: string;
  market_context: MarketContextData;
  pricing_strategy: {
    approach: string;
    packages: PricingPackage[];
  };
  compensation: {
    role_type: string;
    components: Array<{
      name: string;
      structure: string;
      rationale: string;
    }>;
  };
  scripts: {
    cold_call: {
      goal: string;
      segments: ScriptSegment[];
    };
  };
  objections: Objection[];
  compliance: ComplianceNote[];
  sources?: {
    label: string;
    citations: string;
  };
}

/**
 * Create default market context data
 */
export function createMarketContext(overrides: Partial<MarketContextData> = {}): MarketContextData {
  return {
    core_problem: {
      headline: 'The Core Problem You\'re Solving',
      description: faker.lorem.sentence(),
    },
    missed_call_value: {
      range_low: faker.number.int({ min: 200, max: 400 }),
      range_high: faker.number.int({ min: 800, max: 1500 }),
      display: '$300 – $1,200',
      description: 'Typical emergency service call value.',
    },
    voicemail_abandonment: {
      percent: 85,
      display: '85%',
      description: 'Percent of callers who hang up on voicemail.',
    },
    annual_loss_estimates: [
      {
        segment: 'Small (1–2 trucks)',
        amount: 62000,
        display: '$62,000+',
        assumption: '~6 missed calls/week',
      },
      {
        segment: 'Mid-size (3–5 trucks)',
        amount: 255000,
        display: '$255,000+',
        assumption: '~20 missed calls/week',
      },
    ],
    value_framing: 'Use these numbers to show that $250/month is a fraction of the problem cost.',
    ...overrides,
  };
}

/**
 * Create a pricing package
 */
export function createPricingPackage(overrides: Partial<PricingPackage> = {}): PricingPackage {
  const price = overrides.price || faker.number.int({ min: 100, max: 1000 });
  return {
    name: overrides.name || faker.commerce.productName(),
    label: overrides.label || faker.commerce.productName(),
    price,
    period: overrides.period || 'mo',
    display: `$${price.toLocaleString()}`,
    includes: overrides.includes || 'Voice + Web',
    ...overrides,
  };
}

/**
 * Create default pricing packages
 */
export function createDefaultPackages(): PricingPackage[] {
  return [
    {
      name: 'Full Bundle',
      label: 'Full Bundle (Start Here)',
      price: 500,
      period: 'mo',
      display: '$500',
      includes: 'Voice + Web + SMS',
      badge: 'Open with this',
      badge_class: 'info',
      is_anchor: true,
    },
    {
      name: 'Core Package',
      label: 'Core Package',
      price: 250,
      period: 'mo',
      display: '$250',
      includes: 'Voice Only',
      badge: 'Target close',
      badge_class: 'healthy',
      is_target: true,
    },
    {
      name: 'Setup Fee',
      label: 'Setup Fee',
      price: 3500,
      period: 'once',
      display: '$3,500',
      includes: 'Can reduce to $1,500 to close',
      badge: 'Negotiable',
      badge_class: 'warning',
      floor_price: 1500,
    },
  ];
}

/**
 * Create a script segment
 */
export function createScriptSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    label: overrides.label || faker.word.words(2),
    script: overrides.script || faker.lorem.paragraph(),
    ...overrides,
  };
}

/**
 * Create default cold call script segments
 */
export function createDefaultScriptSegments(): ScriptSegment[] {
  return [
    {
      label: 'Opening (Be Direct)',
      script: 'Hey [Name], this is [Your Name] calling locally from [City]. I\'m not selling leads or SEO.',
    },
    {
      label: 'The Hook (Problem → Curiosity)',
      script: 'I built a system that answers your phone when you can\'t—nights, weekends, holidays.',
    },
    {
      label: 'After They Try the Demo',
      script: 'What\'d you think? Usually setup is $3,500, but since we\'re local I can get you in for [adjusted setup fee].',
    },
  ];
}

/**
 * Create an objection handler
 */
export function createObjection(overrides: Partial<Objection> = {}): Objection {
  return {
    trigger: overrides.trigger || faker.lorem.sentence() + '?',
    response: overrides.response || faker.lorem.paragraph(),
    ...overrides,
  };
}

/**
 * Create default objections
 */
export function createDefaultObjections(): Objection[] {
  return [
    {
      trigger: 'My customers hate talking to robots.',
      response: 'Agreed—nobody likes phone trees. But here\'s the thing: 85% of people hang up on voicemail.',
    },
    {
      trigger: '$250/month is too expensive.',
      response: 'Let\'s do quick math. What\'s your average emergency job worth—$400, $500?',
    },
    {
      trigger: 'Is this even legal?',
      response: 'Good question. The FCC rules you\'re thinking of are about outbound robocalls—spam calls.',
    },
    {
      trigger: 'I already have a receptionist.',
      response: 'That\'s great—this isn\'t meant to replace her. It\'s backup for when she\'s off the clock.',
    },
  ];
}

/**
 * Create a compliance note
 */
export function createComplianceNote(overrides: Partial<ComplianceNote> = {}): ComplianceNote {
  return {
    title: overrides.title || faker.lorem.words(3).toUpperCase(),
    content: overrides.content || faker.lorem.paragraph(),
    style: overrides.style || 'healthy',
    ...overrides,
  };
}

/**
 * Create default compliance notes
 */
export function createDefaultComplianceNotes(): ComplianceNote[] {
  return [
    {
      title: 'INBOUND CALLS = LOWER RISK',
      content: 'TCPA/FCC rules target outbound spam. Inbound AI agents are permitted when properly disclosed.',
      citation: '[9]',
      style: 'healthy',
    },
    {
      title: 'REQUIRED DISCLOSURE',
      content: 'The system must open with: "Hi, I\'m an automated assistant..." This maintains trust and legal compliance.',
      citation: '[8]',
      style: 'warning',
    },
  ];
}

/**
 * Create a full sales strategy config
 */
export function createSalesStrategy(overrides: Partial<SalesStrategyData> = {}): SalesStrategyData {
  return {
    $schema: 'wranngle://config/sales-strategy/v1',
    version: '1.0.0',
    industry: overrides.industry || 'trades',
    industry_label: overrides.industry_label || 'Trades Industry Reference',
    last_updated: '2025-01',
    market_context: overrides.market_context || createMarketContext(),
    pricing_strategy: overrides.pricing_strategy || {
      approach: 'Start with the full bundle. If they push back, offer the core package.',
      packages: createDefaultPackages(),
    },
    compensation: overrides.compensation || {
      role_type: 'Founding Sales (No Base Salary)',
      components: [
        {
          name: 'Recurring Commission',
          structure: '20%–30% for life of account',
          rationale: 'Rewards retention, not just closes.',
        },
        {
          name: 'Equity',
          structure: '5%–10% (4-year vest, 1-year cliff)',
          rationale: 'Long-term ownership stake.',
        },
      ],
    },
    scripts: overrides.scripts || {
      cold_call: {
        goal: 'Get them to call the demo number.',
        segments: createDefaultScriptSegments(),
      },
    },
    objections: overrides.objections || createDefaultObjections(),
    compliance: overrides.compliance || createDefaultComplianceNotes(),
    sources: {
      label: 'Sources: 2024/25 Industry Reports',
      citations: '[1, 2]',
    },
    ...overrides,
  };
}

/**
 * Create sales strategy for a specific industry
 */
export function createIndustrySalesStrategy(industry: 'trades' | 'dental' | 'medical'): SalesStrategyData {
  const industryLabels: Record<string, string> = {
    trades: 'Trades Industry Reference',
    dental: 'Dental Practice Reference',
    medical: 'Medical Practice Reference',
  };

  const callValues: Record<string, { low: number; high: number }> = {
    trades: { low: 300, high: 1200 },
    dental: { low: 200, high: 500 },
    medical: { low: 150, high: 400 },
  };

  return createSalesStrategy({
    industry,
    industry_label: industryLabels[industry],
    market_context: createMarketContext({
      missed_call_value: {
        range_low: callValues[industry].low,
        range_high: callValues[industry].high,
        display: `$${callValues[industry].low} – $${callValues[industry].high}`,
        description: `Typical ${industry} service call value.`,
      },
    }),
  });
}
