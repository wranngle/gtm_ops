/* eslint-disable @typescript-eslint/naming-convention, require-unicode-regexp */
import {
	afterEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import {
	UnifiedPipeline,
} from '../../lib/pipeline.js';

// Lib/pipeline.ts assigns schema/stats in the constructor without class-field
// declarations, so the inferred class type lacks them; give the test a
// structural view until the pipeline is typed.
type PipelineHarness = UnifiedPipeline & {
	schema: Record<string, any>;
	stats: {stages: Record<string, {skipped?: boolean; reason?: string}>};
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('UnifiedPipeline.runLLMFill placeholder gate', () => {
	it('skips (placeholders retained, stage marked skipped) when no LLM provider is configured', async () => {
		// Current contract: runLLMFill degrades to a skip so the pipeline can run
		// without LLM keys; unresolved placeholders are caught downstream by
		// lib/validate.ts's placeholder_resolution rule, not by this stage.
		vi.stubEnv('GEMINI_API_KEY', '');
		vi.stubEnv('GROQ_API_KEY', '');

		const pipeline = new UnifiedPipeline() as PipelineHarness;
		pipeline.schema = {
			audit_report: {
				scorecard: {
					executive_summary: {
						body: '[LLM_PLACEHOLDER: executive_summary]',
					},
				},
			},
			proposal: {},
			project_plan: {},
		};

		await expect(pipeline.runLLMFill()).resolves.toBeUndefined();
		expect(pipeline.stats.stages.llmFill).toEqual({skipped: true, reason: 'No API keys'});
		expect(pipeline.schema.audit_report.scorecard.executive_summary.body)
			.toBe('[LLM_PLACEHOLDER: executive_summary]');
	});

	it('allows the no-key skip path when no placeholders remain', async () => {
		vi.stubEnv('GEMINI_API_KEY', '');
		vi.stubEnv('GROQ_API_KEY', '');

		const pipeline = new UnifiedPipeline() as PipelineHarness;
		pipeline.schema = {
			audit_report: {
				scorecard: {
					executive_summary: {
						body: 'The process is ready for review.',
					},
				},
			},
			proposal: {
				executive_summary: {
					body: 'Concrete proposal narrative.',
				},
			},
			project_plan: {
				executive_summary: {
					body: 'Concrete project-plan narrative.',
				},
			},
		};

		await expect(pipeline.runLLMFill()).resolves.toBeUndefined();
	});
});
