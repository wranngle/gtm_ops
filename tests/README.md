# Test Suite

Automated test suite for the Unified Presales Report Pipeline.

## Overview

This project uses:
- **Vitest** for unit testing with **Faker.js** for test data generation
- **Playwright** for E2E testing with visual regression support

## Test Structure

```
tests/
├── unit/                              # Unit tests (Vitest)
│   ├── build_technical_approach.test.ts  # Integration dedup, tech stack
│   └── verify_output.test.ts             # Schema validation
├── e2e/                               # E2E tests (Playwright)
│   ├── report-rendering.spec.ts         # Report rendering validation
│   ├── fixtures/                        # Custom test fixtures
│   │   └── base.fixture.ts              # Base fixtures with cleanup
│   ├── pages/                           # Page objects
│   │   └── report.page.ts               # Report page object
│   ├── helpers/                         # Test helpers
│   └── __snapshots__/                   # Visual regression baselines
├── integration/                       # Integration tests (future)
└── support/
    ├── factories/                     # Test data factories
    │   ├── intake.factory.ts          # Intake data generation
    │   ├── integration.factory.ts     # Integration data generation
    │   └── index.ts                   # Factory exports
    └── fixtures/                      # Test fixtures (future)
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run only P0 (critical) tests
npm run test:p0

# Run P0 + P1 tests (recommended for CI)
npm run test:p1

# Run with coverage report
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run with interactive UI mode
npm run test:e2e:ui

# Run with debug mode (step through)
npm run test:e2e:debug

# View test report
npm run test:e2e:report

# Run all tests (unit + E2E)
npm run test:all
```

## Priority Tags

Tests are tagged with priority levels in their names:

- **[P0]** - Critical paths, must pass every commit
- **[P1]** - High priority, run on PR to main
- **[P2]** - Medium priority, run nightly
- **[P3]** - Low priority, run on-demand

Example:
```typescript
it('[P0] should return valid structure with all required fields', async () => {
  // Critical test
});
```

## Test Data Factories

Use factories for consistent, realistic test data:

```typescript
import { createIntake, createDentalIntake } from '../support/factories';
import { createIntegration, createDentalIntegrations } from '../support/factories';

// Basic intake with random data
const intake = createIntake();

// Dental practice intake (pre-configured)
const dentalIntake = createDentalIntake();

// Custom overrides
const customIntake = createIntake({
  classification: { project_type: 'voice_agent' }
});

// Create specific integrations
const integrations = [
  createIntegration({ system: 'Weave' }),
  createIntegration({ system: 'Dentrix G7' })
];
```

## Test Patterns

### Given-When-Then Format

All tests follow the Given-When-Then pattern:

```typescript
it('[P0] should remove generic when specific exists', async () => {
  // GIVEN: Both generic and specific integrations
  const integrations = [
    createIntegration({ system: 'Phone/SMS' }),
    createIntegration({ system: 'Weave' })
  ];

  // WHEN: Building technical approach
  const result = buildTechnicalApproach(intake, integrations);

  // THEN: Only specific should remain
  expect(result.integrations).not.toContainEqual(
    expect.objectContaining({ system_name: 'Phone/SMS' })
  );
});
```

### No Hard Waits

Tests should be deterministic without `setTimeout` or `sleep`:

```typescript
// WRONG
await new Promise(r => setTimeout(r, 1000));

// CORRECT - use explicit conditions
expect(result.integrations.length).toBe(3);
```

## Coverage Goals

| Module | Target | Current |
|--------|--------|---------|
| build-technical-approach.js | 80% | ~75% |
| verify-output.js | 90% | ~85% |
| extract.js | 70% | 0% |
| pipeline.js | 60% | 0% |

## Adding New Tests

1. Create test file in appropriate directory (`unit/` or `integration/`)
2. Name file with `.test.ts` extension
3. Import factories from `../support/factories`
4. Tag each test with priority `[P0]`, `[P1]`, `[P2]`, or `[P3]`
5. Follow Given-When-Then format
6. Run `npm run test:run` to verify

## CI Integration

Recommended CI configuration:

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npm run test:p1  # Run P0 + P1 unit tests
    - run: npm run test:e2e # Run E2E tests
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

## E2E Testing Guide

### Page Objects

Use page objects for maintainable E2E tests:

```typescript
import { ReportPage } from './pages/report.page';

test('should display client name', async ({ page }) => {
  const report = new ReportPage(page);
  await report.goto('/path/to/report.html');
  await report.verifyHeader();
});
```

### Custom Fixtures

Extend base fixtures for reusable test setup:

```typescript
import { test, expect } from './fixtures/base.fixture';

test('should render all sheets', async ({ reportPage }) => {
  // reportPage is pre-configured to navigate to latest report
  const sheets = await reportPage.locator('.sheet').count();
  expect(sheets).toBe(4);
});
```

### Visual Regression

Screenshots are automatically compared to baselines:

```typescript
test('visual regression', async ({ page }) => {
  await expect(page).toHaveScreenshot('full-report.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.05,
  });
});
```

Update baselines with: `npm run test:e2e -- --update-snapshots`
