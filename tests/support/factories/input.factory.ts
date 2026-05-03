/**
 * Input Data Factory
 *
 * Generates synthetic pipeline input data for testing.
 * Uses @faker-js/faker for realistic random data generation.
 */
import { faker } from '@faker-js/faker';

// ============================================================================
// Types
// ============================================================================

export type GeneratedInput = {
  companyName: string;
  projectName: string;
  industry: string;
  systems: string[];
  volumePerDay: number;
  timePerItem: number;
  timeUnit: 'minutes' | 'hours';
  annualLaborCost: number;
  errorRate: number;
  budget: { min: number; max: number };
  timeline: { weeks: number };
  rawText: string;
}

export type InputOverrides = {
  companyName?: string;
  projectName?: string;
  industry?: string;
  systems?: string[];
  volumePerDay?: number;
  timePerItem?: number;
  timeUnit?: 'minutes' | 'hours';
  annualLaborCost?: number;
  errorRate?: number;
  budget?: { min: number; max: number };
  timeline?: { weeks: number };
}

// ============================================================================
// Industry Templates
// ============================================================================

const INDUSTRY_TEMPLATES = {
  healthcare: {
    companies: ['Medical Group', 'Health Center', 'Clinic', 'Hospital', 'Care Network'],
    projects: ['Patient Intake', 'Insurance Verification', 'Appointment Scheduling', 'Prescription Refill', 'Lab Results Distribution'],
    systems: ['Epic EHR', 'Cerner', 'Availity', 'Twilio', 'Microsoft 365', 'DocuSign'],
    volumeRange: [20, 100],
    timeRange: [10, 45],
    laborRange: [80_000, 200_000],
  },
  legal: {
    companies: ['Law Firm', 'Legal Associates', 'Attorneys at Law', 'Legal Group', 'Law Office'],
    projects: ['Client Intake', 'Document Review', 'Quote Generation', 'Case Management', 'Billing Automation'],
    systems: ['Clio', 'LawPay', 'DocuSign', 'Microsoft 365', 'Google Workspace', 'Dropbox'],
    volumeRange: [5, 30],
    timeRange: [30, 120],
    laborRange: [100_000, 300_000],
  },
  realestate: {
    companies: ['Realty', 'Properties', 'Real Estate Group', 'Property Management', 'Homes'],
    projects: ['Lead Qualification', 'Property Matching', 'Showing Scheduling', 'Offer Processing', 'Commission Tracking'],
    systems: ['Zillow API', 'Salesforce', 'DocuSign', 'Calendly', 'Twilio', 'Gmail'],
    volumeRange: [10, 50],
    timeRange: [15, 60],
    laborRange: [60_000, 150_000],
  },
  logistics: {
    companies: ['Freight', 'Logistics', 'Transport', 'Shipping', 'Delivery Services'],
    projects: ['Dispatch Automation', 'Route Optimization', 'Load Matching', 'Driver Assignment', 'Shipment Tracking'],
    systems: ['Samsara', 'DAT', 'Trucker Path', 'QuickBooks', 'Slack', 'Google Maps API'],
    volumeRange: [50, 500],
    timeRange: [5, 30],
    laborRange: [120_000, 400_000],
  },
  recruitment: {
    companies: ['Staffing', 'Talent Solutions', 'Recruiting', 'HR Partners', 'Workforce'],
    projects: ['Candidate Sourcing', 'Resume Screening', 'Interview Scheduling', 'Offer Management', 'Onboarding'],
    systems: ['LinkedIn Recruiter', 'Greenhouse', 'Lever', 'Calendly', 'DocuSign', 'Slack'],
    volumeRange: [20, 100],
    timeRange: [20, 60],
    laborRange: [90_000, 250_000],
  },
  finance: {
    companies: ['Financial Services', 'Capital', 'Investments', 'Advisory', 'Wealth Management'],
    projects: ['Account Opening', 'KYC Verification', 'Transaction Monitoring', 'Report Generation', 'Compliance Check'],
    systems: ['Plaid', 'Stripe', 'Salesforce', 'DocuSign', 'AWS S3', 'Slack'],
    volumeRange: [30, 200],
    timeRange: [15, 45],
    laborRange: [150_000, 500_000],
  },
};

type IndustryKey = keyof typeof INDUSTRY_TEMPLATES;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a single generated input with optional overrides
 */
