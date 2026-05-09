// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Schema Validation Gates
 *
 * Integrates ArkType schemas with the pipeline. These gates validate data at
 * critical boundaries.
 *
 * CRITICAL: In production, validation failures THROW errors.
 * In development, they log warnings but continue.
 *
 * @module lib/schema-validation
 */

import { type } from 'arktype';

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

function isProduction() {
  return process.env.NODE_ENV === 'production' ||
    process.env.STRICT_VALIDATION === 'true';
}

function getDefaultThrowBehavior() {
  return isProduction();
}

function formatArkErrors(errors) {
  return [...errors].map((issue) => {
    const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? '');
    return `${path}: ${issue.message ?? String(issue)}`;
  });
}

// =============================================================================
// SCHEMAS (Inline for the gates' own use; mirrors src/schemas/*)
// =============================================================================

const BleedInputsSchema = type({
  volume_per_day: '1 <= number <= 10000',
  days_per_month: '1 <= number <= 31',
  // KEY CHECK: max 480 minutes (8 hours) per task
  minutes_per_item: '0.5 <= number <= 480',
  hourly_rate: '10 <= number <= 500',
});

const MonetaryValueSchema = type({
  amount: '0 <= number <= 100000000',
  currency: type("'USD' | 'EUR'").default('USD'),
  period: "'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'per_item'",
});

const BleedTotalSchema = MonetaryValueSchema.narrow((v, ctx) =>
  v.amount < 500_000 || ctx.reject('monthly bleed < $500K (verify calculation)'),
);

const BleedCalculationSchema = type({
  total: BleedTotalSchema,
  formula: 'string',
  'inputs?': BleedInputsSchema,
  '[string]': 'unknown',
});

const TierSchema = type({
  key: "'starter' | 'standard' | 'advanced' | 'premium'",
  label: 'string',
  base_hours: '20 <= number <= 500',
  risk_multiplier: '1 <= number <= 2',
  '[string]': 'unknown',
});

const ExtractedIntakeSchema = type({
  'prepared_for?': type({
    'account_name?': 'string >= 1',
    '[string]': 'unknown',
  }),
  'client?': type({
    'name?': 'string >= 1',
    '[string]': 'unknown',
  }),
  'section_a_workflow_definition?': type({
    'q01_workflow_name?': 'string >= 1',
    '[string]': 'unknown',
  }),
  'project?': type({
    'workflow_name?': 'string >= 1',
    '[string]': 'unknown',
  }),
  '[string]': 'unknown',
}).narrow((data, ctx) => {
  const hasClient = data.prepared_for?.account_name || data.client?.name;
  if (!hasClient) {
    return ctx.reject('client name (prepared_for.account_name or client.name)');
  }
  const hasWorkflow = data.section_a_workflow_definition?.q01_workflow_name || data.project?.workflow_name;
  if (!hasWorkflow) {
    return ctx.reject('workflow name (section_a_workflow_definition.q01_workflow_name or project.workflow_name)');
  }
  return true;
});

const MeasurementItemSchema = type({
  'metric_name?': 'string',
  'name?': 'string',
  'measured_value?': 'number',
  'value?': 'number',
  '[string]': 'unknown',
});

const ExtractedMeasurementsSchema = type({
  'measurements?': MeasurementItemSchema.array(),
  '[string]': 'unknown',
});

// =============================================================================
// VALIDATION GATE FUNCTIONS
// =============================================================================

export function validateBleedInputsGate(inputs, options = {}) {
  const { throwOnError = getDefaultThrowBehavior(), logWarnings = true } = options;

  const result = BleedInputsSchema(inputs);
  if (result instanceof type.errors) {
    const errors = formatArkErrors(result);
    const errorMessage = `BLEED INPUT VALIDATION FAILED:\n${errors.join('\n')}`;
    if (logWarnings) {
      console.error('❌ ' + errorMessage);
      console.error('Input received:', JSON.stringify(inputs, null, 2));
    }
    if (throwOnError) {
      throw new Error(errorMessage);
    }
    return { valid: false, errors, data: inputs };
  }

  if (logWarnings) {
    console.log('✓ Bleed inputs validated successfully');
  }
  return { valid: true, errors: [], data: result };
}

export function validateBleedOutputGate(bleed, options = {}) {
  const { throwOnError = getDefaultThrowBehavior(), logWarnings = true } = options;

  let normalizedBleed = bleed;
  if (typeof bleed?.total === 'number') {
    normalizedBleed = {
      ...bleed,
      total: { amount: bleed.total, currency: 'USD', period: 'monthly' },
    };
  }

  const result = BleedCalculationSchema(normalizedBleed);
  if (result instanceof type.errors) {
    const errors = formatArkErrors(result);
    if (logWarnings) console.warn('⚠️ Bleed output validation warnings:', errors);
    if (throwOnError) throw new Error(`Bleed output validation failed:\n${errors.join('\n')}`);
    return { valid: false, errors, data: bleed };
  }
  return { valid: true, errors: [], data: result };
}

