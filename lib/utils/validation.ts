/**
 * Validation Gate Middleware - Environment-based enforcement (ADR-003)
 * @module lib/utils/validation
 *
 * Backed by ArkType. Exposes a zod-style result shape (`{success, data, errors}`)
 * so consumers can switch progressively from `Schema.safeParse(x)` →
 * `safeValidate(Schema, x)` without rewriting every error-handling block.
 */

import { type } from 'arktype';
import { PipelineError, ErrorCodes } from './errors.js';
import { logger } from './logger.js';

export type ValidationMode = 'strict' | 'permissive';

export type ValidationResult<T> = {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  warnings?: string[];
};

export type ValidationError = {
  path: string;
  message: string;
  code: string;
};

// ArkType `Type` instances are callable; we use the structural shape to keep
// generics inference-friendly without depending on internal ArkType types.
type ArkSchema<T = unknown> = ((data: unknown) => T | type.errors) & { infer: T };

function formatArkErrors(errors: type.errors): ValidationError[] {
  // type.errors is an iterable of ArkErrors; each has .path, .message, .code
  return [...errors].map((issue: any) => ({
    path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? ''),
    message: typeof issue.message === 'string' ? issue.message : String(issue),
    code: typeof issue.code === 'string' ? issue.code : 'invalid',
  }));
}

function getValidationMode(): ValidationMode {
  if (process.env.VALIDATION_MODE === 'strict') return 'strict';
  if (process.env.VALIDATION_MODE === 'permissive') return 'permissive';
  return process.env.NODE_ENV === 'production' ? 'strict' : 'permissive';
}

/**
 * Validates data at a pipeline stage boundary.
 *
 * In strict mode (production): throws PipelineError on failure.
 * In permissive mode (development): logs warning, returns data anyway.
 */
export function validateAtBoundary<T>(
  schema: ArkSchema<T>,
  data: unknown,
  options: {
    stage: string;
    field?: string;
    mode?: ValidationMode;
    correlationId?: string;
  }
): T {
  const mode = options.mode ?? getValidationMode();
  const result = schema(data);

  if (!(result instanceof type.errors)) {
    return result;
  }

  const errors = formatArkErrors(result);
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

  logger.warn(`Validation warning in ${options.stage}`, { errors, mode: 'permissive' });
  return data as T;
}

/**
 * Safe validation that never throws — returns result object.
 */
export function safeValidate<T>(
  schema: ArkSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema(data);
  if (!(result instanceof type.errors)) {
    return { success: true, data: result };
  }
  return { success: false, errors: formatArkErrors(result) };
}

/**
 * Validates and provides default values for missing fields.
 */
export function validateWithDefaults<T>(
  schema: ArkSchema<T>,
  data: unknown,
  defaults: Partial<T>
): T {
  const merged = { ...defaults, ...(data as Record<string, unknown>) };
  const result = schema(merged);
  if (result instanceof type.errors) {
    throw new Error(`Validation failed: ${result.summary}`);
  }
  return result;
}

/**
 * Batch validates multiple items, collecting all errors.
 */
export function batchValidate<T>(
  schema: ArkSchema<T>,
  items: unknown[],
  options: { stage: string }
): { valid: T[]; invalid: Array<{ index: number; errors: ValidationError[] }> } {
  const valid: T[] = [];
  const invalid: Array<{ index: number; errors: ValidationError[] }> = [];

  for (const [index, item] of items.entries()) {
    const result = schema(item);
    if (result instanceof type.errors) {
      invalid.push({ index, errors: formatArkErrors(result) });
    } else {
      valid.push(result);
    }
  }

  if (invalid.length > 0) {
    logger.warn(`Batch validation: ${invalid.length}/${items.length} items invalid`, {
      stage: options.stage,
      invalidIndices: invalid.map((i) => i.index),
    });
  }

  return { valid, invalid };
}
