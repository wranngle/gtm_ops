/**
 * Resilience Module
 * Provides retry logic with exponential backoff and circuit breaker pattern.
 *
 * @module lib/resilience
 */

// =============================================================================
// RETRY WITH EXPONENTIAL BACKOFF
// =============================================================================

/**
 * @typedef {Object} RetryOptions
 * @property {number} [maxAttempts=5] - Maximum number of retry attempts
 * @property {number} [baseDelayMs=1000] - Base delay in milliseconds (doubles each retry)
 * @property {number} [maxDelayMs=30000] - Maximum delay cap in milliseconds
 * @property {number} [timeoutMs=60000] - Request timeout in milliseconds
 * @property {(error: Error) => boolean} [isRetryable] - Function to determine if error is retryable
 * @property {(attempt: number, delay: number, error: Error) => void} [onRetry] - Callback on each retry
 */

/**
 * Default function to determine if an error is retryable
 * @param {Error} error
 * @returns {boolean}
 */
export function defaultIsRetryable(error) {
  const message = error.message || '';
  const retryablePatterns = [
    '429',           // Rate limit
    '503',           // Service unavailable
    '502',           // Bad gateway
    '504',           // Gateway timeout
    'ECONNRESET',    // Connection reset
    'ETIMEDOUT',     // Timeout
    'ENOTFOUND',     // DNS lookup failed
    'fetch failed',  // Network error
    'network',       // Generic network
    'timeout',       // Timeout
    'rate limit',    // Rate limit text
    'quota',         // Quota exceeded
    'RESOURCE_EXHAUSTED', // Google API rate limit
    'temporarily unavailable'
  ];

  return retryablePatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @param {number} maxDelayMs - Maximum delay cap
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt, baseDelayMs = 1000, maxDelayMs = 30_000) {
  // Exponential: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * 2**attempt;

  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);

  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Execute a function with retry logic and exponential backoff
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {RetryOptions} [options={}] - Retry options
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    timeoutMs = 60_000,
    isRetryable = defaultIsRetryable,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Wrap function with timeout
      const result = await withTimeout(fn(), timeoutMs);
      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!isRetryable(error)) {
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt >= maxAttempts - 1) {
        break;
      }

      // Calculate delay
      const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, delay, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Wrap a promise with a timeout
 * @template T
 * @param {Promise<T>} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<T>}
 */
export function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Sleep for specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

/**
 * Circuit breaker states
 * @readonly
 * @enum {string}
 */
