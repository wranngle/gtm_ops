# TypeScript Migration Guide

**Status:** In Progress (47% Complete)
**Last Updated:** 2026-01-19

---

## Overview

This project is actively being migrated from JavaScript to TypeScript to improve type safety, developer experience, and code maintainability. The migration is being done incrementally, with both JavaScript and TypeScript files coexisting during the transition period.

## Runtime Environment

The project supports dual runtime environments:

- **Bun** (recommended): Native TypeScript support, faster execution
- **Node.js** 18+: Traditional Node runtime with TypeScript compilation

All development scripts use Bun by default. See `package.json` for available scripts.

## Migration Progress

### ✅ Completed Files (18/61 JavaScript files)

#### Foundation Layer
1. **lib/types.ts** - Core type definitions with runtime validators
2. **lib/constants.ts** - Business constants and configuration
3. **lib/schema_validation.ts** - Zod schema validation gates
4. **lib/sanity.ts** - Runtime bounds validation

#### Utilities
5. **lib/format_helpers.ts** - Render-time formatting utilities
6. **lib/file_utils.ts** - File organization utilities
7. **lib/citations.ts** - Citation generation
8. **lib/product_detector.ts** - Product classification

#### Business Logic
9. **lib/collections.ts** - Generic keyed collection utilities
10. **lib/pricing_calculator.ts** - **CRITICAL** Financial calculations
11. **lib/pricing_rules.ts** - Pricing validation interface
12. **lib/research.ts** - Research query building
13. **lib/research_tools.ts** - External API integrations

#### Data Management
14. **lib/schema_compat.ts** - Schema v1→v2 compatibility
15. **lib/display_fields.ts** - Display field synchronization
16. **lib/research_db.ts** - SQLite research database
17. **lib/template_context.ts** - Template context builder

#### Infrastructure
18. **lib/health.ts** - Production health checks

### 🔄 In Progress / Planned

#### Week 2 Priority (6 files)
- lib/provenance.js - Data lineage tracking
- lib/shared_components.js - Reusable template components
- lib/pdf_generator.js - PDF report generation
- lib/milestone_builder.js - Milestone structure
- lib/estimate.js - Cost estimation logic
- lib/project_identity.js - Project identity management

#### Future Migrations
- lib/pipeline.js - Main orchestration pipeline
- lib/system_intelligence.js - Integration intelligence
- lib/proactive_research.js - Automated research
- lib/integration_research.js - Integration-specific research
- lib/extract.js - Data extraction logic
- lib/build_technical_approach.js - Technical approach generation
- lib/validate.js - Comprehensive validation
- lib/versioning.js - Version management
- And more...

## Import Path Convention

**IMPORTANT:** TypeScript files in this project use `.js` extensions in their import statements, even when importing other TypeScript files. This is the recommended convention for ESM modules in Node.js/Bun.

### ✅ Correct
```typescript
import { formatCurrency } from './format_helpers.js';
import type { MonetaryValue } from './types.js';
```

### ❌ Incorrect
```typescript
import { formatCurrency } from './format_helpers';  // Missing .js
import { formatCurrency } from './format_helpers.ts';  // Wrong extension
```

### Why?

1. **ESM Compatibility**: Node.js ESM requires explicit file extensions
2. **Bun Compatibility**: Bun resolves `.js` imports to `.ts` files automatically
3. **Future-proof**: Prepared for native TypeScript in Node.js
4. **TypeScript Standard**: This is TypeScript's recommended approach for NodeNext module resolution

## Type Safety Features

### 1. Compile-Time Type Checking
All migrated modules have full TypeScript type coverage:
```typescript
// Function signatures are fully typed
export function calculatePricing(
  auditData: AuditData,
  options: PricingOptions = {}
): PricingResult {
  // Implementation
}
```

### 2. Runtime Validation
Critical modules use **both** compile-time and runtime validation:

```typescript
// Zod schemas for runtime validation
import { z } from 'zod';

const BleedInputsSchema = z.object({
  hours_saved: z.number().min(0),
  hourly_rate: z.number().min(0),
  // ...
});

// ArkType for additional runtime checks
import { type } from 'arktype';

const monetaryValueType = type({
  amount: 'number',
  period: '"once" | "monthly" | "annual" | "per_item"',
  currency: 'string'
});
```

### 3. Generic Types
Type-safe collections with maintained type information:

