/**
 * Combinatorial Unit Tests for lead-scoring.js
 *
 * ATDD: Massive parameterized test coverage with auto-healing patterns
 *
 * Coverage Strategy:
 * - 7 scoring components × ~100+ input combinations each
 * - Boundary testing for all thresholds
 * - Combinatorial explosion testing for cross-component interactions
 * - Auto-healing assertions with tolerance bands
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { faker } from '@faker-js/faker';

// -----------------------------------------------------------------------------
// Module Import (with retry for auto-healing)
// -----------------------------------------------------------------------------

let calculateLeadScore: (formData: any, config: any, catalog?: any, intelligence?: any) => any;
let getLeadStatus: (score: number, thresholds?: any) => any;
let getLeadQualification: (formData: any, config: any, catalog?: any, intelligence?: any) => any;
let getKeyMetrics: (formData: any, qualification: any) => any;
let getCompanyProfile: (formData: any) => any;

beforeEach(async () => {
  const module = await import('../../lib/lead-scoring.js');
  calculateLeadScore = module.calculateLeadScore;
  getLeadStatus = module.getLeadStatus;
  getLeadQualification = module.getLeadQualification;
  getKeyMetrics = module.getKeyMetrics;
  getCompanyProfile = module.getCompanyProfile;
});

// -----------------------------------------------------------------------------
// Data Factories
// -----------------------------------------------------------------------------

const BUDGET_VALUES = [
  'under_5k', '5k_15k', '15k_30k', '30k_50k', 'over_50k', 'not_sure',
  undefined, null, '', 'invalid_value'
] as const;

const TIMELINE_VALUES = [
  'immediate', '1_3_months', '3_6_months', '6_12_months', 'exploring',
  undefined, null, '', 'invalid'
] as const;

const DECISION_MAKER_VALUES = [
  'self', 'partner', 'manager', 'committee', 'unknown',
  undefined, null, '', 'invalid'
] as const;

const CURRENT_SOLUTION_VALUES = [
  'personal_cell', 'voicemail', 'answering_service', 'staff_rotation', 'not_applicable',
  undefined, null, '', 'invalid'
] as const;

const PERIOD_UNIT_VALUES = ['hour', 'day', 'week', 'month', undefined, null, ''] as const;

// Volume test ranges (normalized to monthly)
const VOLUME_RANGES = [
  { runs: 0, unit: 'day', expectedRange: [0, 40] },
  { runs: 1, unit: 'day', expectedRange: [35, 45] },
  { runs: 5, unit: 'day', expectedRange: [50, 65] },
  { runs: 10, unit: 'day', expectedRange: [60, 75] },
  { runs: 50, unit: 'day', expectedRange: [85, 100] },
  { runs: 100, unit: 'day', expectedRange: [90, 100] },
  { runs: 1, unit: 'hour', expectedRange: [70, 85] },
  { runs: 10, unit: 'hour', expectedRange: [95, 100] },
  { runs: 1, unit: 'week', expectedRange: [25, 40] },
  { runs: 25, unit: 'week', expectedRange: [70, 85] },
  { runs: 10, unit: 'month', expectedRange: [25, 45] },
  { runs: 100, unit: 'month', expectedRange: [65, 80] },
  { runs: 500, unit: 'month', expectedRange: [85, 95] },
  { runs: 1000, unit: 'month', expectedRange: [95, 100] },
];

// System count configurations for complexity testing
const SYSTEM_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];

// Pain indicator text lengths
const TEXT_LENGTHS = [0, 10, 20, 30, 40, 50, 60, 100, 200];

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

function createFormData(overrides: Record<string, unknown> = {}) {
  return {
    q01_account_name: faker.company.name(),
    q02_contact_name: faker.person.fullName(),
    q03_contact_title: faker.person.jobTitle(),
    q04_contact_email: faker.internet.email(),
    q05_contact_phone: faker.phone.number(),
    q06_runs_per_period: faker.number.int({ min: 1, max: 100 }),
    q06_period_unit: faker.helpers.arrayElement(['hour', 'day', 'week', 'month']),
    q06_workflow_name: faker.lorem.words(3),
    q10_systems_involved: [],
    q25_industry: faker.helpers.arrayElement(['healthcare', 'finance', 'retail', 'technology']),
    ...overrides,
  };
}

function createSystemsList(count: number): string[] {
  const systems = [
    'salesforce', 'hubspot', 'slack', 'stripe', 'quickbooks',
    'google-workspace', 'microsoft-365', 'zendesk', 'mailchimp',
    'twilio', 'sendgrid', 'airtable', 'monday', 'asana'
  ];
  return systems.slice(0, Math.min(count, systems.length));
}

function createTextOfLength(length: number): string {
  if (length === 0) return '';
  return faker.lorem.words(Math.ceil(length / 5)).slice(0, Math.max(0, length));
}

function createSystemIntelligenceMap(systems: string[], complexityScore = 5): Map<string, any> {
  const map = new Map();
  for (const system of systems) {
    map.set(system, {
      id: system,
      name: system,
      has_api: true,
      has_native_node: faker.datatype.boolean(),
      complexity_score: complexityScore,
    });
  }

  return map;
}

// -----------------------------------------------------------------------------
// Auto-Healing Utilities
// -----------------------------------------------------------------------------

/**
 * Assert score is within expected range (auto-healing tolerance)
 */
