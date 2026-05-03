/**
 * Product Test Factory
 * Generates test data for AI Voice Agent product detection and pricing
 *
 * Factory Pattern:
 * - createVoiceAgentIntake() - High-confidence voice agent intakes
 * - createProjectIntake() - Standard project intakes (non-product)
 * - createEdgeCaseIntake() - Boundary/edge case intakes
 * - createProductPricingScenario() - Complete pricing test scenarios
 */
import { faker } from '@faker-js/faker';

// =============================================================================
// TYPES
// =============================================================================

export type ProductTestIntake = {
  intake_version: string;
  captured_at: string;
  captured_by: string;
  prepared_for: {
    account_id: string;
    account_name: string;
  };
  section_a_workflow_definition: {
    q01_workflow_name: string;
    q02_trigger_event: string;
    q03_business_objective: string;
    q04_end_condition: string;
    q05_outcome_owner: string;
  };
  section_b_volume_timing: {
    q06_runs_per_period: string;
    q06_period_unit: string;
    q07_avg_trigger_to_end: string;
    q07_time_unit: string;
    q08_worst_case_delay: string | undefined;
    q08_delay_unit: string | undefined;
    q09_business_hours_expected: string | undefined;
  };
  section_c_systems_handoffs: {
    q10_systems_involved: string[];
    q11_manual_data_transfers: string;
    q12_human_decision_gates: string;
  };
  section_d_failure_cost: {
    q13_common_failures: string;
    q14_cost_if_slow_or_failed: string;
  };
  section_e_priority: {
    q15_strategic_priority: string;
    q16_automation_readiness: string;
  };
  classification?: {
    project_type: string;
    is_product: boolean;
    product_key: string | undefined;
    confidence: number;
    pricing_model: string;
  };
}

export type ProductPricingScenario = {
  name: string;
  description: string;
  intake: ProductTestIntake;
  monthlyBleed: number;
  expectedSetupHours: number;
  expectedSetupFee: number;
  expectedMonthly: number;
  expectedFirstYear: number;
  expectedNetMonthlySavings: number;
  expectedPaybackMonths: number;
  tier: 'core_protection' | 'growth_bundle';
}

export type DetectionTestCase = {
  name: string;
  description: string;
  intake: ProductTestIntake;
  expectedIsProduct: boolean;
  expectedProjectType: 'voice_agent' | 'workflow_automation';
  expectedMinConfidence: number;
  expectedMaxConfidence: number;
}

// =============================================================================
// VOICE AGENT INTAKE FACTORY
// =============================================================================

/**
 * Create a high-confidence AI Voice Agent intake
 * Contains multiple primary and secondary keywords
 */