export function createInput(overrides: InputOverrides = {}): GeneratedInput {
  const industry = overrides.industry || faker.helpers.arrayElement(Object.keys(INDUSTRY_TEMPLATES));
  const template = INDUSTRY_TEMPLATES[industry as IndustryKey] || INDUSTRY_TEMPLATES.healthcare;

  const companyPrefix = faker.helpers.arrayElement(['Apex', 'Premier', 'Coastal', 'Metro', 'Summit', 'Valley', 'Elite', 'National']);
  const companySuffix = faker.helpers.arrayElement(template.companies);

  const companyName = overrides.companyName || `${companyPrefix} ${companySuffix}`;
  const projectName = overrides.projectName || faker.helpers.arrayElement(template.projects);

  const systems = overrides.systems || faker.helpers.arrayElements(template.systems, { min: 3, max: 6 });

  const volumePerDay = overrides.volumePerDay || faker.number.int({ min: template.volumeRange[0], max: template.volumeRange[1] });
  const timePerItem = overrides.timePerItem || faker.number.int({ min: template.timeRange[0], max: template.timeRange[1] });
  const timeUnit = overrides.timeUnit || 'minutes';

  const annualLaborCost = overrides.annualLaborCost || faker.number.int({ min: template.laborRange[0], max: template.laborRange[1] });
  const errorRate = overrides.errorRate ?? faker.number.int({ min: 3, max: 15 });

  const budgetMin = overrides.budget?.min || Math.round(annualLaborCost * 0.3);
  const budgetMax = overrides.budget?.max || Math.round(annualLaborCost * 0.6);
  const budget = { min: budgetMin, max: budgetMax };

  const timeline = overrides.timeline || { weeks: faker.number.int({ min: 6, max: 16 }) };

  // Generate raw text
  const rawText = generateRawText({
    companyName,
    projectName,
    systems,
    volumePerDay,
    timePerItem,
    timeUnit,
    annualLaborCost,
    errorRate,
    budget,
    timeline,
    industry,
  });

  return {
    companyName,
    projectName,
    industry,
    systems,
    volumePerDay,
    timePerItem,
    timeUnit,
    annualLaborCost,
    errorRate,
    budget,
    timeline,
    rawText,
  };
}

/**
 * Create multiple generated inputs
 */
export function createInputs(count: number, overrides: InputOverrides = {}): GeneratedInput[] {
  return Array.from({ length: count }, () => createInput(overrides));
}

/**
 * Create input for specific industry
 */
export function createIndustryInput(industry: IndustryKey, overrides: InputOverrides = {}): GeneratedInput {
  return createInput({ ...overrides, industry });
}

/**
 * Create stress test input with edge case values
 */
export function createStressInput(type: 'extreme_scale' | 'tiny_scale' | 'zero_values' | 'missing_data'): GeneratedInput {
  switch (type) {
    case 'extreme_scale': {
      return createInput({
        volumePerDay: 50_000,
        annualLaborCost: 10_000_000,
        budget: { min: 500_000, max: 1_000_000 },
      });
    }

    case 'tiny_scale': {
      return createInput({
        volumePerDay: 2,
        annualLaborCost: 30_000,
        budget: { min: 5000, max: 10_000 },
      });
    }

    case 'zero_values': {
      return createInput({
        volumePerDay: 0,
        errorRate: 0,
      });
    }

    case 'missing_data': {
      // Create minimal input
      return {
        companyName: faker.company.name(),
        projectName: 'General Operations',
        industry: 'unknown',
        systems: [],
        volumePerDay: 0,
        timePerItem: 0,
        timeUnit: 'minutes',
        annualLaborCost: 0,
        errorRate: 0,
        budget: { min: 0, max: 0 },
        timeline: { weeks: 0 },
        rawText: `Company: ${faker.company.name()}\nWe need automation help.`,
      };
    }
  }
}

// ============================================================================
// Raw Text Generation
// ============================================================================

function generateRawText(input: Omit<GeneratedInput, 'rawText'>): string {
  const systemsList = input.systems.map(s => `- ${s}`).join('\n');

  return `Company: ${input.companyName}
Project: ${input.projectName}

We're looking to automate our ${input.projectName.toLowerCase()} process.

Current situation:
- We process ${input.volumePerDay}+ items per day
- Each item takes ${input.timePerItem} ${input.timeUnit} to process manually
- We have staff dedicated to this at $${input.annualLaborCost.toLocaleString()}/year total
- Error rate is around ${input.errorRate}% requiring rework
- Customers complain about slow turnaround

Systems involved:
${systemsList}

Goals:
- Reduce manual processing time by 80%
- Automate data entry and validation
- Reduce errors to under 1%
- Free up staff for higher-value work

Pain points:
- Staff turnover is high due to repetitive work
- Peak times create backlogs
- Missing information causes delays
- Compliance concerns with manual handling

Budget: $${input.budget.min.toLocaleString()}-$${input.budget.max.toLocaleString()} for implementation
Timeline: Need this operational within ${input.timeline.weeks} weeks
`;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that extracted schema matches factory input
 */
export function validateExtraction(
  factoryInput: GeneratedInput,
  schema: any
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  // Client name
  if (schema.identity?.client_name?.toLowerCase() !== factoryInput.companyName.toLowerCase()) {
    failures.push(`client_name: expected "${factoryInput.companyName}", got "${schema.identity?.client_name}"`);
  }

  // Volume (approximate match)
  const extractedVolume = Number.parseInt(schema.intake?.section_b_volume_timing?.q06_runs_per_period || '0', 10);
  if (Math.abs(extractedVolume - factoryInput.volumePerDay) > factoryInput.volumePerDay * 0.2) {
    failures.push(`volume: expected ~${factoryInput.volumePerDay}, got ${extractedVolume}`);
  }

  // Systems count
  const extractedSystems = schema.intake?.section_c_systems_handoffs?.q10_systems_involved || [];
  if (extractedSystems.length < factoryInput.systems.length * 0.5) {
    failures.push(`systems: expected ~${factoryInput.systems.length}, got ${extractedSystems.length}`);
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
