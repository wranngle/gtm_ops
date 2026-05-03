/**
 * Case Study Factory
 * Generates case studies for pipeline evaluation testing
 *
 * Builds on existing factories to ensure consistency with pipeline data structures.
 */
import { faker } from '@faker-js/faker';
import {
  createIntake,
  createDentalIntake,
  type IntakeData
} from './intake.factory';
import {
  createPipelineSchema,
  createTierAssessment,
  createPricingStructure,
  type TierAssessment,
  type PricingStructure
} from './pipeline.factory';
import {
  createIntegration,
  createDentalIntegrations,
  type IntegrationData
} from './integration.factory';

/**
 * Case Study Solution - Ground truth data for comparison
 */
export type CaseStudySolution = {
  tier: string;
  price_min: number;
  price_max: number;
  timeline_weeks: number;
  integrations: string[];
  agent_type: 'inbound' | 'outbound' | 'hybrid';
  features: string[];
  roi_months?: number;
}

/**
 * Complete Case Study - Problem + Solution for blind evaluation
 */
export type CaseStudy = {
  id: string;
  vendor: string;
  source_url?: string;
  captured_at: string;
  quality_score?: number;
  is_holdout: boolean;
  problem: IntakeData;
  solution: CaseStudySolution;
  metadata?: Record<string, unknown>;
}

/**
 * Create a ground truth solution from pipeline data
 */
export function createSolution(overrides: Partial<CaseStudySolution> = {}): CaseStudySolution {
  const tier = overrides.tier || faker.helpers.arrayElement(['lite', 'standard', 'enterprise', 'flagship']);
  const basePrice = tier === 'lite' ? 5000 : tier === 'standard' ? 12_000 : tier === 'enterprise' ? 25_000 : 45_000;
  const variance = 0.2;

  return {
    tier,
    price_min: Math.round(basePrice * (1 - variance)),
    price_max: Math.round(basePrice * (1 + variance)),
    timeline_weeks: faker.number.int({ min: 3, max: 12 }),
    integrations: overrides.integrations || faker.helpers.arrayElements([
      'Dentrix G7',
      'Weave',
      'Google Calendar',
      'Salesforce',
      'Rectangle Health',
      'Twilio',
      'HubSpot'
    ], { min: 2, max: 5 }),
    agent_type: overrides.agent_type || faker.helpers.arrayElement(['inbound', 'outbound', 'hybrid']),
    features: overrides.features || faker.helpers.arrayElements([
      'appointment scheduling',
      'sms reminders',
      'crm sync',
      'lead qualification',
      'payment processing',
      'voicemail transcription',
      'after-hours handling'
    ], { min: 2, max: 5 }),
    roi_months: overrides.roi_months || faker.number.int({ min: 1, max: 6 }),
    ...overrides
  };
}

/**
 * Create a case study for evaluation testing
 */
export function createCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  const vendor = overrides.vendor || faker.helpers.arrayElement(['vapi', 'retell', 'bland', 'internal']);

  // Merge problem overrides with defaults
  const defaultIntake = createIntake();
  const problem = overrides.problem
    ? {
      ...defaultIntake,
      ...overrides.problem,
      section_a_workflow_definition: {
        ...defaultIntake.section_a_workflow_definition,
        ...overrides.problem.section_a_workflow_definition,
      },
      section_c_systems_handoffs: {
        ...defaultIntake.section_c_systems_handoffs,
        ...overrides.problem.section_c_systems_handoffs,
      },
    }
    : defaultIntake;

  // Derive solution from problem when possible
  const systemsInvolved = problem.section_c_systems_handoffs.q10_systems_involved;
  const integrations = systemsInvolved.map(sys => sys.split(' (')[0]);

  // Infer agent type from workflow name
  const workflowName = problem.section_a_workflow_definition.q01_workflow_name.toLowerCase();
  let agentType: 'inbound' | 'outbound' | 'hybrid' = 'hybrid';
  if (workflowName.includes('scheduling') || workflowName.includes('intake') || workflowName.includes('support')) {
    agentType = 'inbound';
  } else if (workflowName.includes('outreach') || workflowName.includes('reminder') || workflowName.includes('follow-up')) {
    agentType = 'outbound';
  }

  return {
    id: overrides.id || `${vendor}-${faker.string.alphanumeric(8).toLowerCase()}`,
    vendor,
    source_url: overrides.source_url || `https://${vendor}.ai/case-studies/${faker.string.alphanumeric(12)}`,
    captured_at: overrides.captured_at || new Date().toISOString(),
    quality_score: overrides.quality_score || faker.number.int({ min: 60, max: 100 }),
    is_holdout: overrides.is_holdout ?? false,
    problem,
    solution: overrides.solution || createSolution({
      integrations,
      agent_type: agentType
    }),
    metadata: overrides.metadata
  };
}

/**
 * Create a dental-specific case study with realistic ground truth
 */