export function createVoiceAgentIntake(overrides: Partial<ProductTestIntake> = {}): ProductTestIntake {
  const clientName = faker.helpers.arrayElement([
    'ABC Plumbing Services',
    'Elite HVAC Solutions',
    'Premier Dental Care',
    'Metro Property Management',
    'All-Star Electrical'
  ]);

  return {
    intake_version: '1.0.0',
    captured_at: faker.date.recent().toISOString(),
    captured_by: faker.person.fullName(),
    prepared_for: {
      account_id: `CLIENT-${faker.string.alphanumeric(6).toUpperCase()}`,
      account_name: clientName
    },
    section_a_workflow_definition: {
      q01_workflow_name: faker.helpers.arrayElement([
        'Inbound Receptionist Automation',
        '24/7 AI Voice Agent for Missed Calls',
        'After-Hours Call Handling',
        'Phone Call Answering Automation'
      ]),
      q02_trigger_event: faker.helpers.arrayElement([
        'Inbound phone call received',
        'Missed call detected after hours',
        'Customer calls during peak hours',
        'Emergency call received'
      ]),
      q03_business_objective: faker.helpers.arrayElement([
        'Never miss a call with AI voice agent handling',
        'Replace part-time receptionist with 24/7 AI coverage',
        'Capture leads from missed calls automatically',
        'Provide after-hours emergency dispatch'
      ]),
      q04_end_condition: faker.helpers.arrayElement([
        'Call answered, message taken, or appointment booked',
        'Lead captured and dispatched to on-call technician',
        'Caller inquiry resolved or escalated',
        'Emergency job scheduled and technician notified'
      ]),
      q05_outcome_owner: faker.helpers.arrayElement([
        'Operations Manager',
        'Office Manager',
        'Dispatch Coordinator'
      ])
    },
    section_b_volume_timing: {
      q06_runs_per_period: faker.helpers.arrayElement(['50', '100', '150']),
      q06_period_unit: 'day',
      q07_avg_trigger_to_end: faker.helpers.arrayElement(['2', '3', '5']),
      q07_time_unit: 'minutes',
      q08_worst_case_delay: faker.helpers.arrayElement(['30', '60']),
      q08_delay_unit: 'minutes',
      q09_business_hours_expected: faker.helpers.arrayElement([
        'No - 24/7 coverage needed',
        'After hours only (6pm-7am)',
        'Weekends and holidays'
      ])
    },
    section_c_systems_handoffs: {
      q10_systems_involved: faker.helpers.arrayElements([
        'VoIP/PBX (Phone System)',
        'CRM (Customer Lookup)',
        'Scheduling (Appointment Booking)',
        'ServiceTitan',
        'Twilio',
        'RingCentral',
        'Google Calendar'
      ], { min: 2, max: 4 }),
      q11_manual_data_transfers: faker.helpers.arrayElement([
        'Receptionist manually logs calls in CRM',
        'Messages written on paper then entered later',
        'Staff checks voicemail and calls back manually'
      ]),
      q12_human_decision_gates: faker.helpers.arrayElement([
        'Urgent calls escalated to on-call technician',
        'Emergency dispatch requires manager approval',
        'Large jobs need estimate before booking'
      ])
    },
    section_d_failure_cost: {
      q13_common_failures: faker.helpers.arrayElement([
        'Missed calls during busy periods or after hours',
        'Lost leads when calls go to voicemail',
        'Delayed emergency response from missed dispatch'
      ]),
      q14_cost_if_slow_or_failed: faker.helpers.arrayElement([
        'Lost emergency job revenue of $500-2000 per missed call',
        'Part-time receptionist costs $2000-3000/month',
        'Lost leads worth $300-500 average ticket'
      ])
    },
    section_e_priority: {
      q15_strategic_priority: 'High - Core revenue driver',
      q16_automation_readiness: 'Ready - Phone system has API access'
    },
    ...overrides
  };
}

/**
 * Create a standard project intake (non-voice, non-product)
 * Contains no voice agent keywords
 */
export function createProjectIntake(overrides: Partial<ProductTestIntake> = {}): ProductTestIntake {
  return {
    intake_version: '1.0.0',
    captured_at: faker.date.recent().toISOString(),
    captured_by: faker.person.fullName(),
    prepared_for: {
      account_id: `CLIENT-${faker.string.alphanumeric(6).toUpperCase()}`,
      account_name: faker.helpers.arrayElement([
        'Global Manufacturing Inc',
        'Acme Logistics Corp',
        'City Healthcare Network'
      ])
    },
    section_a_workflow_definition: {
      q01_workflow_name: faker.helpers.arrayElement([
        'Order Fulfillment Pipeline',
        'Invoice Processing Automation',
        'Employee Onboarding Workflow',
        'Document Approval System'
      ]),
      q02_trigger_event: faker.helpers.arrayElement([
        'New order submitted via website',
        'Invoice received via email',
        'New hire paperwork initiated',
        'Document uploaded for review'
      ]),
      q03_business_objective: faker.helpers.arrayElement([
        'Reduce manual data entry and processing time',
        'Automate approval workflows and notifications',
        'Streamline document routing and archival'
      ]),
      q04_end_condition: faker.helpers.arrayElement([
        'Order shipped and tracking sent',
        'Invoice paid and recorded',
        'Employee active in all systems',
        'Document approved and filed'
      ]),
      q05_outcome_owner: 'Operations Manager'
    },
    section_b_volume_timing: {
      q06_runs_per_period: faker.helpers.arrayElement(['200', '500', '1000']),
      q06_period_unit: 'day',
      q07_avg_trigger_to_end: faker.helpers.arrayElement(['30', '60', '120']),
      q07_time_unit: 'minutes',
      q08_worst_case_delay: '24',
      q08_delay_unit: 'hours',
      q09_business_hours_expected: 'Yes - 9am to 5pm'
    },
    section_c_systems_handoffs: {
      q10_systems_involved: faker.helpers.arrayElements([
        'Salesforce CRM',
        'QuickBooks',
        'Slack',
        'Google Workspace',
        'Airtable',
        'Notion'
      ], { min: 2, max: 4 }),
      q11_manual_data_transfers: 'Staff copies data between systems via export/import',
      q12_human_decision_gates: 'Manager approval required for high-value items'
    },
    section_d_failure_cost: {
      q13_common_failures: 'Data entry errors and delayed processing',
      q14_cost_if_slow_or_failed: 'Customer complaints and operational delays'
    },
    section_e_priority: {
      q15_strategic_priority: 'Medium - Operational efficiency',
      q16_automation_readiness: 'Ready - APIs available'
    },
    ...overrides
  };
}

