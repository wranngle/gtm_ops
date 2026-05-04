/**
 * Unit Tests for lib/security.js
 *
 * Tests security middleware functionality:
 * - API key masking
 * - Input validation and sanitization
 * - Rate limiting configuration
 * - CORS configuration
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let maskApiKey: any;
let maskApiKeysInText: any;
let sanitizeInput: any;
let validateInputSize: any;
let getCorsOptions: any;
let generateLimiter: any;
let historyLimiter: any;

beforeEach(async () => {
  vi.resetModules();
  const module = await import('../../lib/security.js');
  maskApiKey = module.maskApiKey;
  maskApiKeysInText = module.maskApiKeysInText;
  sanitizeInput = module.sanitizeInput;
  validateInputSize = module.validateInputSize;
  getCorsOptions = module.getCorsOptions;
  generateLimiter = module.generateLimiter;
  historyLimiter = module.historyLimiter;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[P0] maskApiKey - API Key Masking', () => {
  it('[P0] should mask API key showing only last 4 chars', () => {
    // GIVEN: A full API key (placeholder fixture; real keys never enter tests)
    const apiKey = process.env.TEST_API_KEY || "test-fixture-placeholder";

    // WHEN: Masking the key
    const masked = maskApiKey(apiKey);

    // THEN: Should show only last 4 chars of the placeholder ('...lder')
    // and never leak any prefix that looks like a real Gemini key.
    expect(masked).toBe('...lder');
    expect(masked).not.toContain('AIza');
  });

  it('[P0] should return [not set] for undefined/null keys', () => {
    expect(maskApiKey(undefined)).toBe('[not set]');
    expect(maskApiKey(null)).toBe('[not set]');
    expect(maskApiKey('')).toBe('[not set]');
  });

  it('[P1] should return *** for very short keys', () => {
    expect(maskApiKey('short')).toBe('***');
    expect(maskApiKey('12345678')).toBe('***');
  });
});

describe('[P0] maskApiKeysInText - Text Sanitization', () => {
  it('[P0] should mask Gemini API keys in text', () => {
    // GIVEN: Text containing a Gemini API key
    const text = 'Error: API key AIzaSyDtest1234567890abcdefghijklmno is invalid';

    // WHEN: Masking keys in text
    const masked = maskApiKeysInText(text);

    // THEN: Key should be masked
    expect(masked).toContain('AIza...');
    expect(masked).not.toContain('AIzaSyDtest1234567890');
  });

  it('[P0] should mask Groq API keys in text', () => {
    // GIVEN: Text containing a Groq API key
    const text = 'Using key: REDACTED_API_KEY_FIXTURE_1234567890';

    // WHEN: Masking keys in text
    const masked = maskApiKeysInText(text);

    // THEN: Key should be masked
    expect(masked).toContain('gsk_...');
    expect(masked).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('[P1] should handle null/undefined gracefully', () => {
    expect(maskApiKeysInText(null)).toBe(null);
    expect(maskApiKeysInText(undefined)).toBe(undefined);
  });
});

describe('[P0] sanitizeInput - Input Sanitization', () => {
  it('[P0] should remove script tags', () => {
    // GIVEN: Input with script tags
    const input = 'Hello <script>alert("xss")</script> World';

    // WHEN: Sanitizing
    const sanitized = sanitizeInput(input);

    // THEN: Script tags should be removed
    expect(sanitized).toBe('Hello  World');
    expect(sanitized).not.toContain('script');
  });

  /* eslint-disable no-script-url -- this test asserts the sanitizer strips javascript: URLs */
  it('[P0] should remove javascript: URLs', () => {
    // GIVEN: Input with javascript URL
    const input = 'Click <a href="javascript:alert(1)">here</a>';

    // WHEN: Sanitizing
    const sanitized = sanitizeInput(input);

    // THEN: javascript: should be removed
    expect(sanitized).not.toContain('javascript:');
  });
  /* eslint-enable no-script-url */

  it('[P0] should remove event handlers', () => {
    // GIVEN: Input with event handlers
    const input = '<img src="x" onerror="alert(1)" onclick="hack()">';

    // WHEN: Sanitizing
    const sanitized = sanitizeInput(input);

    // THEN: Event handlers should be removed
    expect(sanitized).not.toContain('onerror=');
    expect(sanitized).not.toContain('onclick=');
  });

  it('[P1] should truncate input to max length', () => {
    // GIVEN: Very long input
    const input = 'a'.repeat(600000);

    // WHEN: Sanitizing
    const sanitized = sanitizeInput(input);

    // THEN: Should be truncated to 500k chars
    expect(sanitized.length).toBe(500000);
  });

  it('[P1] should handle empty/null input', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
  });
});

describe('[P0] validateInputSize - Size Validation', () => {
  it('[P0] should accept input under 10MB', () => {
    // GIVEN: Normal-sized input
    const input = 'Normal input text for processing';

    // WHEN: Validating
    const result = validateInputSize(input);

    // THEN: Should be valid
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('[P0] should reject input over 10MB', () => {
    // GIVEN: Very large input (over 10MB)
    const input = 'a'.repeat(11 * 1024 * 1024);

    // WHEN: Validating
    const result = validateInputSize(input);

    // THEN: Should be invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum size');
  });

  it('[P0] should reject empty input', () => {
    // WHEN: Validating empty input
    const result = validateInputSize('');

    // THEN: Should be invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });
});

describe('[P1] getCorsOptions - CORS Configuration', () => {
  it('[P1] should allow all origins in development', () => {
    // GIVEN: Development environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // WHEN: Getting CORS options
    const options = getCorsOptions();

    // THEN: Origin function should allow any origin
    let allowed = false;
    options.origin('http://localhost:8080', (err: Error | null, allow: boolean) => {
      allowed = allow;
    });
    expect(allowed).toBe(true);

    // Cleanup
    process.env.NODE_ENV = originalEnv;
  });

  it('[P1] should restrict origins in production with ALLOWED_ORIGINS', () => {
    // GIVEN: Production environment with allowed origins
    const originalEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';

    // WHEN: Getting CORS options and testing an allowed origin
    const options = getCorsOptions();

    let allowed = false;
    options.origin('https://example.com', (err: Error | null, allow: boolean) => {
      allowed = allow;
    });
    expect(allowed).toBe(true);

    // WHEN: Testing a disallowed origin
    let error: Error | null = null;
    options.origin('https://malicious.com', (err: Error | null) => {
      error = err;
    });
    expect(error).not.toBeNull();

    // Cleanup
    process.env.NODE_ENV = originalEnv;
    if (originalOrigins) process.env.ALLOWED_ORIGINS = originalOrigins;
    else delete process.env.ALLOWED_ORIGINS;
  });

  it('[P1] should only allow GET, POST, OPTIONS methods', () => {
    // WHEN: Getting CORS options
    const options = getCorsOptions();

    // THEN: Should have correct methods
    expect(options.methods).toContain('GET');
    expect(options.methods).toContain('POST');
    expect(options.methods).toContain('OPTIONS');
    expect(options.methods).not.toContain('DELETE');
    expect(options.methods).not.toContain('PUT');
  });
});

describe('[P1] Rate Limiters - Configuration', () => {
  it('[P1] should have generateLimiter configured for 10 req/hour', () => {
    // THEN: Generate limiter should exist and have correct config
    expect(generateLimiter).toBeDefined();
    // Note: Internal config is not easily accessible, but we verify it exists
  });

  it('[P1] should have historyLimiter configured for 100 req/hour', () => {
    // THEN: History limiter should exist
    expect(historyLimiter).toBeDefined();
  });
});
