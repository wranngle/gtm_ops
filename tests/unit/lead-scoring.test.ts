/**
 * Unit Tests for lead-scoring.js
 *
 * Tests critical business logic:
 * - Lead score calculation (0-100)
 * - Hot/warm/cold status determination
 * - Component scoring breakdown
 * - Voice Agent parity (current_solution scoring)
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Import module under test
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

describe('[P0] calculateLeadScore - Core Scoring', () => {
  it('[P0] should return score between 0 and 100', async () => {
    // GIVEN: Basic form data
    const formData = {
      q01_account_name: 'Test Company',
      q06_runs_per_period: 50,
      q06_period_unit: 'day',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Score should be in valid range
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components).toBeInstanceOf(Array);
  });

  it('[P0] should include all 7 scoring components', async () => {
    // GIVEN: Complete form data
    const formData = {
      q28_budget_range: '30k_50k',
      q10_systems_involved: ['salesforce', 'slack'],
      q06_runs_per_period: 100,
      q06_period_unit: 'day',
      q27_timeline: 'immediate',
      q26_decision_maker: 'self',
      q13_common_failures: 'Frequent errors and delays in processing',
      q15_one_thing_to_fix: 'Automate the manual data entry',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: All 7 components should be present
    const componentNames = result.components.map((c: any) => c.name);
    expect(componentNames).toContain('budget_alignment');
    expect(componentNames).toContain('integration_complexity');
    expect(componentNames).toContain('volume_potential');
    expect(componentNames).toContain('timeline_urgency');
    expect(componentNames).toContain('decision_maker_access');
    expect(componentNames).toContain('pain_severity');
    expect(componentNames).toContain('api_readiness');
    expect(result.components.length).toBe(7);
  });
});

describe('[P0] getLeadStatus - Status Determination', () => {
  it('[P0] should return HOT for score >= 75', async () => {
    // WHEN: Getting status for high score
    const result = getLeadStatus(80);

    // THEN: Should be HOT
    expect(result.status).toBe('hot');
    expect(result.label).toBe('HOT LEAD');
  });

  it('[P0] should return WARM for score 50-74', async () => {
    // WHEN: Getting status for medium score
    const result = getLeadStatus(60);

    // THEN: Should be WARM
    expect(result.status).toBe('warm');
    expect(result.label).toBe('WARM LEAD');
  });

  it('[P0] should return COLD for score < 50', async () => {
    // WHEN: Getting status for low score
    const result = getLeadStatus(30);

    // THEN: Should be COLD
    expect(result.status).toBe('cold');
    expect(result.label).toBe('NEEDS DISCOVERY');
  });

  it('[P1] should respect custom thresholds', async () => {
    // GIVEN: Custom thresholds
    const thresholds = { hot: 90, warm: 70 };

    // WHEN: Getting status
    const result75 = getLeadStatus(75, thresholds);
    const result85 = getLeadStatus(85, thresholds);
    const result95 = getLeadStatus(95, thresholds);

    // THEN: Should use custom thresholds
    expect(result75.status).toBe('warm');
    expect(result85.status).toBe('warm');
    expect(result95.status).toBe('hot');
  });
});

describe('[P1] Voice Agent Parity - current_solution Scoring', () => {
  it('[P1] should score personal_cell as HOT signal (highest pain)', async () => {
    // GIVEN: Form data with personal_cell current_solution
    // Aligned with Voice Agent: "So you're getting woken up for non-emergencies"
    const formData = {
      current_solution: 'personal_cell',
      q06_runs_per_period: 10,
      q06_period_unit: 'week',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Pain severity should be boosted
    const painComponent = result.components.find((c: any) => c.name === 'pain_severity');
    expect(painComponent).toBeDefined();
    expect(painComponent.raw_score).toBeGreaterThanOrEqual(75); // 50 base + 25 from personal_cell
  });

  it('[P1] should score voicemail as HOT signal (losing customers)', async () => {
    // GIVEN: Form data with voicemail current_solution
    // Aligned with Voice Agent: "So some of those emergency calls are going to competitors"
    const formData = {
      current_solution: 'voicemail',
      q06_runs_per_period: 10,
      q06_period_unit: 'week',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Pain severity should be boosted
    const painComponent = result.components.find((c: any) => c.name === 'pain_severity');
    expect(painComponent).toBeDefined();
    expect(painComponent.raw_score).toBeGreaterThanOrEqual(70); // 50 base + 20 from voicemail
  });

  it('[P1] should score answering_service as WARM signal', async () => {
    // GIVEN: Form data with answering_service current_solution
    // Aligned with Voice Agent: "What are you paying for that, around 2 grand a month?"
    const formData = {
      current_solution: 'answering_service',
      q06_runs_per_period: 10,
      q06_period_unit: 'week',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Pain severity should have moderate boost
    const painComponent = result.components.find((c: any) => c.name === 'pain_severity');
    expect(painComponent).toBeDefined();
    expect(painComponent.raw_score).toBeGreaterThanOrEqual(60); // 50 base + 10 from answering_service
  });

  it('[P1] should handle missing current_solution gracefully', async () => {
    // GIVEN: Form data without current_solution
    const formData = {
      q06_runs_per_period: 10,
      q06_period_unit: 'week',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Pain severity should have base score only
    const painComponent = result.components.find((c: any) => c.name === 'pain_severity');
    expect(painComponent).toBeDefined();
    expect(painComponent.raw_score).toBe(50); // Base score only
  });
});

describe('[P1] Volume Scoring - Voice Agent Alignment', () => {
  it('[P1] should score high volume (>=100/month) as HOT', async () => {
    // GIVEN: High volume (Voice Agent: >=20/week is HOT)
    // 100/month ≈ 25/week
    const formData = {
      q06_runs_per_period: 100,
      q06_period_unit: 'month',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Volume component should be high
    const volumeComponent = result.components.find((c: any) => c.name === 'volume_potential');
    expect(volumeComponent).toBeDefined();
    expect(volumeComponent.raw_score).toBeGreaterThanOrEqual(70);
  });

  it('[P1] should score low volume (<20/month) as COLD', async () => {
    // GIVEN: Low volume (Voice Agent: <5/week is COLD)
    // 10/month ≈ 2.5/week
    const formData = {
      q06_runs_per_period: 10,
      q06_period_unit: 'month',
    };
    const config = {};

    // WHEN: Calculating score
    const result = calculateLeadScore(formData, config);

    // THEN: Volume component should be low
    const volumeComponent = result.components.find((c: any) => c.name === 'volume_potential');
    expect(volumeComponent).toBeDefined();
    expect(volumeComponent.raw_score).toBeLessThanOrEqual(40);
  });
});

describe('[P1] getCompanyProfile - Profile Extraction', () => {
  it('[P1] should extract company profile from form data', async () => {
    // GIVEN: Complete form data
    const formData = {
      q01_account_name: 'Acme Corp',
      q02_contact_name: 'John Smith',
      q03_contact_title: 'Operations Manager',
      q04_contact_email: 'john@acme.com',
      q05_contact_phone: '555-1234',
      q25_industry: 'healthcare',
      q06_workflow_name: 'Patient Intake',
      q06_runs_per_period: 50,
      q06_period_unit: 'day',
      q10_systems_involved: ['salesforce', 'slack'],
    };

    // WHEN: Getting company profile
    const result = getCompanyProfile(formData);

    // THEN: Profile should have all fields
    expect(result.account_name).toBe('Acme Corp');
    expect(result.contact_name).toBe('John Smith');
    expect(result.contact_title).toBe('Operations Manager');
    expect(result.industry).toBe('healthcare');
    expect(result.systems_involved).toEqual(['salesforce', 'slack']);
  });

  it('[P1] should handle missing optional fields gracefully', async () => {
    // GIVEN: Minimal form data
    const formData = {
      q01_account_name: 'Test Co',
    };

    // WHEN: Getting company profile
    const result = getCompanyProfile(formData);

    // THEN: Should have defaults for missing fields
    expect(result.account_name).toBe('Test Co');
    expect(result.contact_name).toBeNull();
    expect(result.systems_involved).toEqual([]);
  });
});

describe('[P1] getKeyMetrics - Metrics Dashboard', () => {
  it('[P1] should calculate key metrics from qualification', async () => {
    // GIVEN: Form data and qualification result
    const formData = {
      q10_systems_involved: ['salesforce', 'hubspot', 'slack', 'stripe'],
    };
    const qualification = {
      components: [
        { name: 'integration_complexity', raw_score: 60 },
        { name: 'volume_potential', raw_score: 80 },
      ],
    };

    // WHEN: Getting key metrics
    const result = getKeyMetrics(formData, qualification);

    // THEN: Should have all metrics
    expect(result.systems_count).toBe(4);
    expect(result.complexity_score).toBeDefined();
    expect(result.risk_level).toMatch(/low|medium|high/);
    expect(result.roi_potential).toMatch(/low|medium|high/);
  });
});
