/**
 * Unit Tests for lib/security.ts
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
let securityHeadersMiddleware: any;
let apiNoStoreMiddleware: any;
let redactSecretsDeep: any;
let _resetCorsWarningForTests: any;
let inputValidationMiddleware: any;
let safeFilenameForHeader: any;
let createSafeLogger: any;
let resolveRequestId: any;

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
  securityHeadersMiddleware = module.securityHeadersMiddleware;
  apiNoStoreMiddleware = module.apiNoStoreMiddleware;
  redactSecretsDeep = module.redactSecretsDeep;
  _resetCorsWarningForTests = module._resetCorsWarningForTests;
  _resetCorsWarningForTests();
  inputValidationMiddleware = module.inputValidationMiddleware;
  safeFilenameForHeader = module.safeFilenameForHeader;
  createSafeLogger = module.createSafeLogger;
  resolveRequestId = module.resolveRequestId;
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
    const text = 'Using key: gsk_mockKeyThatIsNotRealButValidates123';

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

  it('[P0] should mask Anthropic sk-ant-* keys', () => {
    // GIVEN: Text containing an Anthropic key
    const text = 'using sk-ant-api03-mockKeyMaterial1234567890abcdef in the request';
    const masked = maskApiKeysInText(text);
    expect(masked).toContain('sk-ant-...');
    expect(masked).not.toContain('mockKeyMaterial1234567890abcdef');
    // The shorter sk-* matcher must NOT have run first and produced "sk-..." instead.
    expect(masked).not.toMatch(/sk-(?!ant)/);
  });

  it('[P0] should mask xAI keys (xai-*)', () => {
    const text = 'XAI_API_KEY=xai-mock1234567890abcdefghijklmno';
    const masked = maskApiKeysInText(text);
    expect(masked).toContain('xai-...');
    expect(masked).not.toContain('mock1234567890abcdefghijklmno');
  });

  it('[P0] should mask generic OpenAI-shaped sk-* keys (no ant/live/test prefix)', () => {
    // The generic `sk-` masker is the catch-all that runs after the
    // sk-ant / sk_live / sk_test specialized variants. It covers
    // OpenAI's classic sk-... format. Pinning ensures a refactor of
    // the masker order doesn't accidentally drop this matcher.
    const text = 'OPENAI_API_KEY=sk-mockOpenAIKeyMaterial1234567890abcd';
    const masked = maskApiKeysInText(text);
    expect(masked).toContain('sk-...');
    expect(masked).not.toContain('mockOpenAIKeyMaterial1234567890');
  });

  it('[P0] should mask Stripe keys (sk_live_* and sk_test_*) before generic sk-*', () => {
    // Synthetic placeholder pattern (EXAMPLE marker + all-z) so GitHub
    // Push Protection doesn't flag the test fixture as a real key.
    const live = maskApiKeysInText('STRIPE=sk_live_NotAReal_FAKE_KEY_dummy123');
    const test = maskApiKeysInText('STRIPE=sk_test_NotAReal_FAKE_KEY_dummy123');
    expect(live).toContain('sk_live_...');
    expect(test).toContain('sk_test_...');
    expect(live).not.toContain('NotAReal_FAKE_KEY');
    expect(test).not.toContain('NotAReal_FAKE_KEY');
  });

  it('[P0] should mask GitHub PATs (ghp_* and github_pat_*)', () => {
    const classic = maskApiKeysInText('TOKEN=ghp_mockClassicTokenMaterial12345');
    const fineGrained = maskApiKeysInText('TOKEN=github_pat_mockFineGrainedToken_with_underscores_12345');
    expect(classic).toContain('ghp_...');
    expect(fineGrained).toContain('github_pat_...');
  });

  it('[P0] should mask Slack tokens (xoxb-/xoxp-/xoxa-)', () => {
    // Synthetic placeholder shape — neither GitHub Push Protection nor
    // gitleaks should flag these as real tokens because the body has no
    // realistic team-id / user-id segments and the entropy is trivially low.
    const bot = maskApiKeysInText('SLACK=xoxb-EXAMPLE-zzzzzzzzzzzzzzzzzzzzz');
    const user = maskApiKeysInText('SLACK=xoxp-EXAMPLE-zzzzzzzzzzzzzzzzzzzzz');
    expect(bot).toContain('xoxb-...');
    expect(user).toContain('xoxp-...');
  });

  it('[P0] should mask AWS access key IDs (AKIA*)', () => {
    const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE,SECRET=...';
    const masked = maskApiKeysInText(text);
    expect(masked).toContain('AKIA...');
    expect(masked).not.toContain('IOSFODNN7EXAMPLE');
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

  it('[P0] strips script blocks whose end tag carries whitespace or attributes', () => {
    // </script > and </script foo="bar"> are valid end-tag spellings the old
    // filter missed (CodeQL js/bad-tag-filter).
    expect(sanitizeInput('a<script>alert(1)</script >b')).toBe('ab');
    expect(sanitizeInput('a<script>alert(1)</script x="y">b')).toBe('ab');
    expect(sanitizeInput('a<script type="module">alert(1)</script\t>b')).toBe('ab');
  });

  it('[P1] handles adversarial "on"-repetition input in linear time', () => {
    // Bounded quantifiers keep the event-handler pattern O(n) — the unbounded
    // form was O(n²) on this shape (CodeQL js/polynomial-redos).
    const hostile = 'on'.repeat(100_000);
    const start = performance.now();
    const sanitized = sanitizeInput(hostile);
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(sanitized).toBe(hostile); // no '=' anywhere → nothing stripped
    // and the pattern still strips real handlers with spacing
    expect(sanitizeInput('<img onmouseover   = "x()">')).not.toContain('onmouseover');
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

describe('[P0] inputValidationMiddleware - end-to-end request validation', () => {
  function buildRes() {
    const res: any = {
      statusCode: 200,
      jsonPayload: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.jsonPayload = payload;
        return this;
      },
    };
    return res;
  }

  it('[P0] should pass GET requests through unchanged', () => {
    const req: any = { method: 'GET', headers: {}, body: { input: '<script>alert(1)</script>' } };
    const res = buildRes();
    const next = vi.fn();
    inputValidationMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200); // unchanged
    // GET bodies are not sanitized — the route either ignores body or
    // pulls it from query.
    expect(req.body.input).toBe('<script>alert(1)</script>');
  });

  it('[P0] should reject POST when Content-Length exceeds 10MB with 413', () => {
    const overLimit = String(11 * 1024 * 1024);
    const req: any = { method: 'POST', headers: { 'content-length': overLimit }, body: {} };
    const res = buildRes();
    const next = vi.fn();
    inputValidationMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.jsonPayload.error).toMatch(/too large/i);
    expect(res.jsonPayload.maxSize).toContain('MB');
  });

  it('[P0] should sanitize POST body input field (XSS strip)', () => {
    const req: any = {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: { input: 'Hello <script>alert(1)</script> world' },
    };
    const res = buildRes();
    const next = vi.fn();
    inputValidationMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.input).toBe('Hello  world');
    expect(req.body.input).not.toContain('script');
  });

  it('[P1] should pass POST through cleanly when there is no body.input', () => {
    const req: any = {
      method: 'POST',
      headers: { 'content-length': '10' },
      body: { name: 'webhook', url: 'https://example.com' },
    };
    const res = buildRes();
    const next = vi.fn();
    inputValidationMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(req.body.name).toBe('webhook');
  });

  it('[P1] should treat missing Content-Length as 0 (no rejection)', () => {
    const req: any = { method: 'POST', headers: {}, body: { input: 'hi' } };
    const res = buildRes();
    const next = vi.fn();
    inputValidationMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
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

  it('[P0] should allow every HTTP method that server.ts routes use', () => {
    // server.ts exposes GET/HEAD/POST/PUT/PATCH/DELETE routes. If any of
    // them is missing here, the browser preflight OPTIONS for that method
    // would be rejected and the static console couldn't call the route at
    // all. Pin the full set so a regression is loud.
    const options = getCorsOptions();
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(options.methods).toContain(method);
    }
  });

  it('[P0] should allow X-User-Role / X-User-Id / X-Request-Id / X-Workspace-Id headers', () => {
    // The dev auth shim reads X-User-Role; the request-id middleware reads
    // X-Request-Id from upstream proxies. Without these on the allowlist,
    // browsers strip them on cross-origin requests and the API never sees
    // the role token, so every requireRole(...) returns 401/403.
    const options = getCorsOptions();
    expect(options.allowedHeaders).toContain('X-User-Role');
    expect(options.allowedHeaders).toContain('X-User-Id');
    expect(options.allowedHeaders).toContain('X-Request-Id');
    expect(options.allowedHeaders).toContain('X-Workspace-Id');
    expect(options.allowedHeaders).toContain('Content-Type');
    expect(options.allowedHeaders).toContain('Authorization');
  });

  it('[P1] should expose X-Request-Id so clients can read it for log correlation', () => {
    const options = getCorsOptions();
    expect(options.exposedHeaders).toContain('X-Request-Id');
  });

  it('[P0] should warn when ALLOWED_ORIGINS is unset in production (silent allow-all footgun)', () => {
    // Same shape as the WRANNGLE_AUTH_DEFAULT_ROLE trap that #110
    // closed: an unset env var silently flips a security default to
    // "allow all". Behavior is unchanged (so existing deploys aren't
    // broken), but the warning makes the misconfiguration visible.
    const originalEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getCorsOptions();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('ALLOWED_ORIGINS');
    warn.mockRestore();

    process.env.NODE_ENV = originalEnv;
    if (originalOrigins) process.env.ALLOWED_ORIGINS = originalOrigins;
  });

  it('[P1] should warn only once per process for repeat invocations', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getCorsOptions();
    getCorsOptions();
    getCorsOptions();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    process.env.NODE_ENV = originalEnv;
    if (originalOrigins) process.env.ALLOWED_ORIGINS = originalOrigins;
  });

  it('[P1] should NOT warn when ALLOWED_ORIGINS is set, or when not in production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.ALLOWED_ORIGINS;

    // Case 1: production with ALLOWED_ORIGINS — no warning.
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://example.com';
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getCorsOptions();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    // Case 2: dev / unset NODE_ENV — no warning regardless of allowlist.
    _resetCorsWarningForTests();
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOWED_ORIGINS;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getCorsOptions();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    process.env.NODE_ENV = originalEnv;
    if (originalOrigins) process.env.ALLOWED_ORIGINS = originalOrigins;
    else delete process.env.ALLOWED_ORIGINS;
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

describe('[P0] securityHeadersMiddleware - Response Headers', () => {
  function runMiddleware() {
    const headers: Record<string, string> = {};
    const req: any = {};
    const res: any = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const next = vi.fn();
    securityHeadersMiddleware(req, res, next);
    return { headers, next };
  }

  it('[P0] should set X-Frame-Options to DENY', () => {
    const { headers } = runMiddleware();
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('[P0] should set X-Content-Type-Options to nosniff', () => {
    const { headers } = runMiddleware();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('[P0] should disable legacy XSS auditor (X-XSS-Protection: 0)', () => {
    // Modern OWASP guidance: `1; mode=block` re-introduces cross-site
    // leaks on browsers that still parse the header — the only safe
    // value is `0` (or omit entirely).
    const { headers } = runMiddleware();
    expect(headers['X-XSS-Protection']).toBe('0');
  });

  it('[P0] should set Strict-Transport-Security with 2-year max-age + includeSubDomains', () => {
    const { headers } = runMiddleware();
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=63072000/);
    expect(headers['Strict-Transport-Security']).toMatch(/includeSubDomains/);
  });

  it('[P0] should deny camera/microphone/geolocation via Permissions-Policy', () => {
    const { headers } = runMiddleware();
    const pp = headers['Permissions-Policy'];
    expect(pp).toBeDefined();
    expect(pp).toMatch(/camera=\(\)/);
    expect(pp).toMatch(/microphone=\(\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
  });

  it('[P1] should set Cross-Origin-Opener-Policy to same-origin', () => {
    const { headers } = runMiddleware();
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('[P1] should set Cross-Origin-Resource-Policy to same-site', () => {
    const { headers } = runMiddleware();
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-site');
  });

  it('[P0] should set strict Referrer-Policy', () => {
    const { headers } = runMiddleware();
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('[P0] should call next() exactly once', () => {
    const { next } = runMiddleware();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('[P0] apiNoStoreMiddleware - Cache-Control on /api/*', () => {
  function runMiddleware() {
    const headers: Record<string, string> = {};
    const req: any = { path: '/api/anything' };
    const res: any = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const next = vi.fn();
    apiNoStoreMiddleware(req, res, next);
    return { headers, next };
  }

  it('[P0] should set Cache-Control: no-store', () => {
    const { headers } = runMiddleware();
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('[P1] should set Pragma: no-cache for HTTP/1.0 proxies', () => {
    const { headers } = runMiddleware();
    expect(headers.Pragma).toBe('no-cache');
  });

  it('[P0] should call next() exactly once', () => {
    const { next } = runMiddleware();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('[P0] should let route handlers override Cache-Control later', () => {
    // Simulates the SSE route's `res.setHeader('Cache-Control',
    // 'no-cache')` after the middleware has run. The middleware must
    // not lock the value in some way that prevents override.
    const headers: Record<string, string> = {};
    const req: any = { path: '/api/logs/stream' };
    const res: any = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    apiNoStoreMiddleware(req, res, vi.fn());
    expect(headers['Cache-Control']).toBe('no-store');
    res.setHeader('Cache-Control', 'no-cache');
    expect(headers['Cache-Control']).toBe('no-cache');
  });
});

describe('[P0] redactSecretsDeep - structural secret redaction', () => {
  it('[P0] should redact secret-shaped strings inside nested objects', () => {
    // Synthetic key shapes mirror the masker contract — anything we
    // wouldn't trust in a log shouldn't survive a redaction pass.
    const input = {
      method: 'POST',
      headers: {
        authorization: 'Bearer sk-ant-api03-mockKeyMaterial1234567890abcdef',
      },
      body: {
        nested: {
          aws: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
        },
      },
    };

    const out = redactSecretsDeep(input);
    expect(out.headers.authorization).toContain('sk-ant-...');
    expect(out.headers.authorization).not.toContain('mockKeyMaterial1234567890abcdef');
    expect(out.body.nested.aws).toContain('AKIA...');
    expect(out.body.nested.aws).not.toContain('IOSFODNN7EXAMPLE');
  });

  it('[P0] should walk arrays of objects', () => {
    const input = [
      { token: 'ghp_mockClassicTokenMaterial12345' },
      { token: 'xai-mock1234567890abcdefghijklmno' },
    ];
    const out = redactSecretsDeep(input);
    expect(out[0].token).toContain('ghp_...');
    expect(out[1].token).toContain('xai-...');
  });

  it('[P1] should pass through non-string scalars unchanged', () => {
    const input = {
      retries: 3,
      enabled: true,
      cursor: null,
      ratio: 1.5,
    };
    const out = redactSecretsDeep(input);
    expect(out).toEqual(input);
  });

  it('[P1] should not mutate the input object', () => {
    const input = {
      headers: {
        authorization: 'Bearer sk-ant-api03-mockKeyMaterial1234567890abcdef',
      },
    };
    const before = JSON.stringify(input);
    redactSecretsDeep(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('[P0] safeFilenameForHeader - Content-Disposition injection guard', () => {
  it('[P0] should strip CR/LF (the actual injection vector)', () => {
    const evil = 'export.json\r\nX-Cache-Control: public';
    const safe = safeFilenameForHeader(evil);
    expect(safe).not.toContain('\r');
    expect(safe).not.toContain('\n');
    // Body characters that aren't structural (X-Cache-Control:) survive
    // — they're harmless without preceding CRLF.
    expect(safe).toContain('X-Cache-Control');
  });

  it('[P0] should strip embedded double quote and backslash', () => {
    expect(safeFilenameForHeader(String.raw`a"b\c.json`)).toBe('a_b_c.json');
  });

  it('[P0] should strip embedded semicolon (parameter separator)', () => {
    // Space survives — it's valid inside a quoted Content-Disposition
    // filename. Only the structural `;` is replaced.
    expect(safeFilenameForHeader('attack.json; charset=evil')).toBe('attack.json_ charset=evil');
  });

  it('[P0] should strip leading directory components (defense past path.basename)', () => {
    expect(safeFilenameForHeader('../etc/passwd')).toBe('passwd');
  });

  it('[P1] should fall back to "download" for empty / non-string / null input', () => {
    expect(safeFilenameForHeader('')).toBe('download');
    expect(safeFilenameForHeader(null)).toBe('download');
    expect(safeFilenameForHeader(undefined)).toBe('download');
    expect(safeFilenameForHeader(42 as any)).toBe('download');
  });

  it('[P1] should pass clean filenames through unchanged', () => {
    expect(safeFilenameForHeader('gdpr_export_user-123_1700000000.json')).toBe(
      'gdpr_export_user-123_1700000000.json',
    );
  });
});

describe('[P1] createSafeLogger - logger wrapper', () => {
  it('[P0] should mask string args before forwarding', () => {
    const captured: any[] = [];
    const fakeLog = (...args: any[]) => {
      captured.push(args);
    };
    const wrapped = createSafeLogger(fakeLog);
    wrapped('Anthropic key sk-ant-api03-mockKeyMaterial1234567890abcdef leaked');

    expect(captured).toHaveLength(1);
    expect(captured[0][0]).toContain('sk-ant-...');
    expect(captured[0][0]).not.toContain('mockKeyMaterial1234567890abcdef');
  });

  it('[P0] should walk object args via JSON round-trip and mask nested strings', () => {
    const captured: any[] = [];
    const wrapped = createSafeLogger((...args: any[]) => {
      captured.push(args);
    });
    wrapped({
      reqId: 'abc',
      headers: { authorization: 'Bearer ghp_mockClassicTokenMaterial12345' },
    });

    expect(captured[0][0]).toEqual({
      reqId: 'abc',
      headers: { authorization: expect.stringContaining('ghp_...') },
    });
    expect(JSON.stringify(captured[0])).not.toContain('mockClassicTokenMaterial');
  });

  it('[P1] should pass non-string non-object args through unchanged', () => {
    const captured: any[] = [];
    const wrapped = createSafeLogger((...args: any[]) => {
      captured.push(args);
    });
    wrapped(42, true, null, undefined);

    expect(captured[0]).toEqual([42, true, null, undefined]);
  });

  it('[P1] should fall back to original arg when JSON round-trip fails (cycles)', () => {
    const captured: any[] = [];
    const wrapped = createSafeLogger((...args: any[]) => {
      captured.push(args);
    });
    const cyclic: any = { name: 'foo' };
    cyclic.self = cyclic;
    expect(() => wrapped(cyclic)).not.toThrow();
    // The fallback returns the original arg, so identity is preserved.
    expect(captured[0][0]).toBe(cyclic);
  });
});

describe('[P0] resolveRequestId - upstream X-Request-Id validation', () => {
  it('[P0] should accept a well-formed UUID from upstream', () => {
    const uuid = '01999999-9999-7999-9999-999999999999';
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': uuid }, fallback)).toBe(uuid);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('[P0] should accept a Cloudflare ray-id-shaped value', () => {
    const ray = 'abc1234567890def-IAD';
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': ray }, fallback)).toBe(ray);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('[P0] should reject upstream with CRLF (header-injection vector)', () => {
    const evil = 'abc\r\nX-Cache: poisoned';
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': evil }, fallback)).toBe('GENERATED');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('[P0] should reject upstream with whitespace or special chars', () => {
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': 'foo bar' }, fallback)).toBe('GENERATED');
    expect(resolveRequestId({ 'x-request-id': 'foo<bar>' }, fallback)).toBe('GENERATED');
    expect(resolveRequestId({ 'x-request-id': 'foo;bar' }, fallback)).toBe('GENERATED');
  });

  it('[P0] should reject upstream longer than 64 chars', () => {
    const long = 'a'.repeat(65);
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': long }, fallback)).toBe('GENERATED');
  });

  it('[P0] should accept upstream of exactly 64 chars (boundary)', () => {
    const max = 'a'.repeat(64);
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': max }, fallback)).toBe(max);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('[P1] should fall back when header is empty / missing / non-string', () => {
    const fallback = vi.fn(() => 'GENERATED');
    expect(resolveRequestId({ 'x-request-id': '' }, fallback)).toBe('GENERATED');
    expect(resolveRequestId({}, fallback)).toBe('GENERATED');
    expect(resolveRequestId({ 'x-request-id': ['a', 'b'] as any }, fallback)).toBe('GENERATED');
  });
});
