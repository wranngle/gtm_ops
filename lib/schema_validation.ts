/**
 * Schema Validation Gates
 *
 * Integrates Zod schemas with the existing pipeline.
 * These gates validate data at critical boundaries.
 *
 * CRITICAL: In production, validation failures THROW errors.
 * In development, they log warnings but continue.
 *
 * @module lib/schema_validation
 */

import {z} from 'zod';

// =============================================================================
// TYPES
// =============================================================================

type ValidationOptions = {
  throwOnError?: boolean;
  logWarnings?: boolean;
};

type ValidationResult<T = any> = {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  data: T;
};

type MonetaryAmountOptions = {
  maxAmount?: number;
  minAmount?: number;
};

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Check if running in production environment
 * Validation is strict (throws) in production, lenient (warns) in development
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' ||
         process.env.STRICT_VALIDATION === 'true';
}

/**
 * Get default throwOnError value based on environment
 * Production: true (strict), Development: false (lenient)
 */
function getDefaultThrowBehavior(): boolean {
  return isProduction();
}

// =============================================================================
// PORTABLE SCHEMAS (Inline to avoid TS import complexity)
// These mirror src/schemas/*.ts but in plain Zod definitions
// =============================================================================

/**
 * BleedInputs schema - THE KEY PROTECTION
 */
const BleedInputsSchema = z.object({
  volume_per_day: z.number()
    .min(1, {message: 'Volume must be at least 1'})
    .max(10_000, {message: 'Volume exceeds 10K/day - verify'}),

  days_per_month: z.number()
    .min(1).max(31, {message: 'Days must be 1-31'}),

  // THE KEY CHECK: Max 480 minutes (8 hours)
  minutes_per_item: z.number()
    .min(0.5, {message: 'Must be at least 30 seconds'})
    .max(480, {message: 'Exceeds 8 hours (480 min) - verify'}),

  hourly_rate: z.number()
    .min(10, {message: 'Rate below $10 - verify'})
    .max(500, {message: 'Rate above $500 - verify'})
});

/**
 * MonetaryValue schema
 */
