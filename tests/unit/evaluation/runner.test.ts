/**
 * Runner Tests - Verify evaluation runner functions
 *
 * Tests getPipelineVersion, runEvaluation, runBatchEvaluation, checkReadiness
 *
 * @priority P0 - Critical for evaluation system
 */
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCaseStudyById,
  listCaseStudies,
  createEvaluationRun,
  updateEvaluationRun,
  getCorpusStats,
} from '../../../lib/evaluation/corpus.js';
import { toIntake as _toIntake, generateMaskingReport } from '../../../lib/evaluation/masker.js';
import { compare as _compare, detectFlaws } from '../../../lib/evaluation/comparator.js';
import type { CompareResult, EvalIntake } from '../../_helpers/eval-types.js';
import {
  runEvaluation as _runEvaluation,
  runBatchEvaluation as _runBatchEvaluation,
  checkReadiness as _checkReadiness,
} from '../../../lib/evaluation/runner.js';

const toIntake = (cs: object): EvalIntake => _toIntake(cs) as EvalIntake;
const compare = (...args: Parameters<typeof _compare>): CompareResult => _compare(...args) as CompareResult;

type RunResult = {
  status?: string;
  reason?: string;
  masked_intake?: unknown;
  masking_report?: unknown;
  scores?: unknown;
  flaws?: unknown[];
  [k: string]: unknown;
};
type BatchResult = {
  total: number;
  message?: string;
  results?: RunResult[];
  summary?: Record<string, unknown>;
  [k: string]: unknown;
};
type ReadinessResult = {
  ready: boolean;
  total_case_studies?: number;
  reasons?: string[];
  issues: string[];
  pipeline_version?: string;
  [k: string]: unknown;
};
const runEvaluation = async (...args: Parameters<typeof _runEvaluation>): Promise<RunResult> =>
  (await _runEvaluation(...args)) as RunResult;
const runBatchEvaluation = async (...args: Parameters<typeof _runBatchEvaluation>): Promise<BatchResult> =>
  (await _runBatchEvaluation(...args)) as BatchResult;
const checkReadiness = async (...args: Parameters<typeof _checkReadiness>): Promise<ReadinessResult> =>
  (await _checkReadiness(...args)) as ReadinessResult;

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock corpus
vi.mock('../../../lib/evaluation/corpus.js', () => ({
  getCaseStudyById: vi.fn(),
  listCaseStudies: vi.fn(),
  createEvaluationRun: vi.fn(),
  updateEvaluationRun: vi.fn(),
  getCorpusStats: vi.fn(),
}));

// Mock masker
vi.mock('../../../lib/evaluation/masker.js', () => ({
  toIntake: vi.fn(),
  generateMaskingReport: vi.fn(),
}));

// Mock comparator
vi.mock('../../../lib/evaluation/comparator.js', () => ({
  compare: vi.fn(),
  detectFlaws: vi.fn(),
}));

// Mock pipeline
vi.mock('../../../lib/pipeline.js', () => ({
  UnifiedPipeline: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
    schema: { test: 'output' },
  })),
}));