export function createDentalCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  const problem = createDentalIntake();

  return createCaseStudy({
    id: 'vapi-dental-001',
    vendor: 'vapi',
    problem,
    solution: {
      tier: 'standard',
      price_min: 10_000,
      price_max: 15_000,
      timeline_weeks: 4,
      integrations: [
        'Dentrix G7',
        'Weave',
        'Google Calendar',
        'Rectangle Health',
        'DentalXchange'
      ],
      agent_type: 'inbound',
      features: [
        'appointment scheduling',
        'sms reminders',
        'insurance verification',
        'payment collection'
      ],
      roi_months: 2
    },
    ...overrides
  });
}

/**
 * Create a real estate case study (outbound focus)
 */
export function createRealEstateCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  const problem = createIntake({
    prepared_for: {
      account_id: 'CLIENT-REAL001',
      account_name: 'Precision Realty Group'
    },
    section_a_workflow_definition: {
      q01_workflow_name: 'Lead Follow-up Outreach',
      q02_trigger_event: 'New lead enters CRM from website or referral',
      q03_business_objective: 'Qualify leads faster and book property viewings',
      q04_end_condition: 'Lead qualified and viewing scheduled or disqualified',
      q05_outcome_owner: 'Sales Manager'
    },
    section_c_systems_handoffs: {
      q10_systems_involved: [
        'Salesforce CRM',
        'Google Calendar',
        'Twilio (Phone/SMS)',
        'DocuSign'
      ],
      q11_manual_data_transfers: 'Agents manually log call outcomes in CRM',
      q12_human_decision_gates: 'High-value leads require personal agent follow-up'
    },
    classification: {
      project_type: 'voice_agent',
      item_type: 'leads'
    }
  });

  return createCaseStudy({
    id: 'retell-realestate-001',
    vendor: 'retell',
    problem,
    solution: {
      tier: 'standard',
      price_min: 12_000,
      price_max: 18_000,
      timeline_weeks: 5,
      integrations: [
        'Salesforce',
        'Google Calendar',
        'Twilio',
        'DocuSign'
      ],
      agent_type: 'outbound',
      features: [
        'lead qualification',
        'appointment booking',
        'crm sync',
        'follow-up sequences'
      ],
      roi_months: 3
    },
    ...overrides
  });
}

/**
 * Create an HVAC case study (hybrid)
 */
export function createHVACCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  const problem = createIntake({
    prepared_for: {
      account_id: 'CLIENT-HVAC001',
      account_name: 'Comfort Climate Solutions'
    },
    section_a_workflow_definition: {
      q01_workflow_name: 'Service Call Scheduling',
      q02_trigger_event: 'Customer calls for service or submits emergency request',
      q03_business_objective: 'Faster dispatch and reduced missed appointments',
      q04_end_condition: 'Technician dispatched and customer confirmed',
      q05_outcome_owner: 'Dispatch Coordinator'
    },
    section_c_systems_handoffs: {
      q10_systems_involved: [
        'ServiceTitan',
        'Google Calendar',
        'Twilio (Phone/SMS)',
        'QuickBooks'
      ],
      q11_manual_data_transfers: 'Dispatchers coordinate via phone and whiteboard',
      q12_human_decision_gates: 'Emergency calls require immediate tech assignment'
    },
    classification: {
      project_type: 'voice_agent',
      item_type: 'service_calls'
    }
  });

  return createCaseStudy({
    id: 'bland-hvac-001',
    vendor: 'bland',
    is_holdout: true,
    problem,
    solution: {
      tier: 'enterprise',
      price_min: 22_000,
      price_max: 30_000,
      timeline_weeks: 6,
      integrations: [
        'ServiceTitan',
        'Google Calendar',
        'Twilio',
        'QuickBooks'
      ],
      agent_type: 'hybrid',
      features: [
        'emergency triage',
        'technician dispatch',
        'appointment scheduling',
        'payment collection',
        'sms updates'
      ],
      roi_months: 2
    },
    ...overrides
  });
}

/**
 * Create a batch of case studies for evaluation
 */
export function createCaseStudyBatch(count: number, options?: {
  holdoutRatio?: number;
  vendors?: string[];
}): CaseStudy[] {
  const holdoutRatio = options?.holdoutRatio || 0.2;
  const vendors = options?.vendors || ['vapi', 'retell', 'bland', 'internal'];
  const holdoutCount = Math.floor(count * holdoutRatio);

  return Array.from({ length: count }, (_, i) => {
    const vendor = vendors[i % vendors.length];
    return createCaseStudy({
      id: `${vendor}-batch-${String(i + 1).padStart(3, '0')}`,
      vendor,
      is_holdout: i >= count - holdoutCount
    });
  });
}

/**
 * Create evaluation test suite with known expected outcomes
 */
