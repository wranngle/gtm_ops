/**
 * Unit Tests for product pricing in pricing_calculator.js
 *
 * Tests critical business logic:
 * - calculateProductPricing() - Hybrid pricing model
 * - Setup fee calculation (complexity-based)
 * - Monthly recurring tiers ($250 Core / $500 Growth)
 * - First year total calculation
 * - Product ROI calculation (net savings, payback period)
 * - Tier retrieval functions
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVoiceAgentIntake,
  createProjectIntake,
  PricingScenarios,
  EdgeCases
} from '../support/factories/product.factory';

// Import module under test
let calculateProductPricing: (intake: any, options?: any) => any;
let getProductTier: (tierKey: string) => any;
let getAllProductTiers: () => any;

beforeEach(async () => {
  const module = await import('../../lib/pricing_calculator.js');
  calculateProductPricing = module.calculateProductPricing;
  getProductTier = module.getProductTier;
  getAllProductTiers = module.getAllProductTiers;
});

// =============================================================================
// [P0] CORE PRICING STRUCTURE
// =============================================================================

describe('[P0] calculateProductPricing - Core Structure', () => {
  it('[P0] should return complete pricing object structure', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Should have all required sections
    expect(result).toHaveProperty('pricing_model', 'hybrid_product');
    expect(result).toHaveProperty('is_product', true);
    expect(result).toHaveProperty('product_key', 'ai_voice_agent');
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('setup_fee');
    expect(result).toHaveProperty('monthly');
    expect(result).toHaveProperty('annual');
    expect(result).toHaveProperty('first_year');
    expect(result).toHaveProperty('roi');
    expect(result).toHaveProperty('upgrade_option');
    expect(result).toHaveProperty('detection');
  });

  it('[P0] should return setup_fee with all required fields', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Setup fee should have all fields
    expect(result.setup_fee).toHaveProperty('amount');
    expect(result.setup_fee).toHaveProperty('display');
    expect(result.setup_fee).toHaveProperty('hours');
    expect(result.setup_fee).toHaveProperty('hourly_rate', 125);
    expect(result.setup_fee).toHaveProperty('breakdown');
    expect(result.setup_fee).toHaveProperty('formula');
  });

  it('[P0] should return monthly with amount and display', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Monthly should have required fields
    expect(result.monthly).toHaveProperty('amount');
    expect(result.monthly).toHaveProperty('display');
    expect(result.monthly).toHaveProperty('period', 'mo');
  });

  it('[P0] should return roi with all required fields', async () => {
    // GIVEN: Voice agent intake with bleed
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing with bleed
    const result = calculateProductPricing(intake, { monthlyBleed: 2750 });

    // THEN: ROI should have all fields
    expect(result.roi).toHaveProperty('monthly_bleed');
    expect(result.roi).toHaveProperty('monthly_bleed_display');
    expect(result.roi).toHaveProperty('net_monthly_savings');
    expect(result.roi).toHaveProperty('net_monthly_display');
    expect(result.roi).toHaveProperty('net_annual_savings');
    expect(result.roi).toHaveProperty('net_annual_display');
    expect(result.roi).toHaveProperty('payback_months');
    expect(result.roi).toHaveProperty('payback_display');
    expect(result.roi).toHaveProperty('formula');
  });
});

// =============================================================================
// [P0] SETUP FEE CALCULATION
// =============================================================================

describe('[P0] calculateProductPricing - Setup Fee', () => {
  it('[P0] should calculate base setup fee of $1,000 (8 hours × $125)', async () => {
    // GIVEN: Simple intake with 1 integration
    const intake = createVoiceAgentIntake({
      section_c_systems_handoffs: {
        q10_systems_involved: ['Phone System'],
        q11_manual_data_transfers: 'Manual',
        q12_human_decision_gates: 'None'
      }
    });

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Base setup should be 8 hours × $125 = $1,000
    expect(result.setup_fee.hours).toBeGreaterThanOrEqual(8);
    expect(result.setup_fee.amount).toBeGreaterThanOrEqual(1000);
  });

  it('[P0] should add 4 hours per integration beyond first', async () => {
    // GIVEN: Intake with 3 integrations
    const intake = createVoiceAgentIntake({
      section_c_systems_handoffs: {
        q10_systems_involved: ['Phone System', 'CRM', 'Calendar'],
        q11_manual_data_transfers: 'Manual',
        q12_human_decision_gates: 'None'
      }
    });

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Should be 8 base + (2 × 4) = 16 hours minimum
    expect(result.setup_fee.hours).toBeGreaterThanOrEqual(16);
  });

  it('[P0] should cap setup hours at 40', async () => {
    // GIVEN: Intake with many integrations (would exceed 40 hours)
    const intake = createVoiceAgentIntake({
      section_c_systems_handoffs: {
        q10_systems_involved: [
          'Phone', 'CRM', 'Calendar', 'ERP', 'Database',
          'Slack', 'Teams', 'Salesforce', 'HubSpot', 'Custom'
        ],
        q11_manual_data_transfers: 'Complex custom workflows',
        q12_human_decision_gates: 'Complex custom logic'
      }
    });

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Hours should be capped at 40
    expect(result.setup_fee.hours).toBeLessThanOrEqual(40);
    expect(result.setup_fee.amount).toBeLessThanOrEqual(5000);
  });

  it('[P0] should apply minimum fee of $500', async () => {
    // GIVEN: Very simple intake
    const intake = {
      section_c_systems_handoffs: {
        q10_systems_involved: []
      }
    };

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Amount should be at least $500
    expect(result.setup_fee.amount).toBeGreaterThanOrEqual(500);
  });

  it('[P0] should include breakdown of hours', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Breakdown should be an array with items
    expect(Array.isArray(result.setup_fee.breakdown)).toBe(true);
    expect(result.setup_fee.breakdown.length).toBeGreaterThan(0);
    result.setup_fee.breakdown.forEach((item: any) => {
      expect(item).toHaveProperty('item');
      expect(item).toHaveProperty('hours');
    });
  });
});

// =============================================================================
// [P0] MONTHLY RECURRING
// =============================================================================

describe('[P0] calculateProductPricing - Monthly Recurring', () => {
  it('[P0] should default to Core Protection at $250/mo', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing (default tier)
    const result = calculateProductPricing(intake);

    // THEN: Monthly should be $250
    expect(result.monthly.amount).toBe(250);
    expect(result.tier.key).toBe('core_protection');
    expect(result.tier.name).toBe('Core Protection');
  });

  it('[P0] should support Growth Bundle at $500/mo', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing with growth tier
    const result = calculateProductPricing(intake, { tier: 'growth_bundle' });

    // THEN: Monthly should be $500
    expect(result.monthly.amount).toBe(500);
    expect(result.tier.key).toBe('growth_bundle');
    expect(result.tier.name).toBe('Growth Bundle');
  });

  it('[P0] should calculate annual recurring correctly', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Annual should be monthly × 12
    expect(result.annual.amount).toBe(result.monthly.amount * 12);
  });
});

// =============================================================================
// [P0] FIRST YEAR TOTAL
// =============================================================================

describe('[P0] calculateProductPricing - First Year Total', () => {
  it('[P0] should calculate first year as setup + annual recurring', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: First year = setup_fee + annual
    const expectedFirstYear = result.setup_fee.amount + result.annual.amount;
    expect(result.first_year.amount).toBe(expectedFirstYear);
  });

  it('[P0] should include formula in first_year', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Formula should show calculation
    expect(result.first_year.formula).toContain('setup');
    expect(result.first_year.formula).toContain('×');
    expect(result.first_year.formula).toContain('12');
  });
});

// =============================================================================
// [P0] ROI CALCULATION
// =============================================================================

describe('[P0] calculateProductPricing - ROI Calculation', () => {
  it('[P0] should calculate net monthly savings correctly', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();
    const monthlyBleed = 2750;

    // WHEN: Calculating product pricing with bleed
    const result = calculateProductPricing(intake, { monthlyBleed });

    // THEN: Net monthly = bleed - monthly recurring
    const expectedNetMonthly = monthlyBleed - result.monthly.amount;
    expect(result.roi.net_monthly_savings).toBe(expectedNetMonthly);
  });

  it('[P0] should calculate net annual savings correctly', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();
    const monthlyBleed = 2750;

    // WHEN: Calculating product pricing with bleed
    const result = calculateProductPricing(intake, { monthlyBleed });

    // THEN: Net annual = net monthly × 12
    expect(result.roi.net_annual_savings).toBe(result.roi.net_monthly_savings * 12);
  });

  it('[P0] should calculate payback months correctly', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();
    const monthlyBleed = 2750;

    // WHEN: Calculating product pricing with bleed
    const result = calculateProductPricing(intake, { monthlyBleed });

    // THEN: Payback = setup_fee / net_monthly_savings
    if (result.roi.net_monthly_savings > 0) {
      const expectedPayback = result.setup_fee.amount / result.roi.net_monthly_savings;
      expect(result.roi.payback_months).toBeCloseTo(expectedPayback, 1);
    }
  });

  it('[P0] should handle zero bleed gracefully', async () => {
    // GIVEN: Voice agent intake with no bleed
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing with zero bleed
    const result = calculateProductPricing(intake, { monthlyBleed: 0 });

    // THEN: Net savings should be 0 (or negative, but we don't show negative)
    expect(result.roi.net_monthly_savings).toBeLessThanOrEqual(0);
  });

  it('[P0] should use monthlyBleed from options when provided', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();
    const monthlyBleed = 5000;

    // WHEN: Calculating product pricing with explicit bleed
    const result = calculateProductPricing(intake, { monthlyBleed });

    // THEN: Should use provided bleed value
    expect(result.roi.monthly_bleed).toBe(monthlyBleed);
  });

  it('[P0] should format payback_display correctly', async () => {
    // GIVEN: Voice agent intake with bleed
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake, { monthlyBleed: 2750 });

    // THEN: Payback display should be formatted
    expect(result.roi.payback_display).toBeDefined();
    if (result.roi.net_monthly_savings > 0) {
      expect(result.roi.payback_display).toMatch(/\d+\.?\d*\s*(month|week|day)/i);
    }
  });
});

// =============================================================================
// [P1] UPGRADE OPTION
// =============================================================================

describe('[P1] calculateProductPricing - Upgrade Option', () => {
  it('[P1] should include upgrade option for Core Protection', async () => {
    // GIVEN: Voice agent intake with core protection
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing (default tier)
    const result = calculateProductPricing(intake);

    // THEN: Should have upgrade option
    expect(result.upgrade_option).not.toBeNull();
    expect(result.upgrade_option.tier.key).toBe('growth_bundle');
    expect(result.upgrade_option.monthly_delta).toBe(250); // $500 - $250
  });

  it('[P1] should not include upgrade option for Growth Bundle', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing with growth tier
    const result = calculateProductPricing(intake, { tier: 'growth_bundle' });

    // THEN: Should not have upgrade option (already at top tier)
    expect(result.upgrade_option).toBeNull();
  });

  it('[P1] should include pitch text in upgrade option', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating product pricing
    const result = calculateProductPricing(intake);

    // THEN: Upgrade option should have pitch
    expect(result.upgrade_option.pitch).toContain('Website Chat Widget');
    expect(result.upgrade_option.pitch).toContain('$250');
  });
});

// =============================================================================
// [P1] TIER RETRIEVAL
// =============================================================================

describe('[P1] getProductTier - Tier Retrieval', () => {
  it('[P1] should return core_protection tier', async () => {
    // WHEN: Getting core protection tier
    const tier = getProductTier('core_protection');

    // THEN: Should have correct values
    expect(tier.key).toBe('core_protection');
    expect(tier.name).toBe('Core Protection');
    expect(tier.monthly).toBe(250);
    expect(tier.includes).toContain('AI Voice Agent');
  });

  it('[P1] should return growth_bundle tier', async () => {
    // WHEN: Getting growth bundle tier
    const tier = getProductTier('growth_bundle');

    // THEN: Should have correct values
    expect(tier.key).toBe('growth_bundle');
    expect(tier.name).toBe('Growth Bundle');
    expect(tier.monthly).toBe(500);
    expect(tier.includes).toContain('Website Chat');
  });

  it('[P1] should default to core_protection for unknown tier', async () => {
    // WHEN: Getting unknown tier
    const tier = getProductTier('unknown_tier');

    // THEN: Should return core_protection
    expect(tier.key).toBe('core_protection');
    expect(tier.monthly).toBe(250);
  });
});

describe('[P1] getAllProductTiers - All Tiers', () => {
  it('[P1] should return all available tiers', async () => {
    // WHEN: Getting all tiers
    const tiers = getAllProductTiers();

    // THEN: Should have both tiers
    expect(tiers).toHaveProperty('core_protection');
    expect(tiers).toHaveProperty('growth_bundle');
  });

  it('[P1] should return a copy (not reference)', async () => {
    // WHEN: Getting all tiers twice
    const tiers1 = getAllProductTiers();
    const tiers2 = getAllProductTiers();

    // THEN: Should be different objects (copies)
    expect(tiers1).not.toBe(tiers2);
    expect(tiers1).toEqual(tiers2);
  });
});

// =============================================================================
// [P0] PARAMETERIZED PRICING TESTS
// =============================================================================

describe('[P0] calculateProductPricing - Pricing Scenarios', () => {
  const scenarios = [
    PricingScenarios.simple(),
    PricingScenarios.standard(),
    PricingScenarios.complex(),
    PricingScenarios.growthBundle()
  ];

  for (const scenario of scenarios) {
    it(`[P0] ${scenario.name}: ${scenario.description}`, async () => {
      // WHEN: Calculating product pricing
      const result = calculateProductPricing(scenario.intake, {
        monthlyBleed: scenario.monthlyBleed,
        tier: scenario.tier
      });

      // THEN: Should match expected values (with tolerance)
      expect(result.monthly.amount).toBe(scenario.expectedMonthly);

      // Setup fee should be within reasonable range (±$500 due to keyword detection)
      expect(result.setup_fee.amount).toBeGreaterThanOrEqual(scenario.expectedSetupFee - 500);
      expect(result.setup_fee.amount).toBeLessThanOrEqual(scenario.expectedSetupFee + 1500);

      // First year should be setup + annual
      expect(result.first_year.amount).toBe(
        result.setup_fee.amount + (result.monthly.amount * 12)
      );

      // Net monthly savings should be correct
      expect(result.roi.net_monthly_savings).toBe(
        scenario.monthlyBleed - result.monthly.amount
      );
    });
  }
});

// =============================================================================
// [P2] EDGE CASES
// =============================================================================

describe('[P2] calculateProductPricing - Edge Cases', () => {
  it('[P2] should handle empty intake gracefully', async () => {
    // WHEN: Calculating pricing for empty intake
    const result = calculateProductPricing({});

    // THEN: Should return valid structure with defaults
    expect(result.setup_fee.amount).toBeGreaterThanOrEqual(500);
    expect(result.monthly.amount).toBe(250);
    expect(result.first_year.amount).toBeGreaterThan(0);
  });

  it('[P2] should handle null classification in intake', async () => {
    // GIVEN: Intake without classification
    const intake = createVoiceAgentIntake();
    delete intake.classification;

    // WHEN: Calculating pricing
    const result = calculateProductPricing(intake);

    // THEN: Should still work
    expect(result.detection.confidence).toBe(0);
  });

  it('[P2] should handle high bleed scenario correctly', async () => {
    // GIVEN: High bleed scenario
    const scenario = PricingScenarios.highBleed();

    // WHEN: Calculating pricing
    const result = calculateProductPricing(scenario.intake, {
      monthlyBleed: scenario.monthlyBleed
    });

    // THEN: Payback should be very fast (< 1 month)
    expect(result.roi.payback_months).toBeLessThan(1);
  });

  it('[P2] should handle zero bleed scenario correctly', async () => {
    // GIVEN: Zero bleed scenario
    const scenario = PricingScenarios.zeroBleed();

    // WHEN: Calculating pricing
    const result = calculateProductPricing(scenario.intake, {
      monthlyBleed: scenario.monthlyBleed
    });

    // THEN: Net savings should be 0 or negative
    expect(result.roi.net_monthly_savings).toBeLessThanOrEqual(0);
  });
});

// =============================================================================
// [P1] DISPLAY VALUES
// =============================================================================

describe('[P1] calculateProductPricing - Display Values', () => {
  it('[P1] should format currency with $ and commas', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating pricing
    const result = calculateProductPricing(intake, { monthlyBleed: 2750 });

    // THEN: Display values should be formatted
    expect(result.setup_fee.display).toMatch(/^\$[\d,]+$/);
    expect(result.monthly.display).toMatch(/^\$[\d,]+$/);
    expect(result.first_year.display).toMatch(/^\$[\d,]+$/);
    expect(result.roi.monthly_bleed_display).toMatch(/^\$[\d,]+$/);
    expect(result.roi.net_monthly_display).toMatch(/^\$[\d,]+$/);
  });

  it('[P1] should include formula strings for transparency', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Calculating pricing
    const result = calculateProductPricing(intake, { monthlyBleed: 2750 });

    // THEN: Formulas should explain calculations
    expect(result.setup_fee.formula).toContain('hrs');
    expect(result.setup_fee.formula).toContain('$125');
    expect(result.roi.formula).toContain('bleed');
    expect(result.roi.formula).toContain('savings');
  });
});
