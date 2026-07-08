/** @type {import('xo').FlatXoConfig} */
// Note: this file is the single source of truth for xo configuration in this
// repo. It MUST be named xo.config.{js,mjs,ts,mts} — xo 1.2.3 resolves only
// those names (a previous xo.config.cjs was silently never loaded, so lint
// ran on raw defaults and crashed). package.json is type:module, hence ESM.
export default [
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
      '**/*.d.ts',
    ],
    rules: {
      'unicorn/filename-case': ['error', {
        cases: {
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
      // Stylistic-only unicorn rules disabled across the gtm_ops backlog;
      // most fire on framework-mandated naming or idiomatic JS patterns.
      'unicorn/prefer-number-properties': 'off',
      'unicorn/text-encoding-identifier-case': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/import-style': 'off',
      'unicorn/prefer-structured-clone': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-useless-switch-case': 'off',
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
      // Crashes the lint run outright against TypeScript 6 type objects
      // (ts-api-utils reads .flags off undefined — upstream incompat, not a
      // finding). Re-enable when @typescript-eslint supports TS 6.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      // Type-aware rules that produce high false-positive noise against the
      // dynamic-shape data flowing through gtm_ops (LLM JSON, Linear /
      // Composio payloads, plugin boundaries). Suppressed pending the
      // zod->arktype migration that will tighten these surfaces.
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/parameter-properties': 'off',
      'n/prefer-global/process': 'off',
      'n/prefer-global/buffer': 'off',
      'n/file-extension-in-import': 'off',
      'import/extensions': 'off',
      // Mixed `.ts` / `.js` state during presales pipeline absorption;
      // re-enable once the codebase is single-extension.
      'import-x/extensions': 'off',
      'import-x/order': 'off',
      // Factory pattern (tests/support/factories/*) exports anonymous default
      // objects on purpose; the runtime imports them as named modules.
      'import-x/no-anonymous-default-export': 'off',
      'no-await-in-loop': 'off',
      'max-depth': 'off',
      'complexity': 'off',
      'capitalized-comments': 'off',
      // `x == null` / `x != null` is the standard nullish-check idiom (matches
      // both null AND undefined). Strict-equality intent is encoded via the
      // null-ignore option here and the paired `no-eq-null` exemption below.
      'eqeqeq': ['error', 'always', {null: 'ignore'}],
      'no-eq-null': 'off',
      // `new Promise((r) => setTimeout(r, ms))` is idiomatic and safe; the
      // real-bug class this rule guards against is caught by tests.
      'no-promise-executor-return': 'off',
      // camelcase is enforced by upstream JS conventions, but most violations
      // here are framework-mandated snake_case (Linear/OpenAI/Composio API
      // payloads, template/JSON-schema field names, intake form keys).
      'camelcase': 'off',
      'logical-assignment-operators': 'off',
      'promise/prefer-await-to-then': 'off',
      'promise/param-names': 'off',
      'default-case': 'off',
      // Stylistic-only; current source has organic padding patterns.
      '@stylistic/padding-line-between-statements': 'off',
      '@stylistic/indent-binary-ops': 'off',
      'unicorn/switch-case-braces': 'off',
      'unicorn/better-regex': 'off',
      'unicorn/prefer-string-replace-all': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/no-zero-fractions': 'off',
      'unicorn/catch-error-name': 'off',
      'unicorn/prefer-single-call': 'off',
      'unicorn/prefer-optional-catch-binding': 'off',
      // `return await` is a no-op perf concern on Node 14+ and aids debug
      // (preserves async stack traces).
      'no-return-await': 'off',
      // These rules' auto-fixes flip `null` -> `undefined` or strip `as any`
      // casts that downstream code relies on; suppressed pending an
      // explicit type-tightening pass under the zod->arktype migration.
      '@typescript-eslint/no-restricted-types': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      'object-shorthand': 'off',
      'prefer-destructuring': 'off',
    },
  },
  // Note: `@typescript-eslint/consistent-type-definitions` per-file override
  // intentionally removed — its auto-fix flips `interface` -> `type` across
  // public exports without considering downstream `extends` consumers.

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
  // Final catch-all override: a small set of stylistic rules slip past the
  // primary `rules` block (xo merges its own defaults into the same flat
  // entry, so a later entry is required to win the precedence race). Keep
  // this list minimal; most rule tunings belong in the primary block above.
  {
    files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
    rules: {
      '@stylistic/indent-binary-ops': 'off',
      // Must live in this final entry to win the precedence race (see note
      // above): crashes the whole lint run against TypeScript 6 type objects
      // (ts-api-utils reads .flags off undefined — upstream incompat, not a
      // finding). Re-enable when @typescript-eslint supports TS 6.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    },
  },
];
