/** @type {import('xo').FlatXoConfig} */
// Note: this file is the single source of truth for xo configuration in this
// repo. The previous package.json#xo block was an eslintrc-style config that
// xo 1.2.3 (flat-config era) rejects via the "eslintrc-incompat" key
// 'overrides' at lint runtime. Per the regime in ~/.claude/CLAUDE.md, we do
// NOT bump xo here; instead, we consolidate xo settings into this flat-config
// file as an array of config items (xo 1.2.3 does not accept a top-level
// `overrides` key; per-file overrides become additional array entries with
// their own `files` glob).
module.exports = [
	{
		space: true,
		prettier: 'compat',
		ignores: [
			'node_modules/**',
			'output/**',
			'old/**',
			'.absorbed/**',
			'templates/**/*.html',
			'playwright-report/**',
			'test-results/**',
		],
		rules: {
			'unicorn/filename-case': ['error', {
				cases: {
					snakeCase: true,
					kebabCase: true,
				},
			}],
			'unicorn/no-process-exit': 'off',
			'unicorn/prefer-top-level-await': 'off',
			'unicorn/prevent-abbreviations': 'off',
			'unicorn/no-null': 'off',
			'unicorn/prefer-module': 'off',
			'unicorn/prefer-node-protocol': 'off',
			'unicorn/no-anonymous-default-export': 'off',
			'@typescript-eslint/consistent-type-definitions': 'off',
			'@typescript-eslint/naming-convention': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/no-redundant-type-constituents': 'off',
			'@typescript-eslint/restrict-template-expressions': 'off',
			'n/prefer-global/process': 'off',
			'n/file-extension-in-import': 'off',
			'import/extensions': 'off',
			'no-await-in-loop': 'off',
			'max-depth': 'off',
			'complexity': 'off',
			'capitalized-comments': 'off',
		},
	},
	{
		files: ['**/*.ts'],
		rules: {
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
		},
	},
	{
		files: ['hooks/**/*.ts'],
		rules: {
			'unicorn/no-process-exit': 'off',
		},
	},
	{
		files: ['**/*.test.ts', '**/*.spec.ts'],
		rules: {
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
];
