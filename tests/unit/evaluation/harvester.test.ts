/**
 * Harvester Tests - Verify case study harvesting functions
 *
 * Tests detectVendor, validateExtraction, suggestImprovements
 *
 * @priority P0 - Critical for evaluation corpus population
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock corpus to avoid DB calls
vi.mock('../../../lib/evaluation/corpus.js', () => ({
  createCaseStudy: vi.fn(),
  getCaseStudyById: vi.fn(),
}));

import {
  detectVendor,
  validateExtraction,
  suggestImprovements,
} from '../../../lib/evaluation/harvester.js';

describe('Harvester', () => {
  describe('detectVendor', () => {
    describe('Known vendors', () => {
      it('[P0] detects vapi.ai', () => {
        expect(detectVendor('https://vapi.ai/case-studies/dental')).toBe('vapi');
        expect(detectVendor('https://www.vapi.ai/customers')).toBe('vapi');
      });

      it('[P0] detects retell.ai', () => {
        expect(detectVendor('https://retellai.com/case-studies/insurance')).toBe('retell');
        expect(detectVendor('https://www.retell.ai/customers')).toBe('retell');
      });

      it('[P0] detects bland.ai', () => {
        expect(detectVendor('https://bland.ai/case-studies/real-estate')).toBe('bland');
      });

      it('[P1] detects synthflow.ai', () => {
        expect(detectVendor('https://synthflow.ai/cases')).toBe('synthflow');
      });

      it('[P1] detects air.ai', () => {
        expect(detectVendor('https://air.ai/testimonials')).toBe('air');
      });

      it('[P1] detects play.ht', () => {
        expect(detectVendor('https://play.ht/case-study')).toBe('playht');
        expect(detectVendor('https://playht.com/customers')).toBe('playht');
      });

      it('[P1] detects voiceflow.com', () => {
        expect(detectVendor('https://voiceflow.com/case-studies')).toBe('voiceflow');
      });

      it('[P1] detects elevenlabs.io', () => {
        expect(detectVendor('https://elevenlabs.io/customers')).toBe('elevenlabs');
      });
    });

    describe('Unknown vendors', () => {
      it('[P0] returns "other" for unknown domains', () => {
        expect(detectVendor('https://example.com/case-study')).toBe('other');
        expect(detectVendor('https://someagent.io/testimonials')).toBe('other');
      });

      it('[P1] handles case insensitivity', () => {
        expect(detectVendor('https://VAPI.AI/case-studies')).toBe('vapi');
        expect(detectVendor('https://Bland.AI/customers')).toBe('bland');
      });

      it('[P1] handles URLs with query params', () => {
        expect(detectVendor('https://vapi.ai/case-studies?id=123')).toBe('vapi');
      });
    });
  });

  describe('validateExtraction', () => {
    const validCaseStudy = {
      problem: {
        industry: 'dental',
        company_size: 'small',
        company_type: 'dental practice',
        pain_points: ['High no-show rate', 'Manual scheduling'],
        goals: ['Reduce no-shows', 'Automate scheduling'],
        systems_involved: ['Dentrix', 'Google Calendar'],
      },
      solution: {
        agent_type: 'inbound',
        integrations: [{ system_name: 'Dentrix', integration_type: 'api' }],
        key_features: ['appointment scheduling', 'sms reminders'],
        inferred_tier: 'standard',
      },
      meta: {
        quality_score: 4,
        quality_notes: 'Good detail',
        domain_tags: ['dental', 'scheduling'],
      },
    };

    it('[P0] returns valid for complete case study', () => {
      const result = validateExtraction(validCaseStudy);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('[P0] detects missing industry', () => {
      const caseStudy = {
        ...validCaseStudy,
        problem: { ...validCaseStudy.problem, industry: null },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing or invalid industry');
    });

    it('[P0] detects MANUAL_ENTRY_REQUIRED as invalid', () => {
      const caseStudy = {
        ...validCaseStudy,
        problem: { ...validCaseStudy.problem, industry: 'MANUAL_ENTRY_REQUIRED' },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing or invalid industry');
    });

    it('[P0] detects missing pain points', () => {
      const caseStudy = {
        ...validCaseStudy,
        problem: { ...validCaseStudy.problem, pain_points: [] },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No pain points extracted');
    });

    it('[P0] detects missing goals', () => {
      const caseStudy = {
        ...validCaseStudy,
        problem: { ...validCaseStudy.problem, goals: [] },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No goals extracted');
    });

    it('[P1] detects missing agent type', () => {
      const caseStudy = {
        ...validCaseStudy,
        solution: { ...validCaseStudy.solution, agent_type: null },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing agent type');
    });

    it('[P1] detects missing key features', () => {
      const caseStudy = {
        ...validCaseStudy,
        solution: { ...validCaseStudy.solution, key_features: [] },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No key features extracted');
    });

    it('[P1] detects invalid quality score', () => {
      const caseStudy = {
        ...validCaseStudy,
        meta: { ...validCaseStudy.meta, quality_score: 10 },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid quality score');
    });

    it('[P1] detects quality score < 1', () => {
      const caseStudy = {
        ...validCaseStudy,
        meta: { ...validCaseStudy.meta, quality_score: 0 },
      };

      const result = validateExtraction(caseStudy);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid quality score');
    });

    it('[P1] returns quality score from meta', () => {
      const result = validateExtraction(validCaseStudy);

      expect(result.quality_score).toBe(4);
    });
  });

  describe('suggestImprovements', () => {
    const minimalCaseStudy = {
      problem: {
        industry: 'dental',
        pain_points: ['High no-show rate'],
        goals: ['Reduce no-shows'],
        volume_metrics: {},
      },
      solution: {
        agent_type: 'inbound',
        key_features: ['scheduling'],
        pricing_model: {},
        roi_achieved: {},
      },
      meta: {
        quality_score: 2,
      },
    };

    it('[P0] suggests adding volume metrics for low quality', () => {
      const suggestions = suggestImprovements(minimalCaseStudy);

      expect(suggestions.some((s) => s.includes('volume metrics'))).toBe(true);
    });

    it('[P0] suggests adding pricing for low quality', () => {
      const suggestions = suggestImprovements(minimalCaseStudy);

      expect(suggestions.some((s) => s.includes('pricing'))).toBe(true);
    });

    it('[P0] suggests adding ROI for low quality', () => {
      const suggestions = suggestImprovements(minimalCaseStudy);

      expect(suggestions.some((s) => s.includes('ROI'))).toBe(true);
    });

    it('[P1] includes validation issues as fixes', () => {
      const invalidCaseStudy = {
        problem: { industry: null, pain_points: [], goals: [] },
        solution: { agent_type: null, key_features: [] },
        meta: { quality_score: 1 },
      };

      const suggestions = suggestImprovements(invalidCaseStudy);

      expect(suggestions.some((s) => s.startsWith('Fix:'))).toBe(true);
    });

    it('[P1] returns empty array for high quality case study', () => {
      const highQualityCaseStudy = {
        problem: {
          industry: 'dental',
          pain_points: ['High no-show rate'],
          goals: ['Reduce no-shows'],
          volume_metrics: { calls_per_month: 1500 },
        },
        solution: {
          agent_type: 'inbound',
          key_features: ['scheduling', 'reminders'],
          pricing_model: { total_cost: 5000 },
          roi_achieved: { monthly_savings: 2000 },
        },
        meta: {
          quality_score: 5,
        },
      };

      const suggestions = suggestImprovements(highQualityCaseStudy);

      // No quality suggestions for score >= 3
      expect(suggestions.filter((s) => !s.startsWith('Fix:')).length).toBe(0);
    });
  });
});