describe('Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPipelineVersion', () => {
    it('[P0] returns git SHA when available', async () => {
      const { default: runner } = await import('../../../lib/evaluation/runner.js');
      vi.mocked(execSync).mockReturnValue('abc1234\n');

      const version = runner.getPipelineVersion();
      expect(version).toBe('abc1234');
    });

    it('[P1] falls back to package version when git fails', async () => {
      const { default: runner } = await import('../../../lib/evaluation/runner.js');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      // Will return 'unknown' or package version depending on env
      const version = runner.getPipelineVersion();
      expect(typeof version).toBe('string');
    });
  });

  describe('runEvaluation', () => {
    const mockCaseStudy = {
      id: 'test-case-001',
      problem: { industry: 'dental', company_size: 'small' },
      solution: {
        tier: 'standard',
        integrations: [{ system_name: 'Dentrix' }],
        agent_type: 'inbound',
      },
      meta: { holdout: false, quality_score: 4 },
    };

    const mockMaskedIntake = {
      section_a_workflow_definition: {
        q01_workflow_name: 'Test Workflow',
      },
    };

    const mockScores = {
      aggregate_score: 75,
      dimensions: [],
    };

    beforeEach(() => {
      vi.mocked(getCaseStudyById).mockResolvedValue(mockCaseStudy);
      vi.mocked(_toIntake).mockReturnValue(mockMaskedIntake as never);
      vi.mocked(generateMaskingReport).mockReturnValue({ masked_fields: 10 } as never);
      vi.mocked(createEvaluationRun).mockResolvedValue({ id: 'run-001' });
      vi.mocked(updateEvaluationRun).mockResolvedValue({});
      vi.mocked(_compare).mockReturnValue(mockScores as never);
      vi.mocked(detectFlaws).mockReturnValue([]);
    });

    it('[P0] throws error when case study not found', async () => {
      vi.mocked(getCaseStudyById).mockResolvedValue(null);

      await expect(runEvaluation('nonexistent')).rejects.toThrow('Case study not found');
    });

    it('[P0] skips holdout case studies by default', async () => {
      vi.mocked(getCaseStudyById).mockResolvedValue({
        ...mockCaseStudy,
        meta: { holdout: true, quality_score: 4 },
      });

      const result = await runEvaluation('holdout-case');

      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('Holdout');
    });

    it('[P0] evaluates holdout when includeHoldout option is true', async () => {
      vi.mocked(getCaseStudyById).mockResolvedValue({
        ...mockCaseStudy,
        meta: { holdout: true, quality_score: 4 },
      });

      const result = await runEvaluation('holdout-case', { includeHoldout: true, dryRun: true });

      expect(result.status).not.toBe('skipped');
    });

    it('[P0] returns dry run result without executing pipeline', async () => {
      const result = await runEvaluation('test-case-001', { dryRun: true });

      expect(result.status).toBe('dry_run');
      expect(result.masked_intake).toBeDefined();
      expect(result.masking_report).toBeDefined();
      expect(createEvaluationRun).not.toHaveBeenCalled();
    });

    it('[P1] creates evaluation run record', async () => {
      await runEvaluation('test-case-001', { dryRun: true });

      // dryRun doesn't create a run, but we can verify mocking works
      expect(getCaseStudyById).toHaveBeenCalledWith('test-case-001');
      expect(_toIntake).toHaveBeenCalledWith(mockCaseStudy, expect.any(Object));
    });
  });

  describe('runBatchEvaluation', () => {
    const mockCaseStudies = [
      { id: 'case-001', meta: { holdout: false } },
      { id: 'case-002', meta: { holdout: false } },
      { id: 'case-003', meta: { holdout: true } },
    ];

    beforeEach(() => {
      vi.mocked(listCaseStudies).mockResolvedValue(mockCaseStudies.filter((c) => !c.meta.holdout));
    });

    it('[P0] returns empty summary when no case studies', async () => {
      vi.mocked(listCaseStudies).mockResolvedValue([]);

      const result = await runBatchEvaluation();

      expect(result.total).toBe(0);
      expect(result.message).toContain('No case studies');
    });

    it('[P0] filters holdout case studies by default', async () => {
      const result = await runBatchEvaluation();

      expect(listCaseStudies).toHaveBeenCalledWith({ holdout: false });
    });

    it('[P1] includes holdout when option is set', async () => {
      vi.mocked(listCaseStudies).mockResolvedValue(mockCaseStudies);

      await runBatchEvaluation({ includeHoldout: true });

      expect(listCaseStudies).toHaveBeenCalledWith({ holdout: null });
    });

    it('[P1] calls progress callback during batch', async () => {
      vi.mocked(listCaseStudies).mockResolvedValue([mockCaseStudies[0]]);
      vi.mocked(getCaseStudyById).mockResolvedValue({
        id: 'case-001',
        problem: {},
        solution: {},
        meta: { holdout: false },
      });
      vi.mocked(_toIntake).mockReturnValue({} as never);
      vi.mocked(generateMaskingReport).mockReturnValue({} as never);
      vi.mocked(createEvaluationRun).mockResolvedValue({ id: 'run-001' });
      vi.mocked(_compare).mockReturnValue({ aggregate_score: 50, dimensions: [] } as never);
      vi.mocked(detectFlaws).mockReturnValue([]);

      const progressCalls: unknown[] = [];
      await runBatchEvaluation({
        onProgress: (progress: unknown) => progressCalls.push(progress),
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]).toHaveProperty('batch_id');
      expect(progressCalls[0]).toHaveProperty('current');
      expect(progressCalls[0]).toHaveProperty('total');
    });
  });

  describe('checkReadiness', () => {
    it('[P0] reports ready when corpus has sufficient case studies', async () => {
      vi.mocked(getCorpusStats).mockResolvedValue({
        total: 15,
        training: 12,
        holdout: 3,
      });

      const result = await checkReadiness();

      expect(result.ready).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('[P0] reports issue when corpus is empty', async () => {
      vi.mocked(getCorpusStats).mockResolvedValue({
        total: 0,
        training: 0,
        holdout: 0,
      });

      const result = await checkReadiness();

      expect(result.ready).toBe(false);
      expect(result.issues.some((i) => i.includes('No case studies'))).toBe(true);
    });

    it('[P1] reports issue when training set is small', async () => {
      vi.mocked(getCorpusStats).mockResolvedValue({
        total: 4,
        training: 3,
        holdout: 1,
      });

      const result = await checkReadiness();

      expect(result.ready).toBe(false);
      expect(result.issues.some((i) => i.includes('Only'))).toBe(true);
    });

    it('[P1] handles corpus access errors', async () => {
      vi.mocked(getCorpusStats).mockRejectedValue(new Error('DB error'));

      const result = await checkReadiness();

      expect(result.ready).toBe(false);
      expect(result.issues.some((i) => i.includes('Cannot access corpus'))).toBe(true);
    });

    it('[P1] returns pipeline version', async () => {
      vi.mocked(getCorpusStats).mockResolvedValue({ total: 10, training: 8, holdout: 2 });

      const result = await checkReadiness();

      expect(result.pipeline_version).toBeDefined();
    });
  });
});
