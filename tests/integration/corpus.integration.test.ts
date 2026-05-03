/**
 * Corpus CRUD Integration Tests
 *
 * Tests the database operations for case studies and evaluation runs.
 * Uses a test database to avoid affecting production data.
 *
 * @priority P0 - Critical path tests for evaluation data storage
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Import corpus module
import {
  getDb,
  closeDb,
  resetDb,
  createCaseStudy,
  getCaseStudyById,
  listCaseStudies as _listCaseStudies,
  updateCaseStudyMeta,
  deleteCaseStudy,
  getCorpusStats,
  getSourceDistribution,
  createEvaluationRun,
  updateEvaluationRun,
  getEvaluationRunById,
  listEvaluationRuns as _listEvaluationRuns,
  getEvaluationsForCaseStudy as _getEvaluationsForCaseStudy,
} from '../../lib/evaluation/corpus.js';

type CaseStudyRecord = {
  id: string;
  source: { vendor: string; url?: string };
  meta: { holdout?: boolean; quality_score?: number; [k: string]: unknown };
  problem?: Record<string, unknown>;
  solution?: Record<string, unknown>;
  [k: string]: unknown;
};
type EvaluationRunRecord = {
  id: string;
  case_study_id: string;
  pipeline_version: string;
  status?: string;
  aggregate_score?: number;
  scores?: Record<string, unknown>;
  [k: string]: unknown;
};
const listCaseStudies = async (...args: Parameters<typeof _listCaseStudies>): Promise<CaseStudyRecord[]> =>
  (await _listCaseStudies(...args)) as CaseStudyRecord[];
const listEvaluationRuns = async (...args: Parameters<typeof _listEvaluationRuns>): Promise<EvaluationRunRecord[]> =>
  (await _listEvaluationRuns(...args)) as EvaluationRunRecord[];
const getEvaluationsForCaseStudy = async (...args: Parameters<typeof _getEvaluationsForCaseStudy>): Promise<EvaluationRunRecord[]> =>
  (await _getEvaluationsForCaseStudy(...args)) as EvaluationRunRecord[];

// Test database path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '..', 'fixtures', 'test_corpus.db');

/**
 * Create a valid case study object for testing
 * Matches the CaseStudySchema in lib/schemas/case_study.schema.ts
 */
function createTestCaseStudy(overrides: Record<string, unknown> = {}) {
  const id = overrides.id || `test-case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    source: {
      vendor: (overrides.vendor as string) || 'vapi',
      url: `https://example.com/case-studies/${id}`,
    },
    problem: {
      industry: (overrides.industry as string) || 'dental',
      company_size: 'small',
      company_type: 'dental practice',
      pain_points: ['High no-show rate', 'Manual scheduling', 'Staff overwhelmed'],
      goals: ['Reduce no-show rate', 'Automate scheduling', 'Free up staff time'],
      systems_involved: ['Dentrix G7', 'Google Calendar'],
      volume_metrics: {
        calls_per_month: 1500,
        calls_per_day: 50,
        avg_call_duration_minutes: 5,
      },
    },
    solution: {
      agent_type: 'inbound',
      integrations: [
        { system_name: 'Dentrix G7', integration_type: 'api', purpose: 'scheduling' },
        { system_name: 'Google Calendar', integration_type: 'api', purpose: 'calendar sync' },
        { system_name: 'Twilio', integration_type: 'native', purpose: 'voice/sms' },
      ],
      key_features: ['appointment scheduling', 'sms reminders'],
      timeline_weeks: 4,
      inferred_tier: (overrides.tier as string) || 'standard',
      roi_achieved: {
        hours_saved_per_month: 80,
        monthly_savings: 4000,
        payback_period_months: 2,
      },
    },
    meta: {
      quality_score: (overrides.quality_score as number) || 4, // 1-5 scale
      holdout: (overrides.holdout as boolean) || false,
      domain_tags: (overrides.domain_tags as string[]) || ['dental', 'scheduling'],
    },
    ...overrides,
  };
}

