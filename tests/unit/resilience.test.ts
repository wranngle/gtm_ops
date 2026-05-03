/**
 * Unit Tests for lib/resilience.js
 *
 * Tests error recovery functionality:
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Circuit breaker pattern
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let withRetry: any;
let withTimeout: any;
let calculateBackoff: any;
let defaultIsRetryable: any;
let CircuitBreaker: any;
let CircuitState: any;
let GEMINI_RETRY_OPTIONS: any;
let PUPPETEER_RETRY_OPTIONS: any;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const module = await import('../../lib/resilience.js');
  withRetry = module.withRetry;
  withTimeout = module.withTimeout;
  calculateBackoff = module.calculateBackoff;
  defaultIsRetryable = module.defaultIsRetryable;
  CircuitBreaker = module.CircuitBreaker;
  CircuitState = module.CircuitState;
  GEMINI_RETRY_OPTIONS = module.GEMINI_RETRY_OPTIONS;
  PUPPETEER_RETRY_OPTIONS = module.PUPPETEER_RETRY_OPTIONS;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('[P0] calculateBackoff - Exponential Backoff', () => {
  it('[P0] should double delay with each attempt', () => {
    // GIVEN: Base delay of 1000ms
    const baseDelay = 1000;

    // WHEN: Calculating backoff for attempts 0, 1, 2
    // Note: There's jitter, so we check the range
    const delay0 = calculateBackoff(0, baseDelay, 30000);
    const delay1 = calculateBackoff(1, baseDelay, 30000);
    const delay2 = calculateBackoff(2, baseDelay, 30000);

    // THEN: Delays should roughly double (within jitter range)
    expect(delay0).toBeGreaterThanOrEqual(750);
    expect(delay0).toBeLessThanOrEqual(1250);

    expect(delay1).toBeGreaterThanOrEqual(1500);
    expect(delay1).toBeLessThanOrEqual(2500);

    expect(delay2).toBeGreaterThanOrEqual(3000);
    expect(delay2).toBeLessThanOrEqual(5000);
  });

  it('[P0] should cap at maxDelay', () => {
    // GIVEN: Max delay of 5000ms
    const maxDelay = 5000;

    // WHEN: Calculating backoff for high attempt number
    const delay = calculateBackoff(10, 1000, maxDelay);

    // THEN: Should not exceed max
    expect(delay).toBeLessThanOrEqual(maxDelay);
  });

  it('[P1] should add jitter to prevent thundering herd', () => {
    // GIVEN: Same parameters
    const baseDelay = 1000;
    const maxDelay = 30000;

    // WHEN: Calculating multiple backoffs for same attempt
    const delays = Array.from({ length: 10 }, () =>
      calculateBackoff(2, baseDelay, maxDelay)
    );

    // THEN: Delays should vary (not all identical)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});

describe('[P0] defaultIsRetryable - Error Classification', () => {
  it('[P0] should identify rate limit errors as retryable', () => {
    expect(defaultIsRetryable(new Error('HTTP 429 Too Many Requests'))).toBe(true);
    expect(defaultIsRetryable(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(defaultIsRetryable(new Error('rate limit exceeded'))).toBe(true);
    expect(defaultIsRetryable(new Error('quota exceeded'))).toBe(true);
  });

  it('[P0] should identify network errors as retryable', () => {
    expect(defaultIsRetryable(new Error('fetch failed'))).toBe(true);
    expect(defaultIsRetryable(new Error('network error'))).toBe(true);
    expect(defaultIsRetryable(new Error('ECONNRESET'))).toBe(true);
    expect(defaultIsRetryable(new Error('ETIMEDOUT'))).toBe(true);
  });

  it('[P0] should identify service errors as retryable', () => {
    expect(defaultIsRetryable(new Error('HTTP 503 Service Unavailable'))).toBe(true);
    expect(defaultIsRetryable(new Error('HTTP 502 Bad Gateway'))).toBe(true);
    expect(defaultIsRetryable(new Error('temporarily unavailable'))).toBe(true);
  });

  it('[P0] should not retry non-retryable errors', () => {
    expect(defaultIsRetryable(new Error('Invalid API key'))).toBe(false);
    expect(defaultIsRetryable(new Error('HTTP 400 Bad Request'))).toBe(false);
    expect(defaultIsRetryable(new Error('Validation failed'))).toBe(false);
  });
});

describe('[P0] withRetry - Retry Logic', () => {
  it('[P0] should succeed on first attempt if no error', async () => {
    // GIVEN: A function that succeeds
    const fn = vi.fn().mockResolvedValue('success');

    // WHEN: Executing with retry
    vi.useRealTimers(); // Use real timers for this test
    const result = await withRetry(fn, { maxAttempts: 3 });

    // THEN: Should return result and call fn once
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('[P0] should retry on retryable errors', async () => {
    vi.useRealTimers();

    // GIVEN: A function that fails twice then succeeds
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValue('success');

    // WHEN: Executing with retry
    const result = await withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 10, // Small delay for testing
      maxDelayMs: 50
    });

    // THEN: Should succeed after retries
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('[P0] should throw after max attempts exhausted', async () => {
    vi.useRealTimers();

    // GIVEN: A function that always fails with retryable error
    const fn = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));

    // WHEN/THEN: Should throw after max attempts
    await expect(withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 50
    })).rejects.toThrow('Failed after 3 attempts');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('[P0] should not retry non-retryable errors', async () => {
    vi.useRealTimers();

    // GIVEN: A function that fails with non-retryable error
    const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));

    // WHEN/THEN: Should throw immediately
    await expect(withRetry(fn, { maxAttempts: 5 })).rejects.toThrow('Invalid API key');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('[P1] should call onRetry callback', async () => {
    vi.useRealTimers();

    // GIVEN: A function that fails then succeeds
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    // WHEN: Executing with retry
    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      onRetry
    });

    // THEN: onRetry should be called
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Error));
  });
});

describe('[P0] withTimeout - Timeout Handling', () => {
  it('[P0] should resolve if promise completes before timeout', async () => {
    vi.useRealTimers();

    // GIVEN: A fast promise
    const promise = Promise.resolve('fast');

    // WHEN: Wrapping with timeout
    const result = await withTimeout(promise, 1000);

    // THEN: Should return result
    expect(result).toBe('fast');
  });

  it('[P0] should reject if promise exceeds timeout', async () => {
    vi.useRealTimers();

    // GIVEN: A slow promise
    const promise = new Promise(resolve => setTimeout(() => resolve('slow'), 200));

    // WHEN/THEN: Should timeout
    await expect(withTimeout(promise, 50)).rejects.toThrow('timed out after 50ms');
  });
});

describe('[P0] CircuitBreaker - Circuit Breaker Pattern', () => {
  it('[P0] should start in CLOSED state', () => {
    // GIVEN: A new circuit breaker
    const cb = new CircuitBreaker();

    // THEN: Should be closed
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.canRequest()).toBe(true);
  });

  it('[P0] should trip to OPEN after failure threshold', async () => {
    vi.useRealTimers();

    // GIVEN: Circuit breaker with low threshold
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      failureWindowMs: 60000
    });

    // WHEN: Recording failures up to threshold
    const failingFn = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    // THEN: Circuit should be open
    expect(cb.getState()).toBe(CircuitState.OPEN);
    expect(cb.canRequest()).toBe(false);
  });

  it('[P0] should fail fast when OPEN', async () => {
    vi.useRealTimers();

    // GIVEN: An open circuit breaker
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    const failingFn = () => Promise.reject(new Error('fail'));

    try {
      await cb.execute(failingFn);
    } catch (e) {
      // Trip the circuit
    }

    // WHEN/THEN: Should fail fast without calling function
    const fn = vi.fn().mockResolvedValue('success');
    await expect(cb.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('[P0] should return fallback when OPEN', async () => {
    vi.useRealTimers();

    // GIVEN: An open circuit breaker
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    const failingFn = () => Promise.reject(new Error('fail'));

    try {
      await cb.execute(failingFn);
    } catch (e) {
      // Trip the circuit
    }

    // WHEN: Providing a fallback
    const result = await cb.execute(() => Promise.resolve('not called'), 'fallback');

    // THEN: Should return fallback
    expect(result).toBe('fallback');
  });

  it('[P0] should transition to HALF_OPEN after reset timeout', async () => {
    vi.useRealTimers();

    // GIVEN: An open circuit breaker with short reset timeout
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100
    });

    const failingFn = () => Promise.reject(new Error('fail'));
    try {
      await cb.execute(failingFn);
    } catch (e) {
      // Trip the circuit
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);

    // WHEN: Waiting for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // THEN: Should be half-open
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    expect(cb.canRequest()).toBe(true);
  });

  it('[P0] should close on success in HALF_OPEN', async () => {
    vi.useRealTimers();

    // GIVEN: A half-open circuit breaker
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50
    });

    try {
      await cb.execute(() => Promise.reject(new Error('fail')));
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    // WHEN: Successful request
    await cb.execute(() => Promise.resolve('success'));

    // THEN: Should be closed
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('[P0] should reopen on failure in HALF_OPEN', async () => {
    vi.useRealTimers();

    // GIVEN: A half-open circuit breaker
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50
    });

    try {
      await cb.execute(() => Promise.reject(new Error('fail')));
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    // WHEN: Failed request
    try {
      await cb.execute(() => Promise.reject(new Error('still failing')));
    } catch (e) {}

    // THEN: Should be open again
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('[P1] should track statistics', async () => {
    vi.useRealTimers();

    // GIVEN: A circuit breaker
    const cb = new CircuitBreaker({ failureThreshold: 5 });

    // WHEN: Making successful and failed requests
    await cb.execute(() => Promise.resolve('success'));
    await cb.execute(() => Promise.resolve('success'));
    try {
      await cb.execute(() => Promise.reject(new Error('fail')));
    } catch (e) {}

    // THEN: Stats should reflect activity
    const stats = cb.getStats();
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.state).toBe(CircuitState.CLOSED);
  });

  it('[P1] should call onStateChange callback', async () => {
    vi.useRealTimers();

    // GIVEN: Circuit breaker with callback
    const onStateChange = vi.fn();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      onStateChange
    });

    // WHEN: Tripping the circuit
    try {
      await cb.execute(() => Promise.reject(new Error('fail')));
    } catch (e) {}

    // THEN: Callback should be called
    expect(onStateChange).toHaveBeenCalledWith(CircuitState.OPEN, expect.any(Object));
  });

  it('[P1] should allow manual reset', async () => {
    vi.useRealTimers();

    // GIVEN: An open circuit breaker
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    try {
      await cb.execute(() => Promise.reject(new Error('fail')));
    } catch (e) {}

    expect(cb.getState()).toBe(CircuitState.OPEN);

    // WHEN: Manually resetting
    cb.reset();

    // THEN: Should be closed
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.canRequest()).toBe(true);
  });
});

describe('[P1] Default Options', () => {
  it('[P1] should have correct Gemini retry options', () => {
    expect(GEMINI_RETRY_OPTIONS.maxAttempts).toBe(5);
    expect(GEMINI_RETRY_OPTIONS.baseDelayMs).toBe(1000);
    expect(GEMINI_RETRY_OPTIONS.timeoutMs).toBe(60000);
  });

  it('[P1] should have correct Puppeteer retry options', () => {
    expect(PUPPETEER_RETRY_OPTIONS.maxAttempts).toBe(3);
    expect(PUPPETEER_RETRY_OPTIONS.timeoutMs).toBe(120000); // 2 minutes
  });
});