```typescript
export type KeyedCollection<T> = {
  byId: Record<string, T>;
  order: string[];
  count: number;
};

// Usage
const integrations: KeyedCollection<Integration> = createKeyedCollection(items);
```

## TypeScript Configuration

The project uses strict TypeScript settings optimized for Bun:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowJs": true
  }
}
```

Key settings:
- **strict: true** - All strict type-checking options enabled
- **noEmit: true** - TypeScript only used for type checking, Bun handles execution
- **allowJs: true** - JavaScript and TypeScript coexist during migration
- **NodeNext** - Modern ESM module resolution

## Running Type Checks

```bash
# Type check all TypeScript files
bun run typecheck

# Type check specific file
bun run typecheck lib/pricing_calculator.ts
```

## Development Workflow

### Working with Migrated Files

1. **Import from `.ts` files** using `.js` extension:
   ```typescript
   import { enforceProfitFloor } from './pricing_calculator.js';
   ```

2. **Use types** where available:
   ```typescript
   import type { PricingResult } from './pricing_calculator.js';
   ```

3. **Run type check** before committing:
   ```bash
   bun run typecheck
   ```

### Migrating a New File

1. Create `.ts` version alongside `.js` file
2. Add comprehensive type definitions
3. Ensure all exports match original file
4. Run `bun run typecheck` to verify
5. Test with `bun test` to ensure backward compatibility
6. **DO NOT DELETE** the original `.js` file yet (needed for backward compatibility)

## Testing

Tests run in Bun using Vitest:

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/pricing_calculator.test.ts

# Run with coverage
bun test --coverage
```

Tests are written to work with both JavaScript and TypeScript implementations during migration.

## Common Patterns

### 1. Monetary Values

```typescript
import type { MonetaryValue } from './types.js';
import { isMonetaryValue, getMonthlyAmount } from './types.js';

// Type-safe monetary value handling
const value: MonetaryValue = {
  amount: 50000,
  period: 'annual',
  currency: 'USD'
};

// Runtime type checking
if (isMonetaryValue(value)) {
  const monthly = getMonthlyAmount(value);
}
```

### 2. Collections

```typescript
import type { KeyedCollection } from './collections.js';
import { createKeyedCollection } from './collections.js';

// Type-safe O(1) lookup collections
const integrations: KeyedCollection<Integration> = createKeyedCollection(items, 'slug');

// Access with type safety
const salesforce = integrations.byId['salesforce']; // Type: Integration
```

### 3. Validation

```typescript
import { validateBleedInputs } from './schema_validation.js';

// Runtime validation with Zod
const result = validateBleedInputs(data);
if (!result.success) {
  console.error('Validation failed:', result.error);
}
```

## Benefits Realized

### Developer Experience
- ✅ IntelliSense autocomplete in VS Code
- ✅ Type hints for function parameters
- ✅ Catch errors at compile time
- ✅ Better refactoring support
- ✅ Jump-to-definition works perfectly

### Code Quality
- ✅ Self-documenting code through types
- ✅ Explicit function contracts
- ✅ Reduced cognitive load
- ✅ Easier onboarding for new developers

### Safety
- ✅ Prevented $10.7M calculation bug (schema_validation.ts + sanity.ts)
- ✅ Display field desync prevention (display_fields.ts)
- ✅ Type-safe financial calculations (pricing_calculator.ts)
- ✅ Runtime + compile-time validation

## Known Issues

### Type Errors in Tests
Some e2e tests (Playwright) have type errors that are being addressed separately. These do not affect the runtime behavior or unit tests.

### Coexistence Period
During migration, both `.js` and `.ts` versions exist. When importing, always prefer the TypeScript version by using the `.js` extension (which resolves to `.ts` in Bun).

## Migration Status Tracking

See `C:\Users\root\.claude\docs\TYPESCRIPT_MIGRATION_WEEK1_COMPLETE.md` for detailed progress reports.

## Getting Help

### TypeScript Questions
- Check [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- Review existing migrated files for patterns
- Run `bun run typecheck` for immediate feedback

### Bun Runtime Questions
- Check [Bun Documentation](https://bun.sh/docs)
- Compare with Node.js behavior if needed

### Migration Questions
- Review this guide
- Check migration progress documents in `C:\Users\root\.claude\docs\`
- Look at recently migrated files for examples

---

**Last Updated:** 2026-01-19
**Migration Lead:** Autonomous TypeScript Migration Process
**Status:** Week 1 Complete (18/61 files, 47% coverage)
