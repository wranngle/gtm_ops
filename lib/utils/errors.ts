/**
 * Error Sanitization - Prevents API key leakage (ADR-004)
 * @module lib/utils/errors
 */

// Patterns that match API keys - NEVER let these appear in logs
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z\d]{20,}/g,           // OpenAI
  /AIza[\w-]{35}/g,         // Google
  /gsk_[a-zA-Z\d]{50,}/g,          // Groq
  /xai-[a-zA-Z\d]{50,}/g,          // xAI
  /bearer [\w.-]+/gi,       // Bearer tokens
  /api[_-]?key[=:]\s*["']?[\w-]+["']?/gi,
];

/**
 * Sanitizes a string by replacing sensitive patterns with [REDACTED]
 */
export function sanitize(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }

  return result;
}

/**
 * Structured pipeline error with context for debugging
 */
export class PipelineError extends Error {
  readonly code: string;
  readonly stage: string;
  readonly field?: string;
  readonly suggestion?: string;
  readonly correlationId: string;

  constructor(options: {
    code: string;
    message: string;
    stage: string;
    field?: string;
    suggestion?: string;
    correlationId?: string;
    cause?: Error;
  }) {
    super(sanitize(options.message));
    this.name = 'PipelineError';
    this.code = options.code;
    this.stage = options.stage;
    this.field = options.field;
    this.suggestion = options.suggestion;
    this.correlationId = options.correlationId ?? generateCorrelationId();
    this.cause = options.cause;

    // Sanitize the stack trace too
    this.stack &&= sanitize(this.stack);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      stage: this.stage,
      field: this.field,
      suggestion: this.suggestion,
      correlationId: this.correlationId,
    };
  }

  toString() {
    let msg = `[${this.code}] ${this.message}`;
    if (this.field) msg += ` (field: ${this.field})`;
    if (this.suggestion) msg += `\n  Suggestion: ${this.suggestion}`;
    return msg;
  }
}

/**
 * Wraps any error as a PipelineError with sanitization
 */
export function wrapError(
  error: unknown,
  stage: string,
  correlationId?: string
): PipelineError {
  if (error instanceof PipelineError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new PipelineError({
    code: 'UNEXPECTED_ERROR',
    message,
    stage,
    correlationId,
    cause,
  });
}

/**
 * Generates a short correlation ID for tracing
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Common error codes
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  RESEARCH_FAILED: 'RESEARCH_FAILED',
  ESTIMATE_FAILED: 'ESTIMATE_FAILED',
  RENDER_FAILED: 'RENDER_FAILED',
  PDF_FAILED: 'PDF_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  LLM_ERROR: 'LLM_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const;