export const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation, requests flow through
  OPEN: 'OPEN',         // Circuit tripped, requests fail fast
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * @typedef {Object} CircuitBreakerOptions
 * @property {number} [failureThreshold=5] - Failures to trip circuit
 * @property {number} [failureWindowMs=60000] - Time window to count failures (1 min)
 * @property {number} [resetTimeoutMs=300000] - Time before trying again (5 min)
 * @property {number} [halfOpenMaxAttempts=1] - Requests to allow in half-open
 * @property {(state: string, stats: Object) => void} [onStateChange] - State change callback
 */

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  /**
   * @param {CircuitBreakerOptions} options
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.failureWindowMs = options.failureWindowMs || 60_000;
    this.resetTimeoutMs = options.resetTimeoutMs || 300_000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 1;
    this.onStateChange = options.onStateChange || null;

    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    this.failureCount = 0;
  }

  /**
   * Get current circuit state
   * @returns {string}
   */
  getState() {
    this._checkStateTransition();
    return this.state;
  }

  /**
   * Get circuit statistics
   * @returns {Object}
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      recentFailures: this.failures.length,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts
    };
  }

  /**
   * Check if circuit allows request
   * @returns {boolean}
   */
  canRequest() {
    this._checkStateTransition();

    switch (this.state) {
      case CircuitState.CLOSED: {
        return true;
      }

      case CircuitState.OPEN: {
        return false;
      }

      case CircuitState.HALF_OPEN: {
        return this.halfOpenAttempts < this.halfOpenMaxAttempts;
      }

      default: {
        return true;
      }
    }
  }

  /**
   * Execute a function through the circuit breaker
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @param {T} [fallback] - Fallback value when circuit is open
   * @returns {Promise<T>}
   */
  async execute(fn, fallback = null) {
    if (!this.canRequest()) {
      if (fallback !== null) {
        return fallback;
      }

      throw new Error(`Circuit breaker is ${this.state}`);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure(error);
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;

    if (previousState !== CircuitState.CLOSED && this.onStateChange) {
      this.onStateChange(CircuitState.CLOSED, this.getStats());
    }
  }

  /**
   * Record a successful request
   * @private
   */
  _recordSuccess() {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Success in half-open state, close the circuit
      const previousState = this.state;
      this.state = CircuitState.CLOSED;
      this.failures = [];
      this.halfOpenAttempts = 0;

      if (this.onStateChange) {
        this.onStateChange(CircuitState.CLOSED, this.getStats());
      }
    }
  }

  /**
   * Record a failed request
   * @private
   * @param {Error} error
   */
  _recordFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Add to failures array with timestamp
    this.failures.push({
      timestamp: this.lastFailureTime,
      error: error.message
    });

    // Remove old failures outside the window
    const windowStart = Date.now() - this.failureWindowMs;
    this.failures = this.failures.filter(f => f.timestamp >= windowStart);

    // Check if we should trip the circuit
    if (this.state === CircuitState.CLOSED && this.failures.length >= this.failureThreshold) {
      this._tripCircuit();
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Failure in half-open state, reopen the circuit
      this._tripCircuit();
    }
  }

  /**
   * Trip the circuit to OPEN state
   * @private
   */
  _tripCircuit() {
    const previousState = this.state;
    this.state = CircuitState.OPEN;

    if (previousState !== CircuitState.OPEN && this.onStateChange) {
      this.onStateChange(CircuitState.OPEN, this.getStats());
    }
  }

  /**
   * Check if state should transition
   * @private
   */
  _checkStateTransition() {
    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.resetTimeoutMs) {
        const previousState = this.state;
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;

        if (this.onStateChange) {
          this.onStateChange(CircuitState.HALF_OPEN, this.getStats());
        }
      }
    }
  }
}

// =============================================================================
// COMBINED RESILIENT EXECUTOR
// =============================================================================

/**
 * @typedef {Object} ResilientExecutorOptions
 * @property {RetryOptions} [retry] - Retry options
 * @property {CircuitBreakerOptions} [circuitBreaker] - Circuit breaker options
 * @property {boolean} [useCircuitBreaker=true] - Whether to use circuit breaker
 */

/**
 * Execute a function with retry and circuit breaker protection
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {CircuitBreaker} [circuitBreaker] - Circuit breaker instance
 * @param {RetryOptions} [retryOptions={}] - Retry options
 * @returns {Promise<T>}
 */
export async function withResilience(fn, circuitBreaker = null, retryOptions = {}) {
  const executeWithRetry = () => withRetry(fn, retryOptions);

  if (circuitBreaker) {
    return circuitBreaker.execute(executeWithRetry);
  }

  return executeWithRetry();
}

// =============================================================================
// GEMINI API SPECIFIC HELPERS
// =============================================================================

/**
 * Default retry options for Gemini API calls
 */
export const GEMINI_RETRY_OPTIONS = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 16_000,
  timeoutMs: 60_000,
  isRetryable(error) {
    const message = error.message || '';
    return (
      message.includes('429') ||
      message.includes('503') ||
      message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('timeout')
    );
  }
};

/**
 * Default retry options for Puppeteer/PDF generation
 */
export const PUPPETEER_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 10_000,
  timeoutMs: 120_000, // 2 minutes for PDF generation
  isRetryable(error) {
    const message = error.message || '';
    return (
      message.includes('timeout') ||
      message.includes('Navigation') ||
      message.includes('Protocol error') ||
      message.includes('Target closed')
    );
  }
};

/**
 * Default circuit breaker options for Gemini API
 */
export const GEMINI_CIRCUIT_BREAKER_OPTIONS = {
  failureThreshold: 5,
  failureWindowMs: 60_000,  // 1 minute
  resetTimeoutMs: 300_000,  // 5 minutes
  halfOpenMaxAttempts: 1
};
