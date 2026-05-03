/**
 * Utility exports - Cross-cutting concerns
 * @module lib/utils
 */

export {
  createCurrency,
  createPercent,
  createDuration,
  createHours,
  createMultiplier,
  createRatio,
  batchCreateCurrency,
  type NumericWithDisplay,
} from './display.js';

export {
  PipelineError,
  wrapError,
  sanitize,
  generateCorrelationId,
  ErrorCodes,
} from './errors.js';

export { logger, type LogLevel } from './logger.js';

export {
  validateAtBoundary,
  safeValidate,
  validateWithDefaults,
  batchValidate,
  type ValidationMode,
  type ValidationResult,
  type ValidationError,
} from './validation.js';
