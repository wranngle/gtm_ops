/**
 * Integration Data Factory
 * Generates realistic integration research data for testing
 */
import { faker } from '@faker-js/faker';

export interface IntegrationData {
  system: string;
  integration?: string;
  type?: string;
  integration_type?: string;
  complexity?: string;
  has_native_node?: boolean;
  notes?: string;
  research?: {
    auth_type?: string;
    integrations?: Array<{
      has_native_node: boolean;
      name: string;
    }>;
    labor_factors?: string[];
  };
}

export function createIntegration(overrides: Partial<IntegrationData> = {}): IntegrationData {
  const system = overrides.system || faker.helpers.arrayElement([
    'Dentrix G7',
    'Weave',
    'Salesforce',
    'Google Calendar',
    'Rectangle Health',
    'DentalXchange',
    'Carestream'
  ]);
  
  return {
    system,
    integration: system, // buildTechnicalApproach filters on r.integration
    type: faker.helpers.arrayElement(['API', 'OAuth', 'Webhook', 'SDK']),
    complexity: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
    has_native_node: faker.datatype.boolean(),
    notes: faker.lorem.sentence(),
    research: {
      auth_type: faker.helpers.arrayElement(['OAuth2', 'API Key', 'Basic Auth']),
      integrations: [{
        has_native_node: faker.datatype.boolean(),
        name: 'Primary Integration'
      }],
      labor_factors: [
        'Custom API wrapper required',
        'Rate limiting considerations'
      ]
    },
    ...overrides
  };
}

export function createIntegrationList(count: number): IntegrationData[] {
  return Array.from({ length: count }, () => createIntegration());
}

/**
 * Create common dental practice integrations
 */
export function createDentalIntegrations(): IntegrationData[] {
  return [
    createIntegration({
      system: 'Dentrix G7',
      type: 'API',
      complexity: 'High',
      has_native_node: false,
      notes: 'Practice management system - requires ODBC connector'
    }),
    createIntegration({
      system: 'Weave',
      type: 'API',
      complexity: 'Medium',
      has_native_node: true,
      notes: 'Phone/SMS platform with native n8n node'
    }),
    createIntegration({
      system: 'Google Calendar',
      type: 'OAuth',
      complexity: 'Low',
      has_native_node: true,
      notes: 'Calendar integration via Google Workspace node'
    }),
    createIntegration({
      system: 'Rectangle Health',
      type: 'API',
      complexity: 'Medium',
      has_native_node: false,
      notes: 'Payment processing - requires REST API integration'
    }),
    createIntegration({
      system: 'DentalXchange',
      type: 'API',
      complexity: 'High',
      has_native_node: false,
      notes: 'Claims submission - EDI/X12 format required'
    })
  ];
}

/**
 * Create generic category test cases
 */
export function createGenericCategoryTestCases(): Array<{
  input: string;
  expectedIsGeneric: boolean;
  expectedKey: string | null;
}> {
  return [
    { input: 'Phone/SMS', expectedIsGeneric: true, expectedKey: 'phone/sms' },
    { input: 'phone/sms', expectedIsGeneric: true, expectedKey: 'phone/sms' },
    { input: 'Weave', expectedIsGeneric: false, expectedKey: null },
    { input: 'weave', expectedIsGeneric: false, expectedKey: null },
    { input: 'Dentrix G7', expectedIsGeneric: false, expectedKey: null },
    { input: 'Practice Management', expectedIsGeneric: true, expectedKey: 'practice management' },
    { input: 'Payments', expectedIsGeneric: true, expectedKey: 'payments' },
    { input: 'Rectangle Health', expectedIsGeneric: false, expectedKey: null },
    { input: 'Scheduling', expectedIsGeneric: true, expectedKey: 'scheduling' },
    { input: 'Google Calendar', expectedIsGeneric: false, expectedKey: null },
    { input: 'CRM', expectedIsGeneric: true, expectedKey: 'crm' },
    { input: 'Salesforce', expectedIsGeneric: false, expectedKey: null },
    { input: 'VoIP', expectedIsGeneric: true, expectedKey: 'voip' },
    { input: 'RingCentral', expectedIsGeneric: false, expectedKey: null }
  ];
}

/**
 * Create deduplication test cases - generic should be removed when specific exists
 */
