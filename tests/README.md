# Test Suite

Automated tests for the gtm_ops runtime: presales pipeline, API surface, and the ops-console UI.

## Test structure

```
tests/
├── unit/                  # Vitest unit tests (largest suite; includes drift
│   │                      # guards like readme.test.ts and gardener.test.ts)
│   ├── evaluation/        # evaluation-domain unit tests
│   ├── factories/         # factory-focused tests
│   └── fixtures/          # unit-test fixtures
├── integration/           # Vitest integration tests (corpus, evaluation,
│                          # lead-enrichment, pipeline round-trips) — active,
│                          # runs in every `bun run test:run` via the vitest glob
├── e2e/                   # Playwright: PDF / report rendering (playwright.config.ts)
├── console-e2e/           # Playwright: ops-console UI suite, 100+ tests
│                          # (playwright.console.config.ts)
├── _helpers/              # shared test helpers
├── fixtures/              # shared fixtures
├── support/               # test data factories (Faker-backed)
└── ticker.test.ts         # top-level vitest test (caught by the same glob)
```

## Running tests

```bash
bun run test          # vitest watch mode
bun run test:run      # vitest once (unit + integration, ~10s)
bun run test:p0       # only [P0] critical tests
bun run test:p1       # [P0] + [P1] (good pre-PR gate)
bun run test:coverage # vitest with coverage report

bun run test:e2e      # Playwright PDF/report suite
bun run test:console  # Playwright ops-console UI suite
bun run test:all      # everything
```

CI runs `static` (typecheck), `unit`, and `console-e2e` jobs on every PR — see
[`.github/workflows/test.yml`](../.github/workflows/test.yml). Keep local
commands and CI in lockstep; if you add a suite, wire it there.

`bun run lint` (xo) is **advisory-only, not CI-gated**: its config went
unloaded for months (`xo.config.cjs` is not a filename xo resolves — now fixed
as `xo.config.js`), so the first honest run surfaced a ~15k-finding stylistic
backlog. Gate it in CI only after that backlog is burned down deliberately.

## Priority tags

Tests are tagged with priority levels in their names:

- **[P0]** — critical paths, must pass every commit
- **[P1]** — high priority, run on PR to main
- **[P2]** — medium priority, run nightly
- **[P3]** — low priority, run on-demand

```typescript
it('[P0] should return valid structure with all required fields', async () => {
  // Critical test
});
```

## Test data factories

Use factories from [`support/`](support/) for consistent, realistic test data:

```typescript
import { createIntake, createDentalIntake } from '../support/factories';
import { createIntegration } from '../support/factories';

const intake = createIntake();                                  // random data
const dentalIntake = createDentalIntake();                      // pre-configured
const customIntake = createIntake({
  classification: { project_type: 'voice_agent' }
});                                                             // overrides
```

## Test patterns

**Given-When-Then** — structure test bodies as setup / action / assertion with
comments naming each phase.

**No hard waits** — tests must be deterministic without `setTimeout`/`sleep`;
use explicit conditions and Playwright auto-waiting locators.

**Own your DB lifecycle** — tests touching SQLite open a per-test unique DB
file under the OS tmpdir (see `tests/unit/usage.test.ts`), never a shared
path. For the residual `node-sqlite3` cache-visibility race and the retry-shim
convention, read
[`docs/references/sqlite-query-stability.md`](../docs/references/sqlite-query-stability.md).

**Drift guards** — `tests/unit/readme.test.ts` and `tests/unit/gardener.test.ts`
pin claims in the docs to reality; when you change documented behavior, update
the guard in the same PR.

## Adding new tests

1. Create the file in the right directory (`unit/`, `integration/`, `e2e/`, `console-e2e/`).
2. Name it `*.test.ts` (vitest) or `*.spec.ts` (Playwright).
3. Tag each test with a priority (`[P0]`–`[P3]`).
4. Run `bun run test:run` (or the relevant Playwright suite) before committing.