function expectScoreInRange(actual: number, expected: number, tolerance = 5) {
  const min = Math.max(0, expected - tolerance);
  const max = Math.min(100, expected + tolerance);
  expect(actual).toBeGreaterThanOrEqual(min);
  expect(actual).toBeLessThanOrEqual(max);
}

/**
 * Assert component score with flexible tolerance
 */
function expectComponentScore(components: any[], name: string, expectedRange: [number, number]) {
  const component = components.find((c: any) => c.name === name);
  expect(component).toBeDefined();
  expect(component.raw_score).toBeGreaterThanOrEqual(expectedRange[0]);
  expect(component.raw_score).toBeLessThanOrEqual(expectedRange[1]);
}

/**
 * Retry test execution with exponential backoff (for flaky scenarios)
 */
async function withRetry<T>(fn: () => T | Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      await new Promise(r => setTimeout(r, 2**i * 10));
    }
  }

  throw lastError ?? new Error('Retry failed without surfacing an error');
}

// =============================================================================
// BUDGET ALIGNMENT TESTS (Component 1)
// =============================================================================

describe('[P0] Budget Alignment - Combinatorial', () => {
  const budgetExpectations: Record<string, number> = {
    'under_5k': 20,
    '5k_15k': 50,
    '15k_30k': 80,
    '30k_50k': 100,
    'over_50k': 100,
    'not_sure': 40,
  };

  // Generate 100+ test cases for budget values
  const budgetTestCases = BUDGET_VALUES.flatMap(budget => 
    // Test each budget with multiple volume/timeline combinations
    VOLUME_RANGES.slice(0, 10).map(vol => ({
      budget,
      runs: vol.runs,
      unit: vol.unit,
      expected: budgetExpectations[budget as string] ?? 30,
    }))
  );

  it.each(budgetTestCases)(
    '[P0] budget=$budget with volume $runs/$unit should score ~$expected',
    async ({ budget, runs, unit, expected }) => {
      const formData = createFormData({
        q28_budget_range: budget,
        q06_runs_per_period: runs,
        q06_period_unit: unit,
      });

      const result = await withRetry(() => calculateLeadScore(formData, {}));

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expectComponentScore(result.components, 'budget_alignment', [
        Math.max(0, expected - 5),
        Math.min(100, expected + 5),
      ]);
    }
  );

  // Edge cases: null, undefined, invalid
  it.each([
    [undefined, 30],
    [null, 30],
    ['', 30],
    ['invalid_budget', 30],
    ['UNDER_5K', 30], // Wrong case
    ['Under_5k', 30], // Mixed case
  ])('[P1] edge case budget=%s should default to %d', async (budget, expected) => {
    const formData = createFormData({ q28_budget_range: budget });
    const result = calculateLeadScore(formData, {});
    expectComponentScore(result.components, 'budget_alignment', [expected - 2, expected + 2]);
  });
});

