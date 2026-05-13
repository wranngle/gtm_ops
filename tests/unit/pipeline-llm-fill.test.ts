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

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('UnifiedPipeline.runLLMFill placeholder gate', () => {
	it('rejects unresolved placeholders when no LLM provider is configured', async () => {
		vi.stubEnv('GEMINI_API_KEY', '');
		vi.stubEnv('GROQ_API_KEY', '');

		const pipeline = new UnifiedPipeline();
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

		await expect(pipeline.runLLMFill()).rejects.toThrow(/unresolved LLM placeholder/);
	});

	it('allows the no-key skip path when no placeholders remain', async () => {
		vi.stubEnv('GEMINI_API_KEY', '');
		vi.stubEnv('GROQ_API_KEY', '');

		const pipeline = new UnifiedPipeline();
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
