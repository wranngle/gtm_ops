/**
 * Validation Gate Middleware - Environment-based enforcement (ADR-003)
 * @module lib/utils/validation
 */

import { z, ZodError } from 'zod';
import { PipelineError, ErrorCodes } from './errors.js';
import { logger } from './logger.js';

export type ValidationMode = 'strict' | 'permissive';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  warnings?: string[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Formats Zod errors into a readable array
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Gets validation mode from environment
 */
function getValidationMode(): ValidationMode {
  if (process.env.VALIDATION_MODE === 'strict') return 'strict';
  if (process.env.VALIDATION_MODE === 'permissive') return 'permissive';
  return process.env.NODE_ENV === 'production' ? 'strict' : 'permissive';
}

/**
 * Validates data at a pipeline stage boundary.
 *
 * In strict mode (production): throws PipelineError on failure
 * In permissive mode (development): logs warning, returns data anyway
 */
export function validateAtBoundary<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  options: {
    stage: string;
    field?: string;
    mode?: ValidationMode;
    correlationId?: string;
  }
): z.infer<T> {
  const mode = options.mode ?? getValidationMode();
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const errors = formatZodErrors(result.error);
  const errorSummary = errors.map((e) => `${e.path}: ${e.message}`).join('; ');

  if (mode === 'strict') {
    throw new PipelineError({
      code: ErrorCodes.VALIDATION_FAILED,
      message: `Validation failed: ${errorSummary}`,
      stage: options.stage,
      field: options.field ?? errors[0]?.path,
      suggestion: `Check the data structure matches the expected schema for ${options.stage}`,
      correlationId: options.correlationId,
    });
  }

  // Permissive mode: log and continue
  logger.warn(`Validation warning in ${options.stage}`, {
    errors,
    mode: 'permissive',
  });

  // Return the original data (unsafe but permissive)
  return data as z.infer<T>;
}

/**
 * Safe validation that never throws - returns result object
 */
export function safeValidate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * Validates and provides default values for missing fields
 */
export function validateWithDefaults<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  defaults: Partial<z.infer<T>>
): z.infer<T> {
  const merged = { ...defaults, ...(data as object) };
  return schema.parse(merged);
}

/**
 * Batch validates multiple items, collecting all errors
 */
export function batchValidate<T extends z.ZodTypeAny>(
  schema: T,
  items: unknown[],
  options: { stage: string }
): { valid: z.infer<T>[]; invalid: Array<{ index: number; errors: ValidationError[] }> } {
  const valid: z.infer<T>[] = [];
  const invalid: Array<{ index: number; errors: ValidationError[] }> = [];

  items.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({ index, errors: formatZodErrors(result.error) });
    }
  });

  if (invalid.length > 0) {
    logger.warn(`Batch validation: ${invalid.length}/${items.length} items invalid`, {
      stage: options.stage,
      invalidIndices: invalid.map((i) => i.index),
    });
  }

  return { valid, invalid };
}