export function createEvaluationTestSuite(): Array<{
  name: string;
  caseStudy: CaseStudy;
  expectedScores: {
    tier_match: number;
    integration_coverage: number;
    agent_type_alignment: number;
  };
}> {
  return [
    {
      name: 'Exact tier match with full integration coverage',
      caseStudy: createDentalCaseStudy(),
      expectedScores: {
        tier_match: 1,
        integration_coverage: 1,
        agent_type_alignment: 1
      }
    },
    {
      name: 'Adjacent tier (standard vs enterprise)',
      caseStudy: createCaseStudy({
        solution: createSolution({ tier: 'enterprise' })
      }),
      expectedScores: {
        tier_match: 0.5,
        integration_coverage: 0.5,
        agent_type_alignment: 0.5
      }
    },
    {
      name: 'Mismatched agent type',
      caseStudy: createCaseStudy({
        problem: createIntake({
          section_a_workflow_definition: {
            q01_workflow_name: 'Outbound Sales Calls',
            q02_trigger_event: 'Lead added to campaign',
            q03_business_objective: 'Convert leads to appointments',
            q04_end_condition: 'Appointment booked or lead disqualified',
            q05_outcome_owner: 'Sales Manager'
          }
        }),
        solution: createSolution({ agent_type: 'outbound' })
      }),
      expectedScores: {
        tier_match: 0.5,
        integration_coverage: 0.5,
        agent_type_alignment: 1
      }
    }
  ];
}

/**
 * Create masked intake from case study problem section
 * Uses the masker module to transform PROBLEM → pipeline intake format
 */
export async function createMaskedIntake(
  caseStudy?: Partial<CaseStudy>,
  options: { validateNoLeakage?: boolean } = {}
): Promise<IntakeData> {
  // Dynamic import to avoid circular dependencies
  const { toIntake, validateNoSolutionLeakage } = await import('../../../lib/evaluation/masker.js');

  const cs = caseStudy ? createCaseStudy(caseStudy) : createCaseStudy();

  // Transform problem to intake format
  const maskedIntake = toIntake(cs, {
    generateWorkflowName: true,
    inferClassification: true,
  });

  // Validate no solution leakage if requested
  if (options.validateNoLeakage !== false) {
    const validation = validateNoSolutionLeakage(maskedIntake, cs.solution);
    if (!validation.clean) {
      console.warn('[Factory] Potential solution leakage detected:', validation.leaks);
    }
  }

  return maskedIntake as IntakeData;
}

/**
 * Synchronous version for test setup (uses pre-defined mapping)
 */
export function createMaskedIntakeSync(
  caseStudy?: Partial<CaseStudy>
): IntakeData {
  const cs = caseStudy ? createCaseStudy(caseStudy) : createCaseStudy();
  const {problem} = cs;

  // Manual masking without async dependency
  return {
    prepared_for: {
      account_id: `eval-${cs.id}`,
      account_name: `[Evaluation] ${problem.prepared_for?.account_name || 'Test Company'}`,
    },
    section_a_workflow_definition: problem.section_a_workflow_definition,
    section_b_volume_timing: problem.section_b_volume_timing,
    section_c_systems_handoffs: problem.section_c_systems_handoffs,
    section_d_failure_cost: problem.section_d_failure_cost,
    section_e_priority: problem.section_e_priority,
    classification: problem.classification || {
      project_type: 'voice_agent',
      item_type: 'calls',
    },
  } as IntakeData;
}

/**
 * Create mock pipeline output for comparison testing
 */
export function createMockPipelineOutput(overrides: Partial<{
  tier: string;
  price: number;
  timelineWeeks: number;
  integrations: string[];
  agentType: string;
  features: string[];
}> = {}): Record<string, unknown> {
  const tier = createTierAssessment({ key: overrides.tier || 'standard' });
  const pricing = createPricingStructure(tier.base_hours);

  const integrationsList = overrides.integrations || ['Dentrix G7', 'Weave'];

  return {
    success: true,
    intake: createIntake({
      section_c_systems_handoffs: {
        q10_systems_involved: integrationsList,
        q11_manual_data_transfers: 'Manual data entry',
        q12_human_decision_gates: 'Manager approval required',
      },
    }),
    research: {
      tier_assessment: tier,
      // Integrations in research output (where compare() looks first)
      integrations: integrationsList.map(name => ({
        name,
        system_name: name,
        has_native_node: false,
      })),
    },
    pricing: {
      ...pricing,
      final_price: overrides.price ?? pricing.final_price,
    },
    estimate: {
      hours: { total: tier.base_hours },
      timeline_weeks: overrides.timelineWeeks || Math.ceil(tier.base_hours / 40)
    },
    technical_approach: {
      integrations: integrationsList.map(name => ({
        system_name: name,
        integration_type: 'api'
      }))
    },
    classification: {
      agent_type: overrides.agentType || 'inbound'
    },
    features: overrides.features || ['appointment scheduling', 'sms reminders']
  };
}
