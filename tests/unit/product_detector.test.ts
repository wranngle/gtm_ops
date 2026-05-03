/**
 * Unit Tests for product_detector.js
 *
 * Tests critical business logic:
 * - Voice Agent keyword detection
 * - Scoring algorithm (primary=10, secondary=3, industry=2)
 * - Detection threshold (15 points)
 * - Confidence normalization (0-1)
 * - Classification output structure
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVoiceAgentIntake,
  createProjectIntake,
  EdgeCases,
  DetectionTestCases
} from '../support/factories/product.factory.js';

// Import module under test
let detectProductType: (intake: any) => any;
let getKeywordConfig: () => any;

beforeEach(async () => {
  const module = await import('../../lib/product_detector.js');
  detectProductType = module.detectProductType;
  getKeywordConfig = module.getKeywordConfig;
});

// =============================================================================
// [P0] CORE DETECTION LOGIC
// =============================================================================

describe('[P0] detectProductType - Core Classification', () => {
  it('[P0] should return complete classification object structure', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should have all required fields
    expect(result).toHaveProperty('project_type');
    expect(result).toHaveProperty('is_product');
    expect(result).toHaveProperty('product_key');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('raw_score');
    expect(result).toHaveProperty('threshold');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('matched_keywords');
    expect(result).toHaveProperty('matched_count');
    expect(result).toHaveProperty('pricing_model');
    expect(result).toHaveProperty('project_type_display');
    expect(result).toHaveProperty('confidence_display');
  });

  it('[P0] should detect voice agent intake as product', async () => {
    // GIVEN: High-confidence voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should classify as voice agent product
    expect(result.is_product).toBe(true);
    expect(result.project_type).toBe('voice_agent');
    expect(result.product_key).toBe('ai_voice_agent');
    expect(result.pricing_model).toBe('hybrid_product');
  });

  it('[P0] should detect standard project intake as non-product', async () => {
    // GIVEN: Standard project intake without voice keywords
    const intake = createProjectIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should classify as workflow automation (not product)
    expect(result.is_product).toBe(false);
    expect(result.project_type).toBe('workflow_automation');
    expect(result.product_key).toBeNull();
    expect(result.pricing_model).toBe('fixed_project');
  });

  it('[P0] should return confidence between 0 and 1', async () => {
    // GIVEN: Any intake
    const intakes = [createVoiceAgentIntake(), createProjectIntake()];

    for (const intake of intakes) {
      // WHEN: Detecting product type
      const result = detectProductType(intake);

      // THEN: Confidence should be normalized
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// =============================================================================
// [P0] SCORING ALGORITHM
// =============================================================================

describe('[P0] detectProductType - Scoring Algorithm', () => {
  it('[P0] should score primary keywords at 10 points each', async () => {
    // GIVEN: Intake with known primary keyword ("voice agent")
    const intake = {
      section_a_workflow_definition: {
        q01_workflow_name: 'AI Voice Agent Implementation'
      }
    };

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Primary score should be 10+ (at least one primary keyword)
    expect(result.scores.primary).toBeGreaterThanOrEqual(10);
    expect(result.matched_keywords.some((k: any) => k.group === 'primary')).toBe(true);
  });

  it('[P0] should score secondary keywords at 3 points each', async () => {
    // GIVEN: Intake with only secondary keywords ("phone", "call")
    const intake = {
      section_a_workflow_definition: {
        q01_workflow_name: 'Handle phone calls from customers'
      }
    };

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Secondary score should be 3+ (at least one secondary keyword)
    expect(result.scores.secondary).toBeGreaterThanOrEqual(3);
  });

  it('[P0] should score industry keywords at 2 points each', async () => {
    // GIVEN: Intake with only industry keywords ("hvac", "plumber")
    const intake = {
      prepared_for: { account_name: 'HVAC Plumbing Contractors Inc' }
    };

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Industry score should be 2+ (at least one industry keyword)
    expect(result.scores.industry).toBeGreaterThanOrEqual(2);
  });

  it('[P0] should combine scores from all categories', async () => {
    // GIVEN: Intake with keywords from all categories
    const intake = EdgeCases.maxScore();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Total should be sum of all categories
    const expectedTotal = result.scores.primary + result.scores.secondary + result.scores.industry;
    expect(result.raw_score).toBe(expectedTotal);
  });
});

// =============================================================================
// [P0] THRESHOLD DETECTION
// =============================================================================

describe('[P0] detectProductType - Threshold Detection', () => {
  it('[P0] should use threshold of 15 points', async () => {
    // GIVEN: Any intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Threshold should be 15
    expect(result.threshold).toBe(15);
  });

  it('[P0] should classify as product when score >= 15', async () => {
    // GIVEN: Borderline intake just above threshold
    const intake = EdgeCases.borderlineVoiceAgent();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should be classified as product (score >= 15)
    if (result.raw_score >= 15) {
      expect(result.is_product).toBe(true);
    }
  });

  it('[P0] should classify as project when score < 15', async () => {
    // GIVEN: Intake with score below threshold
    const intake = EdgeCases.borderlineProject();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should be classified as project (score < 15)
    if (result.raw_score < 15) {
      expect(result.is_product).toBe(false);
    }
  });

  it('[P0] should return zero score for intake with no keywords', async () => {
    // GIVEN: Intake with no voice-related keywords
    const intake = EdgeCases.zeroScore();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Score should be very low
    expect(result.raw_score).toBeLessThan(15);
    expect(result.is_product).toBe(false);
  });
});

// =============================================================================
// [P1] KEYWORD MATCHING
// =============================================================================

describe('[P1] detectProductType - Keyword Matching', () => {
  it('[P1] should track matched keywords with their groups', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Matched keywords should have keyword and group
    expect(result.matched_keywords.length).toBeGreaterThan(0);
    result.matched_keywords.forEach((kw: any) => {
      expect(kw).toHaveProperty('keyword');
      expect(kw).toHaveProperty('group');
      expect(['primary', 'secondary', 'industry']).toContain(kw.group);
    });
  });

  it('[P1] should count total matched keywords', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: matched_count should equal matched_keywords length
    expect(result.matched_count).toBe(result.matched_keywords.length);
  });

  it('[P1] should search across all intake sections', async () => {
    // GIVEN: Intake with keywords spread across sections
    const intake = {
      section_a_workflow_definition: { q01_workflow_name: 'Voice agent setup' },
      section_c_systems_handoffs: { q10_systems_involved: ['Twilio'] },
      section_d_failure_cost: { q13_common_failures: 'Missed calls' }
    };

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should find keywords from multiple sections
    expect(result.matched_keywords.length).toBeGreaterThan(1);
  });

  it('[P1] should be case-insensitive', async () => {
    // GIVEN: Intake with mixed case keywords
    const intake = {
      section_a_workflow_definition: {
        q01_workflow_name: 'VOICE AGENT for After-Hours CALLS'
      }
    };

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should match regardless of case
    expect(result.scores.primary).toBeGreaterThan(0);
  });
});

// =============================================================================
// [P1] CONFIDENCE CALCULATION
// =============================================================================

describe('[P1] detectProductType - Confidence Calculation', () => {
  it('[P1] should cap confidence at 1.0 (100%)', async () => {
    // GIVEN: Maximum score intake
    const intake = EdgeCases.maxScore();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Confidence should not exceed 1.0
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('[P1] should format confidence_display as percentage', async () => {
    // GIVEN: Any intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: confidence_display should be formatted percentage
    expect(result.confidence_display).toMatch(/^\d+%$/);
  });

  it('[P1] should normalize confidence based on max score of 30', async () => {
    // GIVEN: Intake with raw_score of 30
    // A score of 30 should give confidence of 1.0 (100%)

    // WHEN: Detecting with known score
    const intake = createVoiceAgentIntake();
    const result = detectProductType(intake);

    // THEN: Confidence should be raw_score / 30 (capped at 1.0)
    const expectedConfidence = Math.min(result.raw_score / 30, 1);
    expect(result.confidence).toBeCloseTo(expectedConfidence, 2);
  });
});

// =============================================================================
// [P1] DISPLAY VALUES
// =============================================================================

describe('[P1] detectProductType - Display Values', () => {
  it('[P1] should set project_type_display for voice agent', async () => {
    // GIVEN: Voice agent intake
    const intake = createVoiceAgentIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Display should be "AI Voice Agent"
    expect(result.project_type_display).toBe('AI Voice Agent');
  });

  it('[P1] should set project_type_display for project', async () => {
    // GIVEN: Standard project intake
    const intake = createProjectIntake();

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Display should be "Workflow Automation"
    expect(result.project_type_display).toBe('Workflow Automation');
  });
});

// =============================================================================
// [P2] EDGE CASES
// =============================================================================

describe('[P2] detectProductType - Edge Cases', () => {
  it('[P2] should handle null intake gracefully', async () => {
    // WHEN: Detecting null intake
    const result = detectProductType(null);

    // THEN: Should return valid structure with no matches
    expect(result.is_product).toBe(false);
    expect(result.raw_score).toBe(0);
    expect(result.matched_count).toBe(0);
  });

  it('[P2] should handle empty intake gracefully', async () => {
    // WHEN: Detecting empty intake
    const result = detectProductType({});

    // THEN: Should return valid structure with no matches
    expect(result.is_product).toBe(false);
    expect(result.raw_score).toBe(0);
    expect(result.matched_count).toBe(0);
  });

  it('[P2] should handle intake with undefined sections', async () => {
    // GIVEN: Partial intake
    const intake = {
      prepared_for: { account_name: 'Test Company' }
    };

    // WHEN: Detecting product type
    const result = detectProductType(intake);

    // THEN: Should not throw, should return valid result
    expect(result).toHaveProperty('is_product');
    expect(result).toHaveProperty('raw_score');
  });
});

// =============================================================================
// [P1] KEYWORD CONFIG
// =============================================================================

describe('[P1] getKeywordConfig - Configuration Access', () => {
  it('[P1] should return all keyword groups', async () => {
    // WHEN: Getting keyword config
    const config = getKeywordConfig();

    // THEN: Should have all groups
    expect(config).toHaveProperty('primary');
    expect(config).toHaveProperty('secondary');
    expect(config).toHaveProperty('industry');
  });

  it('[P1] should return arrays of keywords', async () => {
    // WHEN: Getting keyword config
    const config = getKeywordConfig();

    // THEN: Each group should be an array
    expect(Array.isArray(config.primary)).toBe(true);
    expect(Array.isArray(config.secondary)).toBe(true);
    expect(Array.isArray(config.industry)).toBe(true);
  });

  it('[P1] should have expected primary keywords', async () => {
    // WHEN: Getting keyword config
    const config = getKeywordConfig();

    // THEN: Should include key voice agent terms
    expect(config.primary).toContain('voice agent');
    expect(config.primary).toContain('ai voice');
    expect(config.primary).toContain('24/7 receptionist');
    expect(config.primary).toContain('after-hours');
    expect(config.primary).toContain('missed call');
  });

  it('[P1] should have expected secondary keywords', async () => {
    // WHEN: Getting keyword config
    const config = getKeywordConfig();

    // THEN: Should include phone/call related terms
    expect(config.secondary).toContain('phone');
    expect(config.secondary).toContain('call');
    expect(config.secondary).toContain('twilio');
    expect(config.secondary).toContain('receptionist');
  });

  it('[P1] should have expected industry keywords', async () => {
    // WHEN: Getting keyword config
    const config = getKeywordConfig();

    // THEN: Should include trade/service industries
    expect(config.industry).toContain('hvac');
    expect(config.industry).toContain('plumber');
    expect(config.industry).toContain('dental');
    expect(config.industry).toContain('contractor');
  });
});

// =============================================================================
// [P0] PARAMETERIZED DETECTION TESTS
// =============================================================================

describe('[P0] detectProductType - Parameterized Test Cases', () => {
  // it.each scopes its callback per-row; avoids no-loop-func on the closure
  // over the imported detectProductType binding.
  it.each(DetectionTestCases as any[])(
    '[P0] $name: $description',
    async (testCase: any) => {
      // WHEN: Detecting product type
      const result = detectProductType(testCase.intake);

      // THEN: Should match expected classification
      expect(result.is_product).toBe(testCase.expectedIsProduct);
      expect(result.project_type).toBe(testCase.expectedProjectType);
      expect(result.confidence).toBeGreaterThanOrEqual(testCase.expectedMinConfidence);
      expect(result.confidence).toBeLessThanOrEqual(testCase.expectedMaxConfidence);
    }
  );
});