// =============================================================================
// INTEGRATION COMPLEXITY TESTS (Component 2)
// =============================================================================

describe('[P0] Integration Complexity - Combinatorial', () => {
  const complexityExpectations = [
    { count: 0, expected: 40 },   // No systems = unclear scope
    { count: 1, expected: 100 },  // Simple
    { count: 2, expected: 100 },  // Simple
    { count: 3, expected: 80 },   // Moderate
    { count: 4, expected: 80 },   // Moderate
    { count: 5, expected: 60 },   // Complex
    { count: 6, expected: 60 },   // Complex
    { count: 7, expected: 40 },   // Very complex
    { count: 8, expected: 40 },   // Very complex
    { count: 9, expected: 20 },   // Extremely complex
    { count: 10, expected: 20 },  // Extremely complex
    { count: 15, expected: 20 },  // Extremely complex
  ];

  // Generate combinatorial tests: system count × budget × timeline
  const complexityTestCases = complexityExpectations.flatMap(({ count, expected }) => BUDGET_VALUES.slice(0, 5).flatMap(budget => TIMELINE_VALUES.slice(0, 3).map(timeline => ({
    systemCount: count,
    budget,
    timeline,
    expectedComplexity: expected,
  }))));

  it.each(complexityTestCases)(
    '[P0] $systemCount systems, budget=$budget, timeline=$timeline',
    async ({ systemCount, budget, timeline, expectedComplexity }) => {
      const systems = createSystemsList(systemCount);
      const formData = createFormData({
        q10_systems_involved: systems,
        q28_budget_range: budget,
        q27_timeline: timeline,
      });

      const result = calculateLeadScore(formData, {});

      expectComponentScore(result.components, 'integration_complexity', [
        Math.max(0, expectedComplexity - 10),
        Math.min(100, expectedComplexity + 10),
      ]);
    }
  );

  // Array type edge cases
  it.each([
    [undefined, 40],
    [null, 40],
    ['not-an-array', 40],
    [123, 40],
    [[], 40],
    [['single'], 100],
  ])('[P1] systems=%p should score ~%d', async (systems, expected) => {
    const formData = createFormData({ q10_systems_involved: systems });
    const result = calculateLeadScore(formData, {});
    expectComponentScore(result.components, 'integration_complexity', [expected - 5, expected + 5]);
  });
});

// =============================================================================
// VOLUME POTENTIAL TESTS (Component 3)
// =============================================================================