export function validateExtractionGate(intake, measurements, options = {}) {
  const { throwOnError = getDefaultThrowBehavior(), logWarnings = true } = options;

  const warnings = [];
  const errors = [];

  const intakeResult = ExtractedIntakeSchema(intake);
  if (intakeResult instanceof type.errors) {
    for (const issue of intakeResult) {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? '');
      errors.push(`intake.${path}: ${issue.message ?? String(issue)}`);
    }
  }

  const measurementsResult = ExtractedMeasurementsSchema(measurements);
  if (measurementsResult instanceof type.errors) {
    for (const issue of measurementsResult) {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? '');
      warnings.push(`measurements.${path}: ${issue.message ?? String(issue)}`);
    }
  }

  const clientName = intake?.prepared_for?.account_name || intake?.client?.name;
  const workflowName = intake?.section_a_workflow_definition?.q01_workflow_name || intake?.project?.workflow_name;

  if (clientName && /^(unknown|client|test|example)/i.test(clientName)) {
    warnings.push(`Client name "${clientName}" appears to be a placeholder`);
  }

  if (workflowName && /^(unknown|workflow|test|example)/i.test(workflowName)) {
    warnings.push(`Workflow name "${workflowName}" appears to be a placeholder`);
  }

  const measurementCount = measurements?.measurements?.length || 0;
  if (measurementCount === 0) {
    warnings.push('No measurements extracted - bleed calculations may be inaccurate');
  }

  if (logWarnings) {
    if (errors.length > 0) {
      console.error('❌ EXTRACTION VALIDATION FAILED:');
      for (const e of errors) console.error(`   - ${e}`);
    }
    if (warnings.length > 0) {
      console.warn('⚠️ Extraction warnings:');
      for (const w of warnings) console.warn(`   - ${w}`);
    }
    if (errors.length === 0 && warnings.length === 0) {
      console.log('✓ Extraction validation passed');
    }
  }

  if (errors.length > 0 && throwOnError) {
    throw new Error(`Extraction validation failed:\n${errors.join('\n')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: { intake, measurements },
  };
}

export function validateTierGate(tier, options = {}) {
  const { throwOnError = getDefaultThrowBehavior(), logWarnings = true } = options;

  const result = TierSchema(tier);
  if (result instanceof type.errors) {
    const errors = formatArkErrors(result);
    if (logWarnings) console.warn('⚠️ Tier validation warnings:', errors);
    if (throwOnError) throw new Error(`Tier validation failed:\n${errors.join('\n')}`);
    return { valid: false, errors, data: tier };
  }
  return { valid: true, errors: [], data: result };
}

export function validateMonetaryAmount(amount, label = 'amount', options = {}) {
  const { maxAmount = 100_000_000, minAmount = 0 } = options;

  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new TypeError(`${label} is not a valid number: ${amount}`);
  }
  if (amount < minAmount) {
    throw new Error(`${label} (${amount}) is below minimum (${minAmount})`);
  }
  if (amount > maxAmount) {
    throw new Error(
      `${label} ($${amount.toLocaleString()}) exceeds max ($${maxAmount.toLocaleString()}). ` +
      `This may indicate a unit conversion error.`,
    );
  }
  return amount;
}

export function withValidation(fn, inputSchema, outputSchema = null) {
  return function (...args) {
    if (inputSchema && args[0]) {
      const inputResult = inputSchema(args[0]);
      if (inputResult instanceof type.errors) {
        const errors = formatArkErrors(inputResult).join('\n');
        throw new Error(`Input validation failed:\n${errors}`);
      }
      args[0] = inputResult;
    }

    const result = fn(...args);

    if (outputSchema && result) {
      const outputResult = outputSchema(result);
      if (outputResult instanceof type.errors) {
        console.warn('Output validation warnings:', formatArkErrors(outputResult));
      }
    }

    return result;
  };
}

export default {
  validateBleedInputsGate,
  validateBleedOutputGate,
  validateExtractionGate,
  validateTierGate,
  validateMonetaryAmount,
  withValidation,
  schemas: {
    BleedInputsSchema,
    BleedCalculationSchema,
    MonetaryValueSchema,
    TierSchema,
    ExtractedIntakeSchema,
    ExtractedMeasurementsSchema,
  },
};
