/** @type {import('xo').Options} */
module.exports = {
	space: true,
	prettier: 'compat',
	rules: {
		'unicorn/filename-case': ['error', {
			cases: {
				snakeCase: true,
				kebabCase: true,
			},
		}],
		'unicorn/prevent-abbreviations': 'off',
		'n/file-extension-in-import': 'off',
		'@typescript-eslint/naming-convention': 'off',
	},
	ignores: [
		'node_modules/**',
		'output/**',
		'old/**',
		'.absorbed/**',
		'templates/**/*.html',
		'playwright-report/**',
		'test-results/**',
	],
	overrides: [
		{
			files: '**/*.ts',
			rules: {
				'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			},
		},
	],
};
