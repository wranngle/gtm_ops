# TypeScript Typecheck Triage

Source: `bun run typecheck` against `tsconfig.json` (`tsc --noEmit`).
Total errors: **488** (raw count of `error TS####:` occurrences).
Methodology: ran the command in SYM-013 repro block, grouped by code and file. No code changed.

## Headline finding

**Of 488 errors, only 12 (~2.5%) live in shipped code (`lib/`, `src/`).** The remaining ~476 are in `tests/**` — overwhelmingly Playwright e2e specs and a cluster of evaluation/integration unit tests. The vast majority of test-side errors are mechanical: missing `.ts`/`.js` import extensions under `nodenext` resolution, implicit-any callback parameters in Playwright fixtures, and `unknown`-typed JSON fixtures lacking type narrowing.

## Top 10 error codes

| Rank | Code   | Count | Meaning                                                                 |
|------|--------|-------|-------------------------------------------------------------------------|
| 1    | TS7031 | 212   | Binding element implicitly `any` (Playwright destructured fixtures)     |
| 2    | TS2339 | 88    | Property does not exist on type `object` (un-narrowed JSON fixtures)    |
| 3    | TS7006 | 77    | Parameter implicitly `any` (callback args in tests)                     |
| 4    | TS2307 | 44    | Cannot find module (e2e helpers imported without `.ts` extension)       |
| 5    | TS2345 | 17    | Argument type mismatch (real schema-shape mismatches in enrichment)     |
| 6    | TS2835 | 10    | Relative import needs explicit extension (`nodenext`)                   |
| 7    | TS2300 | 8     | Duplicate identifier (re-exports collide in `lib/schemas/index.ts`)     |
| 8    | TS18046| 8     | Value is of type `unknown` (JSON.parse results not narrowed)            |
| 9    | TS2834 | 6     | Relative import needs `.js` extension (rewrite hint variant)            |
| 10   | TS2353 | 5     | Unknown property on object literal                                      |

Sum of top 10 = 475 / 488 (97%).

## Top 15 files by error count

| Rank | File                                                  | Errors | Classification                                  |
|------|-------------------------------------------------------|--------|-------------------------------------------------|
| 1    | tests/e2e/visual-regression.spec.ts                   | 44     | internal noise (Playwright fixture typing)      |
| 2    | tests/e2e/data-integrity.spec.ts                      | 35     | internal noise (Playwright fixture typing)      |
| 3    | tests/integration/evaluation.integration.test.ts      | 34     | internal noise (`object` fixture not narrowed)  |
| 4    | tests/e2e/report-structure.spec.ts                    | 31     | internal noise (Playwright fixture typing)      |
| 5    | tests/e2e/proposal-sheet.spec.ts                      | 31     | internal noise (Playwright fixture typing)      |
| 6    | tests/e2e/internal-sheet.spec.ts                      | 31     | internal noise (Playwright fixture typing)      |
| 7    | tests/e2e/audit-sheet.spec.ts                         | 31     | internal noise (Playwright fixture typing)      |
| 8    | tests/e2e/project-plan-sheet.spec.ts                  | 30     | internal noise (Playwright fixture typing)      |
| 9    | tests/e2e/scope-sheet.spec.ts                         | 25     | internal noise (Playwright fixture typing)      |
| 10   | tests/e2e/header-footer.spec.ts                       | 21     | internal noise (Playwright fixture typing)      |
| 11   | tests/unit/evaluation/adversarial.test.ts             | 15     | should-be-fixed eventually (assert un-narrowed) |
| 12   | tests/unit/enrichment.test.ts                         | 15     | blocking real callers (real schema drift TS2345)|
| 13   | tests/unit/evaluation/masker.test.ts                  | 14     | should-be-fixed eventually (extension + assert) |
| 14   | tests/unit/evaluation/features.test.ts                | 14     | should-be-fixed eventually (assert un-narrowed) |
| 15   | tests/integration/pipeline.integration.test.ts        | 14     | should-be-fixed eventually (assert un-narrowed) |

## Source-side errors (NOT in top 15 by count, but important)

These are the only 12 errors outside `tests/`:

| File                       | Errors | Classification                                                           |
|----------------------------|--------|--------------------------------------------------------------------------|
| `lib/schemas/index.ts`     | 10     | **blocking real callers** — duplicate re-exports + missing `TechStackItem`/`IntegrationRow` exports collide between `transform.schema.ts` and ad-hoc redeclarations |
| `src/transforms/index.ts`  | 1      | should-be-fixed eventually — `{}` not assignable to `Record<string, unknown>` |
| `lib/research.ts`          | 1      | should-be-fixed eventually — `task` property absent from `LLMExecutorOptions` |

`lib/schemas/index.ts` is the highest-leverage fix: it's used by every consumer of the validated schema layer; the duplicate-identifier and missing-export errors there will mask future schema regressions.

## Recommendations for follow-up issues

1. **Tier 1 (blocking real callers, ~25 errors):** fix `lib/schemas/index.ts` re-export collisions (8) and `tests/unit/enrichment.test.ts` schema drift (15). These are the only errors with non-cosmetic semantic content.
2. **Tier 2 (mechanical, ~330 errors):** add Playwright fixture types — a single `BaseFixture` interface in `tests/e2e/fixtures/base.fixture.ts` will erase all 10 e2e files at once. Also fix `nodenext` import-extension drift (~60 of these).
3. **Tier 3 (typed JSON fixtures, ~60 errors):** introduce typed loaders for evaluation/integration JSON fixtures so tests don't see them as `object`.

The 487 number is misleading; corrected for fan-out, the underlying defect count is closer to ~25 distinct issues.