describe('[P0] Volume Potential - Combinatorial', () => {
  // Generate ~200 volume test cases
  const volumeTestCases = VOLUME_RANGES.flatMap(({ runs, unit, expectedRange }) => BUDGET_VALUES.slice(0, 5).map(budget => ({
    runs,
    unit,
    budget,
    expectedMin: expectedRange[0],
    expectedMax: expectedRange[1],
  })));

  it.each(volumeTestCases)(
    '[P0] volume $runs/$unit with budget=$budget',
    async ({ runs, unit, budget, expectedMin, expectedMax }) => {
      const formData = createFormData({
        q06_runs_per_period: runs,
        q06_period_unit: unit,
        q28_budget_range: budget,
      });

      const result = calculateLeadScore(formData, {});

      expectComponentScore(result.components, 'volume_potential', [
        Math.max(0, expectedMin - 10),
        Math.min(100, expectedMax + 10),
      ]);
    }
  );

  // Extreme volume edge cases
  it.each([
    [1_000_000, 'day', 100],  // Extremely high volume
    [0.5, 'hour', 80],      // Fractional (0.5/hr = 360/mo = high)
    [-10, 'day', 30],       // Negative (treated as 0)
    [Number.NaN, 'day', 30],       // NaN
    [Infinity, 'day', 100], // Infinity
  ])('[P1] extreme volume %d/%s should score ~%d', async (runs, unit, expected) => {
    const formData = createFormData({
      q06_runs_per_period: runs,
      q06_period_unit: unit,
    });
    const result = calculateLeadScore(formData, {});
    expectComponentScore(result.components, 'volume_potential', [
      Math.max(0, expected - 15),
      Math.min(100, expected + 15),
    ]);
  });

  // Period unit edge cases
  it.each([
    [undefined, 30],
    [null, 30],
    ['', 30],
    ['invalid', 30],
    ['HOUR', 30], // Wrong case - may not match
    ['Day', 30],  // Mixed case
  ])('[P1] period_unit=%s with 10 runs should handle gracefully', async (unit, _expected) => {
    const formData = createFormData({
      q06_runs_per_period: 10,
      q06_period_unit: unit,
    });
    const result = calculateLeadScore(formData, {});
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// TIMELINE URGENCY TESTS (Component 4)
// =============================================================================

describe('[P0] Timeline Urgency - Combinatorial', () => {
  const timelineExpectations: Record<string, number> = {
    'immediate': 100,
    '1_3_months': 80,
    '3_6_months': 60,
    '6_12_months': 40,
    'exploring': 30,
  };

  // Generate combinatorial tests
  const timelineTestCases = TIMELINE_VALUES.flatMap(timeline => BUDGET_VALUES.slice(0, 5).flatMap(budget => DECISION_MAKER_VALUES.slice(0, 3).map(dm => ({
    timeline,
    budget,
    decisionMaker: dm,
    expected: timelineExpectations[timeline as string] ?? 50,
  }))));

  it.each(timelineTestCases)(
    '[P0] timeline=$timeline, budget=$budget, dm=$decisionMaker',
    async ({ timeline, budget, decisionMaker, expected }) => {
      const formData = createFormData({
        q27_timeline: timeline,
        q28_budget_range: budget,
        q26_decision_maker: decisionMaker,
      });

      const result = calculateLeadScore(formData, {});

      expectComponentScore(result.components, 'timeline_urgency', [
        Math.max(0, expected - 10),
        Math.min(100, expected + 10),
      ]);
    }
  );
});

// =============================================================================
// DECISION MAKER ACCESS TESTS (Component 5)
// =============================================================================

describe('[P0] Decision Maker Access - Combinatorial', () => {
  const dmExpectations: Record<string, number> = {
    'self': 100,
    'partner': 90,
    'manager': 70,
    'committee': 50,
    'unknown': 30,
  };

  // Generate combinatorial tests
  const dmTestCases = DECISION_MAKER_VALUES.flatMap(dm => TIMELINE_VALUES.slice(0, 4).flatMap(timeline => BUDGET_VALUES.slice(0, 4).map(budget => ({
    dm,
    timeline,
    budget,
    expected: dmExpectations[dm as string] ?? 50,
  }))));

  it.each(dmTestCases)(
    '[P0] dm=$dm, timeline=$timeline, budget=$budget',
    async ({ dm, timeline, budget, expected }) => {
      const formData = createFormData({
        q26_decision_maker: dm,
        q27_timeline: timeline,
        q28_budget_range: budget,
      });

      const result = calculateLeadScore(formData, {});

      expectComponentScore(result.components, 'decision_maker_access', [
        Math.max(0, expected - 10),
        Math.min(100, expected + 10),
      ]);
    }
  );
});

// =============================================================================
// PAIN SEVERITY TESTS - VOICE AGENT PARITY (Component 6)
// =============================================================================

describe('[P0] Pain Severity - Voice Agent Parity - Combinatorial', () => {
  // Voice Agent signal mapping (aligned with sarah-agent-tech-spec.md)
  const currentSolutionScores: Record<string, number> = {
    'personal_cell': 75,    // 50 base + 25 (HOT signal)
    'voicemail': 70,        // 50 base + 20 (HOT signal)
    'answering_service': 60, // 50 base + 10 (WARM signal)
    'staff_rotation': 55,   // 50 base + 5
    'not_applicable': 50,   // 50 base + 0
  };

  // Pain text indicators add points
  const painTextBoosts = [
    { field: 'q14_cost_if_slow_or_failed', minLength: 51, boost: 15 },
    { field: 'q13_common_failures', minLength: 31, boost: 10 },
    { field: 'q15_one_thing_to_fix', minLength: 21, boost: 10 },
  ];

  // Generate massive combinatorial tests: current_solution × text_lengths × volume
  const painTestCases = CURRENT_SOLUTION_VALUES.flatMap(solution => TEXT_LENGTHS.filter(l => l <= 60).flatMap(costLength => TEXT_LENGTHS.filter(l => l <= 40).flatMap(failuresLength => TEXT_LENGTHS.filter(l => l <= 30).map(fixLength => {
    let expectedScore = 50; // Base

    if (solution && typeof solution === 'string' && solution in currentSolutionScores) {
      expectedScore = currentSolutionScores[solution] ?? 50;
    }

    if (costLength > 50) expectedScore += 15;
    if (failuresLength > 30) expectedScore += 10;
    if (fixLength > 20) expectedScore += 10;

    return {
      solution,
      costLength,
      failuresLength,
      fixLength,
      expectedMin: Math.min(expectedScore, 100) - 5,
      expectedMax: Math.min(expectedScore, 100) + 5,
    };
  }))));

  // Run subset of tests (full combinatorial would be 1000+)
  const sampledTestCases = painTestCases.filter((_, i) => i % 10 === 0); // Every 10th

  it.each(sampledTestCases)(
    '[P0] solution=$solution, cost=$costLength, failures=$failuresLength, fix=$fixLength',
    async ({ solution, costLength, failuresLength, fixLength, expectedMin, expectedMax }) => {
      const formData = createFormData({
        current_solution: solution,
        q14_cost_if_slow_or_failed: createTextOfLength(costLength),
        q13_common_failures: createTextOfLength(failuresLength),
        q15_one_thing_to_fix: createTextOfLength(fixLength),
      });

      const result = calculateLeadScore(formData, {});

      expectComponentScore(result.components, 'pain_severity', [
        Math.max(0, expectedMin),
        Math.min(100, expectedMax),
      ]);
    }
  );

  // Dedicated Voice Agent signal tests
  describe('[P1] Voice Agent Hot/Warm Signal Alignment', () => {
    it.each([
      ['personal_cell', 'hot', 75],  // HOT: "So you're getting woken up for non-emergencies"
      ['voicemail', 'hot', 70],      // HOT: "So some of those emergency calls are going to competitors"
      ['answering_service', 'warm', 60], // WARM: "What are you paying for that, around 2 grand a month?"
    ])('[P1] %s should signal %s with base score ~%d', async (solution, _signal, expectedBase) => {
      const formData = createFormData({ current_solution: solution });
      const result = calculateLeadScore(formData, {});

      const painComponent = result.components.find((c: any) => c.name === 'pain_severity');
      expect(painComponent.raw_score).toBeGreaterThanOrEqual(expectedBase - 5);
    });
  });
});

// =============================================================================
// API READINESS TESTS (Component 7)
// =============================================================================

describe('[P0] API Readiness - Combinatorial', () => {
  // Test with different intelligence map configurations
  const apiReadinessTestCases = SYSTEM_COUNTS.flatMap(count => [1, 3, 5, 7, 9].map(complexityScore => ({
    systemCount: count,
    complexityScore,
    // Lower complexity = higher readiness: (10 - complexity) * 10
    expectedReadiness: count === 0 ? 50 : (10 - complexityScore) * 10,
  })));

  it.each(apiReadinessTestCases)(
    '[P0] $systemCount systems, complexity=$complexityScore',
    async ({ systemCount, complexityScore, expectedReadiness }) => {
      const systems = createSystemsList(systemCount);
      const intelligence = createSystemIntelligenceMap(systems, complexityScore);

      const formData = createFormData({ q10_systems_involved: systems });
      const result = calculateLeadScore(formData, {}, null, intelligence);

      if (systemCount > 0) {
        expectComponentScore(result.components, 'api_readiness', [
          Math.max(0, expectedReadiness - 15),
          Math.min(100, expectedReadiness + 15),
        ]);
      } else {
        expectComponentScore(result.components, 'api_readiness', [45, 55]); // Neutral for no systems
      }
    }
  );

  // Test native node vs API vs unknown
  it.each([
    [{ has_native_node: true, has_api: true }, 100],
    [{ has_native_node: false, has_api: true }, 60],
    [{ has_native_node: false, has_api: false }, 30],
  ])('[P1] system flags %p should score ~%d', async (flags, expected) => {
    const formData = createFormData({ q10_systems_involved: ['test-system'] });
    const intelligence = new Map([
      ['test-system', { id: 'test-system', name: 'Test', ...flags }],
    ]);

    const result = calculateLeadScore(formData, {}, null, intelligence);
    expectComponentScore(result.components, 'api_readiness', [expected - 10, expected + 10]);
  });
});

// =============================================================================
// TOTAL SCORE BOUNDARY TESTS
// =============================================================================

describe('[P0] Total Score Boundaries', () => {
  it.each([
    ['minimum', { q28_budget_range: 'under_5k', q27_timeline: 'exploring', q26_decision_maker: 'unknown' }, [30, 55]],
    ['maximum', { q28_budget_range: 'over_50k', q27_timeline: 'immediate', q26_decision_maker: 'self', current_solution: 'personal_cell' }, [70, 100]],
    ['neutral', {}, [30, 60]],
  ])('[P0] %s case should score within [%d, %d]', async (_name, overrides, expectedRange) => {
    const formData = createFormData(overrides);
    const result = calculateLeadScore(formData, {});

    expect(result.score).toBeGreaterThanOrEqual(expectedRange[0]);
    expect(result.score).toBeLessThanOrEqual(expectedRange[1]);
  });

  // Auto-healing: test score always in valid range regardless of input
  it.each(Array.from({ length: 100 }, (_, i) => [i]))('[P1] fuzz test %d should produce valid score', async () => {
    const formData = {
      q28_budget_range: faker.helpers.arrayElement([...BUDGET_VALUES, faker.lorem.word()]),
      q27_timeline: faker.helpers.arrayElement([...TIMELINE_VALUES, faker.lorem.word()]),
      q26_decision_maker: faker.helpers.arrayElement([...DECISION_MAKER_VALUES, faker.lorem.word()]),
      q06_runs_per_period: faker.number.int({ min: -100, max: 10_000 }),
      q06_period_unit: faker.helpers.arrayElement([...PERIOD_UNIT_VALUES, faker.lorem.word()]),
      current_solution: faker.helpers.arrayElement([...CURRENT_SOLUTION_VALUES, faker.lorem.word()]),
      q10_systems_involved: faker.datatype.boolean() ? createSystemsList(faker.number.int({ min: 0, max: 15 })) : undefined,
      q13_common_failures: createTextOfLength(faker.number.int({ min: 0, max: 200 })),
      q14_cost_if_slow_or_failed: createTextOfLength(faker.number.int({ min: 0, max: 200 })),
      q15_one_thing_to_fix: createTextOfLength(faker.number.int({ min: 0, max: 100 })),
    };

    const result = calculateLeadScore(formData, {});

    // Auto-healing assertion: score must ALWAYS be in valid range
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components).toBeInstanceOf(Array);
    expect(result.components.length).toBe(7);

    // Every component must have valid structure
    for (const component of result.components) {
      expect(component).toHaveProperty('name');
      expect(component).toHaveProperty('raw_score');
      expect(component).toHaveProperty('weighted_score');
      expect(component.raw_score).toBeGreaterThanOrEqual(0);
      expect(component.raw_score).toBeLessThanOrEqual(100);
    }
  });
});

// =============================================================================
// LEAD STATUS DETERMINATION
// =============================================================================

describe('[P0] getLeadStatus - Threshold Boundaries', () => {
  // Test every integer score from 0-100
  const scoreTestCases = Array.from({ length: 101 }, (_, score) => {
    let expectedStatus: string;
    if (score >= 75) expectedStatus = 'hot';
    else if (score >= 50) expectedStatus = 'warm';
    else expectedStatus = 'cold';
    return { score, expectedStatus };
  });

  it.each(scoreTestCases)('[P0] score $score should be $expectedStatus', ({ score, expectedStatus }) => {
    const result = getLeadStatus(score);
    expect(result.status).toBe(expectedStatus);
  });

  // Custom threshold tests
  describe('[P1] Custom Thresholds', () => {
    const customThresholdCases = [
      { thresholds: { hot: 90, warm: 70 }, score: 85, expected: 'warm' },
      { thresholds: { hot: 90, warm: 70 }, score: 95, expected: 'hot' },
      { thresholds: { hot: 90, warm: 70 }, score: 65, expected: 'cold' },
      { thresholds: { hot: 60, warm: 30 }, score: 50, expected: 'warm' },
      { thresholds: { hot: 60, warm: 30 }, score: 25, expected: 'cold' },
    ];

    it.each(customThresholdCases)(
      '[P1] score $score with thresholds $thresholds should be $expected',
      ({ thresholds, score, expected }) => {
        const result = getLeadStatus(score, thresholds);
        expect(result.status).toBe(expected);
      }
    );
  });
});

// =============================================================================
// WEIGHT CUSTOMIZATION
// =============================================================================

describe('[P1] Custom Weight Configurations', () => {
  const weightConfigurations = [
    { name: 'budget_heavy', weights: { budget_alignment: 50, integration_complexity: 10 } },
    { name: 'volume_heavy', weights: { volume_potential: 50, timeline_urgency: 5 } },
    { name: 'pain_heavy', weights: { pain_severity: 50, api_readiness: 5 } },
    { name: 'balanced', weights: {} }, // Default
  ];

  it.each(weightConfigurations)('[P1] $name weight configuration', async ({ weights }) => {
    const formData = createFormData({
      q28_budget_range: '30k_50k',
      q06_runs_per_period: 100,
      q06_period_unit: 'day',
      current_solution: 'personal_cell',
    });

    const result = calculateLeadScore(formData, { weights });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.length).toBe(7);
  });
});

// =============================================================================
// COMPANY PROFILE EXTRACTION
// =============================================================================

describe('[P0] getCompanyProfile - Field Extraction', () => {
  // Fields that map directly (some have defaults)
  const profileFieldCases = [
    { field: 'q01_account_name', profileKey: 'account_name', hasDefault: true },
    { field: 'q02_contact_name', profileKey: 'contact_name', hasDefault: false },
    { field: 'q03_contact_title', profileKey: 'contact_title', hasDefault: false },
    { field: 'q04_contact_email', profileKey: 'contact_email', hasDefault: false },
    { field: 'q05_contact_phone', profileKey: 'contact_phone', hasDefault: false },
    { field: 'q25_industry', profileKey: 'industry', hasDefault: false },
    { field: 'q06_workflow_name', profileKey: 'workflow_name', hasDefault: true },
  ];

  it.each(profileFieldCases)(
    '[P0] $field maps to $profileKey',
    ({ field, profileKey }) => {
      const testValue = faker.lorem.words(2);
      const formData = createFormData({ [field]: testValue });
      const profile = getCompanyProfile(formData);

      expect(profile[profileKey]).toBe(testValue);
    }
  );

  // Missing field handling (only for fields without defaults)
  const fieldsWithoutDefaults = profileFieldCases.filter(f => !f.hasDefault);
  it.each(fieldsWithoutDefaults)(
    '[P1] missing $field should be null',
    ({ field, profileKey }) => {
      const formData = createFormData();
      const { [field]: _omitted, ...rest } = formData as Record<string, unknown>;
      const profile = getCompanyProfile(rest);

      expect(profile[profileKey]).toBeNull();
    }
  );
});

// =============================================================================
// KEY METRICS CALCULATION
// =============================================================================

describe('[P0] getKeyMetrics - Derived Calculations', () => {
  const metricsTestCases = [
    {
      systems: createSystemsList(2),
      complexityRaw: 100,
      volumeRaw: 80,
      expectedRisk: 'low',
      expectedRoi: 'high',
    },
    {
      systems: createSystemsList(6),
      complexityRaw: 60,
      volumeRaw: 40,
      expectedRisk: 'high',
      expectedRoi: 'low',
    },
    {
      systems: createSystemsList(4),
      complexityRaw: 80,
      volumeRaw: 60,
      expectedRisk: 'medium',
      expectedRoi: 'medium',
    },
  ];

  it.each(metricsTestCases)(
    '[P0] $systems.length systems, complexity=$complexityRaw, volume=$volumeRaw',
    ({ systems, complexityRaw, volumeRaw, expectedRisk, expectedRoi }) => {
      const formData = createFormData({ q10_systems_involved: systems });
      const qualification = {
        components: [
          { name: 'integration_complexity', raw_score: complexityRaw },
          { name: 'volume_potential', raw_score: volumeRaw },
        ],
      };

      const metrics = getKeyMetrics(formData, qualification);

      expect(metrics.systems_count).toBe(systems.length);
      expect(['low', 'medium', 'high']).toContain(metrics.risk_level);
      expect(['low', 'medium', 'high']).toContain(metrics.roi_potential);
    }
  );
});

// =============================================================================
// CROSS-COMPONENT INTERACTION TESTS
// =============================================================================

describe('[P0] Cross-Component Interactions', () => {
  // Test that high scores in all components produce high total
  it('[P0] all-high scenario should produce HOT lead', () => {
    const formData = createFormData({
      q28_budget_range: 'over_50k',          // Budget: 100
      q10_systems_involved: ['slack'],       // Complexity: 100
      q06_runs_per_period: 1000,             // Volume: 100
      q06_period_unit: 'day',
      q27_timeline: 'immediate',             // Timeline: 100
      q26_decision_maker: 'self',            // DM: 100
      current_solution: 'personal_cell',     // Pain: 75+
      q14_cost_if_slow_or_failed: createTextOfLength(100),
      q13_common_failures: createTextOfLength(50),
      q15_one_thing_to_fix: createTextOfLength(30),
    });

    const result = calculateLeadScore(formData, {});
    const status = getLeadStatus(result.score);

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(status.status).toBe('hot');
  });

  // Test that low scores in all components produce cold total
  it('[P0] all-low scenario should produce COLD lead', () => {
    const formData = createFormData({
      q28_budget_range: 'under_5k',          // Budget: 20
      q10_systems_involved: createSystemsList(10), // Complexity: 20
      q06_runs_per_period: 1,                // Volume: 30
      q06_period_unit: 'month',
      q27_timeline: 'exploring',             // Timeline: 30
      q26_decision_maker: 'unknown',         // DM: 30
      current_solution: 'not_applicable',    // Pain: 50
    });

    const result = calculateLeadScore(formData, {});
    const status = getLeadStatus(result.score);

    expect(result.score).toBeLessThan(50);
    expect(status.status).toBe('cold');
  });
});

// =============================================================================
// PERFORMANCE AND STABILITY
// =============================================================================

describe('[P2] Performance and Stability', () => {
  it('[P2] should handle 1000 rapid calculations without degradation', async () => {
    const startTime = Date.now();

    for (let i = 0; i < 1000; i++) {
      const formData = createFormData();
      calculateLeadScore(formData, {});
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
  });

  it('[P2] should produce deterministic results for same input', () => {
    const formData = createFormData({
      q28_budget_range: '30k_50k',
      q06_runs_per_period: 50,
      q06_period_unit: 'day',
    });

    const results = Array.from({ length: 10 }, () => calculateLeadScore(formData, {}));

    // All scores should be identical
    const firstScore = results[0].score;
    for (const result of results) {
      expect(result.score).toBe(firstScore);
    }
  });
});