// =============================================================================
// EDGE CASE FACTORY
// =============================================================================

/**
 * Create edge case intakes for boundary testing
 */
export const EdgeCases = {
  /**
   * Borderline case - just above threshold
   * Score: ~15-18 (threshold is 15)
   */
  borderlineVoiceAgent(): ProductTestIntake {
    return createProjectIntake({
      section_a_workflow_definition: {
        q01_workflow_name: 'Lead Intake Process', // No voice keywords
        q02_trigger_event: 'Phone call received', // +3 secondary (phone, call)
        q03_business_objective: 'Handle inbound inquiries', // +3 secondary (inbound)
        q04_end_condition: 'Lead captured',
        q05_outcome_owner: 'Sales Team'
      },
      section_c_systems_handoffs: {
        q10_systems_involved: ['CRM', 'Twilio'], // +3 secondary (twilio)
        q11_manual_data_transfers: 'Manual logging',
        q12_human_decision_gates: 'Caller qualification' // +3 secondary (caller)
      }
    });
  },

  /**
   * Borderline case - just below threshold
   * Score: ~12-14 (threshold is 15)
   */
  borderlineProject(): ProductTestIntake {
    return createProjectIntake({
      section_a_workflow_definition: {
        q01_workflow_name: 'Customer Support Workflow',
        q02_trigger_event: 'Email received',
        q03_business_objective: 'Handle support requests',
        q04_end_condition: 'Ticket resolved',
        q05_outcome_owner: 'Support Lead'
      },
      section_c_systems_handoffs: {
        q10_systems_involved: ['Zendesk', 'Slack', 'Phone System'], // +3 secondary (phone)
        q11_manual_data_transfers: 'Call notes entered manually', // +3 secondary (call)
        q12_human_decision_gates: 'Escalation to manager'
      }
    });
  },

  /**
   * Zero score - no voice keywords at all
   */
  zeroScore(): ProductTestIntake {
    return createProjectIntake({
      section_a_workflow_definition: {
        q01_workflow_name: 'Data Migration Pipeline',
        q02_trigger_event: 'Batch file uploaded',
        q03_business_objective: 'Transfer records between systems',
        q04_end_condition: 'Records imported successfully',
        q05_outcome_owner: 'IT Admin'
      },
      section_c_systems_handoffs: {
        q10_systems_involved: ['PostgreSQL', 'MongoDB', 'S3'],
        q11_manual_data_transfers: 'CSV export/import',
        q12_human_decision_gates: 'DBA approval for large batches'
      }
    });
  },

  /**
   * Maximum score - all keyword categories present
   */
  maxScore(): ProductTestIntake {
    return createVoiceAgentIntake({
      section_a_workflow_definition: {
        q01_workflow_name: '24/7 AI Voice Agent Receptionist',
        q02_trigger_event: 'Inbound phone call or missed call detected',
        q03_business_objective: 'Never miss a call - AI receptionist handles after-hours call answering',
        q04_end_condition: 'Caller inquiry resolved, appointment booked, or dispatch triggered',
        q05_outcome_owner: 'Operations Manager'
      },
      section_c_systems_handoffs: {
        q10_systems_involved: [
          'VoIP/PBX Phone System',
          'Twilio Voice',
          'RingCentral',
          'ServiceTitan',
          'Google Calendar'
        ],
        q11_manual_data_transfers: 'Receptionist manually logs calls and voicemail',
        q12_human_decision_gates: 'Emergency calls dispatched to on-call technician'
      },
      section_d_failure_cost: {
        q13_common_failures: 'Missed calls during busy periods, lost leads from unanswered phones',
        q14_cost_if_slow_or_failed: 'Emergency plumbing calls missed, HVAC jobs lost'
      }
    });
  },

  /**
   * Industry-only score - has industry keywords but no voice keywords
   */
  industryOnly(): ProductTestIntake {
    return createProjectIntake({
      prepared_for: {
        account_id: 'CLIENT-HVAC001',
        account_name: 'Premier HVAC Contractors'
      },
      section_a_workflow_definition: {
        q01_workflow_name: 'Job Scheduling Workflow',
        q02_trigger_event: 'Work order created in ServiceTitan',
        q03_business_objective: 'Automate plumber and electrician dispatch',
        q04_end_condition: 'Technician assigned and notified',
        q05_outcome_owner: 'Dispatch Manager'
      },
      section_d_failure_cost: {
        q13_common_failures: 'HVAC emergency jobs delayed due to manual scheduling',
        q14_cost_if_slow_or_failed: 'Contractor overtime from scheduling conflicts'
      }
    });
  }
};