describe('Corpus CRUD Integration Tests', () => {
  beforeAll(async () => {
    // Ensure test fixtures directory exists
    const fixturesDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Reset singleton and initialize test database
    resetDb();
    await getDb(TEST_DB_PATH);
  });

  afterAll(async () => {
    await closeDb();

    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('AC1: Case Study CRUD Operations', () => {
    it('[P0] creates a case study with valid data', async () => {
      const testData = createTestCaseStudy({ id: 'crud-test-001' });

      const result = await createCaseStudy(testData);

      expect(result.id).toBe('crud-test-001');
      expect(result.source.vendor).toBe('vapi');
      expect(result.problem.industry).toBe('dental');
      expect(result.solution.inferred_tier).toBe('standard');
      expect(result.harvested_at).toBeDefined();
    });

    it('[P0] retrieves case study by ID', async () => {
      const testData = createTestCaseStudy({ id: 'crud-test-002' });
      await createCaseStudy(testData);

      const retrieved = await getCaseStudyById('crud-test-002');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('crud-test-002');
      expect(retrieved!.source.vendor).toBe('vapi');
      expect(retrieved!.problem.company_type).toBe('dental practice');
    });

    it('[P0] returns null for non-existent ID', async () => {
      const retrieved = await getCaseStudyById('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('[P0] lists all case studies', async () => {
      // Create multiple case studies
      await createCaseStudy(createTestCaseStudy({ id: 'list-test-001', vendor: 'vapi' }));
      await createCaseStudy(createTestCaseStudy({ id: 'list-test-002', vendor: 'retell' }));
      await createCaseStudy(createTestCaseStudy({ id: 'list-test-003', vendor: 'bland' }));

      const caseStudies = await listCaseStudies();

      expect(caseStudies.length).toBeGreaterThanOrEqual(3);
    });

    it('[P0] filters case studies by vendor', async () => {
      await createCaseStudy(createTestCaseStudy({ id: 'filter-vendor-001', vendor: 'retell' }));

      const retellCases = await listCaseStudies({ vendor: 'retell' });

      expect(retellCases.length).toBeGreaterThanOrEqual(1);
      expect(retellCases.every(cs => cs.source.vendor === 'retell')).toBe(true);
    });

    it('[P0] filters case studies by holdout status', async () => {
      await createCaseStudy(createTestCaseStudy({ id: 'holdout-001', holdout: true }));
      await createCaseStudy(createTestCaseStudy({ id: 'holdout-002', holdout: false }));

      const holdoutCases = await listCaseStudies({ holdout: true });

      expect(holdoutCases.length).toBeGreaterThanOrEqual(1);
      expect(holdoutCases.every(cs => cs.meta.holdout === true)).toBe(true);
    });

    it('[P0] filters case studies by minimum quality', async () => {
      await createCaseStudy(createTestCaseStudy({ id: 'quality-high-001', quality_score: 5 }));
      await createCaseStudy(createTestCaseStudy({ id: 'quality-low-001', quality_score: 2 }));

      const highQualityCases = await listCaseStudies({ minQuality: 4 });

      expect(highQualityCases.length).toBeGreaterThanOrEqual(1);
      expect(highQualityCases.every(cs => (cs.meta.quality_score ?? 0) >= 4)).toBe(true);
    });

    it('[P0] respects limit and offset', async () => {
      // Create 5 more case studies
      for (let i = 0; i < 5; i++) {
        await createCaseStudy(createTestCaseStudy({ id: `pagination-${i}` }));
      }

      const page1 = await listCaseStudies({ limit: 3, offset: 0 });
      const page2 = await listCaseStudies({ limit: 3, offset: 3 });

      expect(page1.length).toBe(3);
      expect(page2.length).toBeGreaterThanOrEqual(1);

      // Pages should have different IDs
      const page1Ids = new Set(page1.map(cs => cs.id));
      const page2Ids = new Set(page2.map(cs => cs.id));
      const overlap = [...page1Ids].filter(id => page2Ids.has(id));
      expect(overlap.length).toBe(0);
    });

    it('[P0] updates case study meta', async () => {
      await createCaseStudy(createTestCaseStudy({ id: 'update-meta-001', quality_score: 3 }));

      const updated = await updateCaseStudyMeta('update-meta-001', {
        quality_score: 5,
        reviewed_by: 'test-user',
        quality_notes: 'Updated after review',
      });

      expect(updated.meta.quality_score).toBe(5);
      expect(updated.meta.reviewed_by).toBe('test-user');
      expect(updated.meta.quality_notes).toBe('Updated after review');
    });

    it('[P0] preserves existing meta when updating', async () => {
      await createCaseStudy(createTestCaseStudy({
        id: 'update-preserve-001',
        domain_tags: ['dental', 'scheduling'],
      }));

      const updated = await updateCaseStudyMeta('update-preserve-001', {
        human_reviewed: true,
      });

      // Original tags should be preserved
      expect(updated.meta.domain_tags).toContain('dental');
      expect(updated.meta.domain_tags).toContain('scheduling');
    });

    it('[P0] deletes case study', async () => {
      await createCaseStudy(createTestCaseStudy({ id: 'delete-test-001' }));

      const result = await deleteCaseStudy('delete-test-001');

      expect(result.deleted).toBe(true);

      const retrieved = await getCaseStudyById('delete-test-001');
      expect(retrieved).toBeNull();
    });

    it('[P0] reports delete=false for non-existent case study', async () => {
      const result = await deleteCaseStudy('non-existent-id');

      expect(result.deleted).toBe(false);
    });
  });

  describe('AC2: Evaluation Run CRUD Operations', () => {
    let testCaseStudyId: string;

    beforeAll(async () => {
      // Create a case study to associate runs with
      testCaseStudyId = `eval-run-case-${Date.now()}`;
      await createCaseStudy(createTestCaseStudy({ id: testCaseStudyId }));
    });

    it('[P0] creates an evaluation run', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-v1.0.0',
        input_json: { test: 'input data' },
        triggered_by: 'test',
      });

      expect(run.id).toBeDefined();
      expect(run.case_study_id).toBe(testCaseStudyId);
      expect(run.pipeline_version).toBe('test-v1.0.0');
      expect(run.status).toBe('pending');
      expect(run.run_at).toBeDefined();
    });

    it('[P0] retrieves evaluation run by ID', async () => {
      const created = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-v1.0.1',
        input_json: { retrieve: 'test' },
      });

      const retrieved = await getEvaluationRunById(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.pipeline_version).toBe('test-v1.0.1');
    });

    it('[P0] updates evaluation run status', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-v1.0.2',
        input_json: { status: 'test' },
      });

      await updateEvaluationRun(run.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      const retrieved = await getEvaluationRunById(run.id);

      expect(retrieved!.status).toBe('completed');
      expect(retrieved!.completed_at).toBeDefined();
    });

    it('[P0] updates evaluation run with scores', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-v1.0.3',
        input_json: { scores: 'test' },
      });

      await updateEvaluationRun(run.id, {
        status: 'completed',
        scores: {
          aggregate_score: 75.5,
          dimensions: [
            { dimension: 'tier_match', score: 1 },
            { dimension: 'integration_coverage', score: 0.8 },
          ],
        },
        flaws_detected: ['MISSING_INTEGRATION'],
      });

      const retrieved = await getEvaluationRunById(run.id);

      expect(retrieved!.aggregate_score).toBe(75.5);
      expect(retrieved!.scores_json.dimensions).toHaveLength(2);
      expect(retrieved!.flaws_detected).toContain('MISSING_INTEGRATION');
    });

    it('[P0] updates evaluation run with output', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-v1.0.4',
        input_json: { output: 'test' },
      });

      await updateEvaluationRun(run.id, {
        output_json: {
          research: { tier_assessment: { key: 'standard' } },
          pricing: { final_price: 12_500 },
        },
        duration_ms: 5000,
      });

      const retrieved = await getEvaluationRunById(run.id);

      expect(retrieved!.output_json.research.tier_assessment.key).toBe('standard');
      expect(retrieved!.duration_ms).toBe(5000);
    });

    it('[P0] updates evaluation run with error', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-v1.0.5',
        input_json: { error: 'test' },
      });

      await updateEvaluationRun(run.id, {
        status: 'failed',
        error_message: 'Pipeline crashed: out of memory',
      });

      const retrieved = await getEvaluationRunById(run.id);

      expect(retrieved!.status).toBe('failed');
      expect(retrieved!.error_message).toBe('Pipeline crashed: out of memory');
    });

    it('[P0] lists evaluation runs for a case study', async () => {
      // Create multiple runs for the same case study
      for (let i = 0; i < 3; i++) {
        await createEvaluationRun({
          case_study_id: testCaseStudyId,
          pipeline_version: `test-list-v${i}`,
          input_json: { list: i },
        });
      }

      const runs = await getEvaluationsForCaseStudy(testCaseStudyId);

      expect(runs.length).toBeGreaterThanOrEqual(3);
      expect(runs.every(r => r.pipeline_version.startsWith('test-'))).toBe(true);
    });

    it('[P0] lists evaluation runs with status filter', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-status-filter',
        input_json: { filter: 'status' },
      });

      await updateEvaluationRun(run.id, { status: 'completed' });

      const completedRuns = await listEvaluationRuns({ status: 'completed' });

      expect(completedRuns.length).toBeGreaterThanOrEqual(1);
      expect(completedRuns.every(r => r.status === 'completed')).toBe(true);
    });

    it('[P0] lists evaluation runs with minimum score filter', async () => {
      const run = await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'test-score-filter',
        input_json: { filter: 'score' },
      });

      await updateEvaluationRun(run.id, {
        status: 'completed',
        scores: { aggregate_score: 85 },
      });

      const highScoreRuns = await listEvaluationRuns({ minScore: 80 });

      expect(highScoreRuns.length).toBeGreaterThanOrEqual(1);
      expect(highScoreRuns.every(r => (r.aggregate_score ?? 0) >= 80)).toBe(true);
    });

    it('[P0] lists evaluation runs with pipeline version filter', async () => {
      await createEvaluationRun({
        case_study_id: testCaseStudyId,
        pipeline_version: 'unique-version-12345',
        input_json: { filter: 'version' },
      });

      const versionRuns = await listEvaluationRuns({ pipelineVersion: 'unique-version-12345' });

      expect(versionRuns.length).toBe(1);
      expect(versionRuns[0].pipeline_version).toBe('unique-version-12345');
    });
  });

  describe('AC3: Corpus Statistics', () => {
    beforeAll(async () => {
      // Create a mix of case studies for statistics
      await createCaseStudy(createTestCaseStudy({
        id: 'stats-vapi-001',
        vendor: 'vapi',
        holdout: false,
        quality_score: 4,
      }));
      await createCaseStudy(createTestCaseStudy({
        id: 'stats-vapi-002',
        vendor: 'vapi',
        holdout: true,
        quality_score: 5,
      }));
      await createCaseStudy(createTestCaseStudy({
        id: 'stats-retell-001',
        vendor: 'retell',
        holdout: false,
        quality_score: 3,
      }));
    });

    it('[P0] returns corpus statistics', async () => {
      const stats = await getCorpusStats();

      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.holdout).toBeGreaterThanOrEqual(1);
      expect(stats.training).toBe(stats.total - stats.holdout);
      expect(stats.avgQuality).toBeGreaterThan(0);
      expect(stats.oldest).toBeDefined();
      expect(stats.newest).toBeDefined();
    });

    it('[P0] returns source distribution', async () => {
      const distribution = await getSourceDistribution();

      expect(distribution).toHaveProperty('vapi');
      expect(distribution.vapi).toBeGreaterThanOrEqual(2);
      expect(distribution).toHaveProperty('retell');
      expect(distribution.retell).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AC4: Error Handling', () => {
    it('[P0] rejects invalid case study data', async () => {
      const invalidData = {
        id: 'invalid-001',
        // Missing required fields
      };

      await expect(createCaseStudy(invalidData as any)).rejects.toThrow();
    });

    it('[P0] rejects update to non-existent case study', async () => {
      await expect(
        updateCaseStudyMeta('non-existent-update', { quality_score: 3 })
      ).rejects.toThrow('Case study not found');
    });

    it('[P0] rejects update with no changes', async () => {
      // First create a valid case study
      const caseStudyId = `error-case-${Date.now()}`;
      await createCaseStudy(createTestCaseStudy({ id: caseStudyId }));

      const run = await createEvaluationRun({
        case_study_id: caseStudyId,
        pipeline_version: 'test-error-001',
        input_json: {},
      });

      await expect(
        updateEvaluationRun(run.id, {})
      ).rejects.toThrow('No updates provided');
    });
  });

  describe('AC5: Data Integrity', () => {
    it('[P0] JSON fields are properly serialized and deserialized', async () => {
      const complexData = createTestCaseStudy({
        id: 'json-integrity-001',
        domain_tags: ['dental', 'scheduling', 'high-volume'],
      });

      await createCaseStudy(complexData);
      const retrieved = await getCaseStudyById('json-integrity-001');

      // Verify complex nested structures are preserved
      expect(retrieved!.problem.pain_points).toEqual(['High no-show rate', 'Manual scheduling', 'Staff overwhelmed']);
      expect(retrieved!.solution.integrations).toHaveLength(3);
      expect(retrieved!.solution.integrations[0].system_name).toBe('Dentrix G7');
      expect(retrieved!.meta.domain_tags).toEqual(['dental', 'scheduling', 'high-volume']);
    });

    it('[P0] timestamps are properly stored', async () => {
      const caseStudy = await createCaseStudy(createTestCaseStudy({ id: 'timestamp-test-001' }));

      // harvested_at should be a valid ISO date string
      const harvestedAt = new Date(caseStudy.harvested_at);
      expect(harvestedAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(harvestedAt.getTime()).toBeGreaterThan(Date.now() - 60_000); // Within last minute
    });
  });
});