const MonetaryValueSchema = z.object({
  amount: z.number().nonnegative().max(100_000_000),
  currency: z.enum(['USD', 'EUR']).default('USD'),
  period: z.enum(['once', 'hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'per_item'])
});

/**
 * BleedCalculation output schema
 */
const BleedCalculationSchema = z.object({
  total: MonetaryValueSchema.refine(
    val => val.amount < 500_000,
    {message: 'Monthly bleed exceeds $500K - verify'}
  ),
  formula: z.string(),
  inputs: BleedInputsSchema.optional()
}).passthrough();

/**
 * Tier assessment schema
 */
const TierSchema = z.object({
  key: z.enum(['starter', 'standard', 'advanced', 'premium']),
  label: z.string(),
  base_hours: z.number().min(20).max(500),
  risk_multiplier: z.number().min(1).max(2)
}).passthrough();

/**
 * Post-extraction intake validation schema
 * Ensures critical fields exist before proceeding to research stage
 */
const ExtractedIntakeSchema = z.object({
  // Client identification - at least one of these paths should be present
  prepared_for: z.object({
    account_name: z.string().min(1).optional()
  }).optional(),
  client: z.object({
    name: z.string().min(1).optional()
  }).optional(),

  // Workflow identification
  section_a_workflow_definition: z.object({
    q01_workflow_name: z.string().min(1).optional()
  }).optional(),
  project: z.object({
    workflow_name: z.string().min(1).optional()
  }).optional()
}).passthrough().refine(
  data => {
    // Must have client name from at least one path
    const hasClient = data.prepared_for?.account_name || data.client?.name;
    return Boolean(hasClient);
  },
  {message: 'Client name is required (prepared_for.account_name or client.name)'}
).refine(
  data => {
    // Must have workflow name from at least one path
    const hasWorkflow = data.section_a_workflow_definition?.q01_workflow_name || data.project?.workflow_name;
    return Boolean(hasWorkflow);
  },
  {message: 'Workflow name is required (section_a_workflow_definition.q01_workflow_name or project.workflow_name)'}
);

/**
 * Measurements validation schema
 */
const ExtractedMeasurementsSchema = z.object({
  measurements: z.array(z.object({
    metric_name: z.string().optional(),
    name: z.string().optional(),
    measured_value: z.number().optional(),
    value: z.number().optional()
  })).optional()
}).passthrough();

// =============================================================================
// TYPE INFERENCE FROM ZOD SCHEMAS
// =============================================================================

export type BleedInputs = z.infer<typeof BleedInputsSchema>;
export type MonetaryValue = z.infer<typeof MonetaryValueSchema>;
export type BleedCalculation = z.infer<typeof BleedCalculationSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type ExtractedIntake = z.infer<typeof ExtractedIntakeSchema>;
export type ExtractedMeasurements = z.infer<typeof ExtractedMeasurementsSchema>;

// =============================================================================
// VALIDATION GATE FUNCTIONS
// =============================================================================

/**
 * Validate bleed calculation inputs
 *
 * CRITICAL: This is the gate that would have prevented the $10.7M bug.
 *
 * @param inputs - Bleed inputs from estimate calculation
 * @param options - Validation options
 * @returns Validated inputs
 * @throws Error if validation fails
 */
export function validateBleedInputsGate(
  inputs: any,
  options: ValidationOptions = {}
): ValidationResult<BleedInputs> {
  const {throwOnError = getDefaultThrowBehavior(), logWarnings = true} = options;

  const result = BleedInputsSchema.safeParse(inputs);

  if (!result.success) {
    const errors = result.error.issues.map(e =>
      `${e.path.join('.')}: ${e.message}`
    );

    const errorMessage = `BLEED INPUT VALIDATION FAILED:\n${errors.join('\n')}`;

    if (logWarnings) {
      console.error('❌ ' + errorMessage);
      console.error('Input received:', JSON.stringify(inputs, null, 2));
    }

    if (throwOnError) {
      throw new Error(errorMessage);
    }

    return {valid: false, errors, data: inputs};
  }

  if (logWarnings) {
    console.log('✓ Bleed inputs validated successfully');
  }

  return {valid: true, errors: [], data: result.data};
}

/**
 * Validate bleed calculation output
 *
 * @param bleed - Bleed calculation result
 * @param options - Validation options
 * @returns Validation result
 */
export function validateBleedOutputGate(
  bleed: any,
  options: ValidationOptions = {}
): ValidationResult<BleedCalculation> {
  const {throwOnError = getDefaultThrowBehavior(), logWarnings = true} = options;

  // Handle legacy format where total is just a number
  let normalizedBleed = bleed;
  if (typeof bleed?.total === 'number') {
    normalizedBleed = {
      ...bleed,
      total: {
        amount: bleed.total,
        currency: 'USD',
        period: 'monthly'
      }
    };
  }

  const result = BleedCalculationSchema.safeParse(normalizedBleed);

  if (!result.success) {
    const errors = result.error.issues.map(e =>
      `${e.path.join('.')}: ${e.message}`
    );

    if (logWarnings) {
      console.warn('⚠️ Bleed output validation warnings:', errors);
    }

    if (throwOnError) {
      throw new Error(`Bleed output validation failed:\n${errors.join('\n')}`);
    }

    return {valid: false, errors, data: bleed};
  }

  return {valid: true, errors: [], data: result.data};
}

/**
 * Validate extraction output before proceeding to research stage
 *
 * CRITICAL: This gate ensures the LLM extraction produced usable data.
 * Prevents "Unknown Client" and empty workflow bugs from propagating.
 *
 * @param intake - Extracted intake data
 * @param measurements - Extracted measurements data
 * @param options - Validation options
 * @returns Validation result with warnings array
 */
export function validateExtractionGate(
  intake: any,
  measurements: any,
  options: ValidationOptions = {}
): ValidationResult<{intake: ExtractedIntake; measurements: ExtractedMeasurements}> {
  const {throwOnError = getDefaultThrowBehavior(), logWarnings = true} = options;

  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate intake structure
  const intakeResult = ExtractedIntakeSchema.safeParse(intake);
  if (!intakeResult.success) {
    for (const issue of intakeResult.error.issues) {
      errors.push(`intake.${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Validate measurements structure (optional but warn if empty)
  const measurementsResult = ExtractedMeasurementsSchema.safeParse(measurements);
  if (!measurementsResult.success) {
    for (const issue of measurementsResult.error.issues) {
      warnings.push(`measurements.${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Additional semantic checks
  const clientName = intake?.prepared_for?.account_name || intake?.client?.name;
  const workflowName = intake?.section_a_workflow_definition?.q01_workflow_name || intake?.project?.workflow_name;

  // Warn if client name looks like a placeholder
  if (clientName && /^(unknown|client|test|example)/i.test(clientName)) {
    warnings.push(`Client name "${clientName}" appears to be a placeholder`);
  }

  // Warn if workflow name looks like a placeholder
  if (workflowName && /^(unknown|workflow|test|example)/i.test(workflowName)) {
    warnings.push(`Workflow name "${workflowName}" appears to be a placeholder`);
  }

  // Warn if no measurements found
  const measurementCount = measurements?.measurements?.length || 0;
  if (measurementCount === 0) {
    warnings.push('No measurements extracted - bleed calculations may be inaccurate');
  }

  // Log results
  if (logWarnings) {
    if (errors.length > 0) {
      console.error('❌ EXTRACTION VALIDATION FAILED:');
      for (const e of errors) {
        console.error(`   - ${e}`);
      }
    }
    if (warnings.length > 0) {
      console.warn('⚠️ Extraction warnings:');
      for (const w of warnings) {
        console.warn(`   - ${w}`);
      }
    }
    if (errors.length === 0 && warnings.length === 0) {
      console.log('✓ Extraction validation passed');
    }
  }

  // Handle errors based on environment
  if (errors.length > 0 && throwOnError) {
    throw new Error(`Extraction validation failed:\n${errors.join('\n')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: {intake, measurements}
  };
}

/**
 * Validate tier assessment
 *
 * @param tier - Tier assessment from research
 * @param options - Validation options
 * @returns Validation result
 */
export function validateTierGate(
  tier: any,
  options: ValidationOptions = {}
): ValidationResult<Tier> {
  const {throwOnError = getDefaultThrowBehavior(), logWarnings = true} = options;

  const result = TierSchema.safeParse(tier);

  if (!result.success) {
    const errors = result.error.issues.map(e =>
      `${e.path.join('.')}: ${e.message}`
    );

    if (logWarnings) {
      console.warn('⚠️ Tier validation warnings:', errors);
    }

    if (throwOnError) {
      throw new Error(`Tier validation failed:\n${errors.join('\n')}`);
    }

    return {valid: false, errors, data: tier};
  }

  return {valid: true, errors: [], data: result.data};
}

/**
 * Validate monetary amount with sanity check
 *
 * @param amount - Dollar amount
 * @param label - Description for errors
 * @param options - Bounds options
 * @returns Validated amount
 */
export function validateMonetaryAmount(
  amount: number,
  label: string = 'amount',
  options: MonetaryAmountOptions = {}
): number {
  const {maxAmount = 100_000_000, minAmount = 0} = options;

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new TypeError(`${label} is not a valid number: ${amount}`);
  }

  if (amount < minAmount) {
    throw new Error(`${label} (${amount}) is below minimum (${minAmount})`);
  }

  if (amount > maxAmount) {
    throw new Error(
      `${label} ($${amount.toLocaleString()}) exceeds max ($${maxAmount.toLocaleString()}). ` +
      `This may indicate a unit conversion error.`
    );
  }

  return amount;
}

/**
 * Wrap a calculation function with input/output validation
 *
 * @param fn - The calculation function
 * @param inputSchema - Zod schema for inputs
 * @param outputSchema - Zod schema for outputs (optional)
 * @returns Wrapped function with validation
 */
export function withValidation<TInput, TOutput>(
  fn: (input: TInput, ...args: any[]) => TOutput,
  inputSchema: z.ZodSchema<TInput>,
  outputSchema: z.ZodSchema<TOutput> | null = null
): (input: TInput, ...args: any[]) => TOutput {
  return function validatedFn(input: TInput, ...args: any[]): TOutput {
    // Validate first argument as inputs
    if (inputSchema && input) {
      const inputResult = inputSchema.safeParse(input);
      if (!inputResult.success) {
        const errors = inputResult.error.issues.map(e =>
          `${e.path.join('.')}: ${e.message}`
        ).join('\n');
        throw new Error(`Input validation failed:\n${errors}`);
      }
      input = inputResult.data;
    }

    // Execute the function
    const result = fn(input, ...args);

    // Validate output if schema provided
    if (outputSchema && result) {
      const outputResult = outputSchema.safeParse(result);
      if (!outputResult.success) {
        console.warn('Output validation warnings:',
          outputResult.error.issues.map(e => e.message)
        );
      }
    }

    return result;
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateBleedInputsGate,
  validateBleedOutputGate,
  validateExtractionGate,
  validateTierGate,
  validateMonetaryAmount,
  withValidation,

  // Export schemas for advanced usage
  schemas: {
    BleedInputsSchema,
    BleedCalculationSchema,
    MonetaryValueSchema,
    TierSchema,
    ExtractedIntakeSchema,
    ExtractedMeasurementsSchema
  }
};