// =============================================================================
// PRODUCT PRICING SCENARIO FACTORY
// =============================================================================

/**
 * Create complete pricing test scenarios
 */
export function createProductPricingScenario(
  name: string,
  overrides: Partial<ProductPricingScenario> = {}
): ProductPricingScenario {
  const defaults: ProductPricingScenario = {
    name,
    description: 'Default pricing scenario',
    intake: createVoiceAgentIntake(),
    monthlyBleed: 2500,
    expectedSetupHours: 8,
    expectedSetupFee: 1000,
    expectedMonthly: 250,
    expectedFirstYear: 4000,
    expectedNetMonthlySavings: 2250,
    expectedPaybackMonths: 0.4,
    tier: 'core_protection'
  };

  return { ...defaults, ...overrides };
}

/**
 * Pre-built pricing scenarios for comprehensive testing
 */
export const PricingScenarios = {
  /**
   * Simple voice agent - minimal integrations
   * Setup: 8 base hours = $1,000
   */
  simple(): ProductPricingScenario {
    return createProductPricingScenario('Simple Voice Agent', {
      description: 'Single integration, basic configuration',
      intake: createVoiceAgentIntake({
        section_c_systems_handoffs: {
          q10_systems_involved: ['Phone System'],
          q11_manual_data_transfers: 'Manual call logging',
          q12_human_decision_gates: 'None'
        }
      }),
      monthlyBleed: 2000,
      expectedSetupHours: 8,
      expectedSetupFee: 1000,
      expectedMonthly: 250,
      expectedFirstYear: 4000, // 1000 + (250 * 12)
      expectedNetMonthlySavings: 1750, // 2000 - 250
      expectedPaybackMonths: 0.6 // 1000 / 1750
    });
  },

  /**
   * Standard voice agent - 3 integrations
   * Setup: 8 base + (2 * 4) = 16 hours = $2,000
   */
  standard(): ProductPricingScenario {
    return createProductPricingScenario('Standard Voice Agent', {
      description: 'Three integrations (phone, CRM, calendar)',
      intake: createVoiceAgentIntake({
        section_c_systems_handoffs: {
          q10_systems_involved: ['VoIP/PBX', 'CRM', 'Google Calendar'],
          q11_manual_data_transfers: 'Manual data entry',
          q12_human_decision_gates: 'Manager approval'
        }
      }),
      monthlyBleed: 2750,
      expectedSetupHours: 16,
      expectedSetupFee: 2000,
      expectedMonthly: 250,
      expectedFirstYear: 5000, // 2000 + (250 * 12)
      expectedNetMonthlySavings: 2500, // 2750 - 250
      expectedPaybackMonths: 0.8 // 2000 / 2500
    });
  },

  /**
   * Complex voice agent - 5 integrations with custom workflows
   * Setup: 8 base + (4 * 4) + 8 custom = 32 hours = $4,000
   */
  complex(): ProductPricingScenario {
    return createProductPricingScenario('Complex Voice Agent', {
      description: 'Five integrations plus custom workflows',
      intake: createVoiceAgentIntake({
        section_a_workflow_definition: {
          q01_workflow_name: 'AI Voice Agent with Custom Dispatch Logic',
          q02_trigger_event: 'Emergency call received',
          q03_business_objective: 'Custom routing based on caller history and urgency',
          q04_end_condition: 'Emergency dispatched or escalated',
          q05_outcome_owner: 'Operations'
        },
        section_c_systems_handoffs: {
          q10_systems_involved: [
            'VoIP/PBX',
            'ServiceTitan',
            'Google Calendar',
            'Twilio',
            'Custom CRM'
          ],
          q11_manual_data_transfers: 'Complex multi-system data sync',
          q12_human_decision_gates: 'Custom emergency escalation logic'
        }
      }),
      monthlyBleed: 5000,
      expectedSetupHours: 32,
      expectedSetupFee: 4000,
      expectedMonthly: 250,
      expectedFirstYear: 7000, // 4000 + (250 * 12)
      expectedNetMonthlySavings: 4750, // 5000 - 250
      expectedPaybackMonths: 0.8 // 4000 / 4750
    });
  },

  /**
   * Maximum complexity - hits hour cap
   * Setup: Capped at 40 hours = $5,000
   */
  maxComplexity(): ProductPricingScenario {
    return createProductPricingScenario('Maximum Complexity Voice Agent', {
      description: 'Many integrations, hits 40-hour cap',
      intake: createVoiceAgentIntake({
        section_a_workflow_definition: {
          q01_workflow_name: 'Enterprise AI Voice Agent with Custom Logic',
          q02_trigger_event: 'Inbound call with custom IVR',
          q03_business_objective: 'Full custom implementation with complex routing',
          q04_end_condition: 'Multi-path resolution',
          q05_outcome_owner: 'CTO'
        },
        section_c_systems_handoffs: {
          q10_systems_involved: [
            'VoIP/PBX', 'Twilio', 'ServiceTitan', 'Salesforce',
            'Google Calendar', 'Slack', 'Custom Database', 'ERP System'
          ],
          q11_manual_data_transfers: 'Enterprise multi-system integration',
          q12_human_decision_gates: 'Complex custom business rules'
        }
      }),
      monthlyBleed: 10_000,
      expectedSetupHours: 40, // Capped
      expectedSetupFee: 5000,
      expectedMonthly: 250,
      expectedFirstYear: 8000, // 5000 + (250 * 12)
      expectedNetMonthlySavings: 9750, // 10000 - 250
      expectedPaybackMonths: 0.5 // 5000 / 9750
    });
  },

  /**
   * Growth bundle tier
   * Monthly: $500 instead of $250
   */
  growthBundle(): ProductPricingScenario {
    return createProductPricingScenario('Growth Bundle Voice Agent', {
      description: 'Upgraded tier with web chat widget',
      intake: createVoiceAgentIntake(),
      monthlyBleed: 3000,
      expectedSetupHours: 16,
      expectedSetupFee: 2000,
      expectedMonthly: 500, // Growth bundle
      expectedFirstYear: 8000, // 2000 + (500 * 12)
      expectedNetMonthlySavings: 2500, // 3000 - 500
      expectedPaybackMonths: 0.8, // 2000 / 2500
      tier: 'growth_bundle'
    });
  },

  /**
   * Zero bleed scenario (for edge case testing)
   * ROI should show 0 savings
   */
  zeroBleed(): ProductPricingScenario {
    return createProductPricingScenario('Zero Bleed Voice Agent', {
      description: 'No measurable bleed - ROI shows 0',
      intake: createVoiceAgentIntake(),
      monthlyBleed: 0,
      expectedSetupHours: 8,
      expectedSetupFee: 1000,
      expectedMonthly: 250,
      expectedFirstYear: 4000,
      expectedNetMonthlySavings: 0, // 0 - 250 = -250, but floored to 0
      expectedPaybackMonths: Infinity // Division by 0
    });
  },

  /**
   * High bleed scenario
   * Very fast ROI payback
   */
  highBleed(): ProductPricingScenario {
    return createProductPricingScenario('High Bleed Voice Agent', {
      description: 'High monthly bleed - fast payback',
      intake: createVoiceAgentIntake(),
      monthlyBleed: 15_000,
      expectedSetupHours: 16,
      expectedSetupFee: 2000,
      expectedMonthly: 250,
      expectedFirstYear: 5000,
      expectedNetMonthlySavings: 14_750, // 15000 - 250
      expectedPaybackMonths: 0.1 // 2000 / 14750 ≈ 0.14
    });
  }
};