export function createDeduplicationTestCases(): Array<{
  integrations: IntegrationData[];
  expectedCount: number;
  shouldRemove: string[];
  description: string;
}> {
  return [
    {
      description: 'Phone/SMS removed when Weave present',
      integrations: [
        createIntegration({ system: 'Phone/SMS' }),
        createIntegration({ system: 'Weave' })
      ],
      expectedCount: 1,
      shouldRemove: ['Phone/SMS']
    },
    {
      description: 'Payments removed when Rectangle Health present',
      integrations: [
        createIntegration({ system: 'Payments' }),
        createIntegration({ system: 'Rectangle Health' })
      ],
      expectedCount: 1,
      shouldRemove: ['Payments']
    },
    {
      description: 'Practice Management removed when Dentrix present',
      integrations: [
        createIntegration({ system: 'Practice Management' }),
        createIntegration({ system: 'Dentrix G7' })
      ],
      expectedCount: 1,
      shouldRemove: ['Practice Management']
    },
    {
      description: 'Multiple generics removed when specifics present',
      integrations: [
        createIntegration({ system: 'Phone/SMS' }),
        createIntegration({ system: 'Weave' }),
        createIntegration({ system: 'Payments' }),
        createIntegration({ system: 'Rectangle Health' }),
        createIntegration({ system: 'Scheduling' }),
        createIntegration({ system: 'Google Calendar' })
      ],
      expectedCount: 3,
      shouldRemove: ['Phone/SMS', 'Payments', 'Scheduling']
    },
    {
      description: 'Generic kept when no specific present',
      integrations: [
        createIntegration({ system: 'Phone/SMS' }),
        createIntegration({ system: 'Dentrix G7' })
      ],
      expectedCount: 2,
      shouldRemove: []
    }
  ];
}

/**
 * Integration Research Result
 * Full research data returned from integration-research.js
 */
export interface IntegrationResearch {
  integration: string;
  found: boolean;
  from_cache: boolean;
  generated: boolean;
  has_native_n8n_node: boolean;
  native_node_name: string | null;
  auth_type: string;
  api_quality: 'excellent' | 'good' | 'fair' | 'poor';
  complexity: {
    score: number;
    tier: string;
    estimated_hours: number;
  };
  effort_recommendation: {
    tier: string;
    base_hours: number;
    rationale: string;
  };
  gotchas: string[];
  client_must_provide: string[];
  citations: Array<{ id: number; url: string; type: string }>;
  freshness: {
    stale: boolean;
    days: number;
    score: number;
    reason: string;
  };
}

export function createIntegrationResearch(overrides: Partial<IntegrationResearch> = {}): IntegrationResearch {
  const integration = overrides.integration || faker.helpers.arrayElement([
    'Dentrix G7',
    'Weave',
    'Salesforce',
    'Google Calendar'
  ]);

  return {
    integration,
    found: true,
    from_cache: faker.datatype.boolean(),
    generated: false,
    has_native_n8n_node: faker.datatype.boolean(),
    native_node_name: faker.datatype.boolean() ? `n8n-nodes-base.${integration.toLowerCase().replace(/\s+/g, '')}` : null,
    auth_type: faker.helpers.arrayElement(['OAuth2', 'API Key', 'Basic Auth', 'Bearer Token']),
    api_quality: faker.helpers.arrayElement(['excellent', 'good', 'fair', 'poor']),
    complexity: {
      score: faker.number.int({ min: 1, max: 10 }),
      tier: faker.helpers.arrayElement(['standard', 'moderate', 'complex', 'enterprise']),
      estimated_hours: faker.number.int({ min: 4, max: 40 })
    },
    effort_recommendation: {
      tier: faker.helpers.arrayElement(['standard', 'moderate', 'complex']),
      base_hours: faker.number.int({ min: 80, max: 200 }),
      rationale: `Based on ${integration} API complexity and authentication requirements.`
    },
    gotchas: [
      faker.lorem.sentence(),
      faker.lorem.sentence()
    ],
    client_must_provide: [
      'API credentials',
      'Admin access to system'
    ],
    citations: [
      { id: 1, url: `https://docs.example.com/${integration.toLowerCase().replace(/\s+/g, '-')}`, type: 'documentation' }
    ],
    freshness: {
      stale: false,
      days: faker.number.int({ min: 1, max: 30 }),
      score: faker.number.float({ min: 0.7, max: 1.0, fractionDigits: 2 }),
      reason: 'Recently researched'
    },
    ...overrides
  };
}