// =============================================================================
// DETECTION TEST CASE FACTORY
// =============================================================================

/**
 * Pre-built detection test cases
 */
export const DetectionTestCases: DetectionTestCase[] = [
  {
    name: 'High Confidence Voice Agent',
    description: 'Multiple primary keywords - should detect as voice agent',
    intake: createVoiceAgentIntake(),
    expectedIsProduct: true,
    expectedProjectType: 'voice_agent',
    expectedMinConfidence: 0.8,
    expectedMaxConfidence: 1
  },
  {
    name: 'Standard Project',
    description: 'No voice keywords - should detect as project',
    intake: createProjectIntake(),
    expectedIsProduct: false,
    expectedProjectType: 'workflow_automation',
    expectedMinConfidence: 0,
    expectedMaxConfidence: 0.3
  },
  {
    name: 'Borderline Voice Agent',
    description: 'Just above threshold - should detect as voice agent',
    intake: EdgeCases.borderlineVoiceAgent(),
    expectedIsProduct: true,
    expectedProjectType: 'voice_agent',
    expectedMinConfidence: 0.5,
    expectedMaxConfidence: 0.7
  },
  {
    name: 'Borderline Project',
    description: 'Just below threshold - should detect as project',
    intake: EdgeCases.borderlineProject(),
    expectedIsProduct: false,
    expectedProjectType: 'workflow_automation',
    expectedMinConfidence: 0.1,
    expectedMaxConfidence: 0.5
  },
  {
    name: 'Zero Score',
    description: 'No voice-related keywords at all',
    intake: EdgeCases.zeroScore(),
    expectedIsProduct: false,
    expectedProjectType: 'workflow_automation',
    expectedMinConfidence: 0,
    expectedMaxConfidence: 0.1
  },
  {
    name: 'Maximum Score',
    description: 'All keyword categories heavily represented',
    intake: EdgeCases.maxScore(),
    expectedIsProduct: true,
    expectedProjectType: 'voice_agent',
    expectedMinConfidence: 1,
    expectedMaxConfidence: 1
  },
  {
    name: 'Industry Only',
    description: 'Has industry keywords but no voice keywords',
    intake: EdgeCases.industryOnly(),
    expectedIsProduct: false,
    expectedProjectType: 'workflow_automation',
    expectedMinConfidence: 0,
    expectedMaxConfidence: 0.5
  }
];

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createVoiceAgentIntake,
  createProjectIntake,
  createProductPricingScenario,
  EdgeCases,
  PricingScenarios,
  DetectionTestCases
};
