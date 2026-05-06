/**
 * Security Middleware Module
 * Provides input validation, rate limiting, CORS, and API key masking.
 *
 * @module lib/security
 */

import rateLimit from 'express-rate-limit';
import cors from 'cors';

// =============================================================================
// Constants
// =============================================================================

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_INPUT_LENGTH = 500_000; // 500k characters
const SUSPICIOUS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick=, onerror=, etc.
];

// =============================================================================
// API Key Masking
// =============================================================================

/**
 * Mask an API key for safe logging (show only last 4 chars)
 * @param {string} key - The API key to mask
 * @returns {string} Masked key like "...abc123"
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '[not set]';
  if (key.length <= 8) return '***';
  return `...${key.slice(-4)}`;
}

/**
 * Mask all API keys in a string (for log sanitization)
 * @param {string} text - Text that may contain API keys
 * @returns {string} Text with API keys masked
 */
export function maskApiKeysInText(text) {
  if (!text || typeof text !== 'string') return text;

  // Mask common API key patterns. Order matters — longer-prefixed
  // patterns must run BEFORE shorter ones (e.g. sk-ant-* must run
  // before sk-*) so the more-specific masker wins.
  //   Gemini:    AIza...      (typically 39 chars)
  //   Groq:      gsk_...      (typically 56 chars)
  //   Anthropic: sk-ant-...   (typically 100+ chars)
  //   xAI:       xai-...      (typically 80+ chars)
  //   Stripe:    sk_live_... + sk_test_...
  //   OpenAI:    sk-...       (typically 51 chars; runs after sk-ant + sk_live/test)
  //   GitHub:    ghp_... + github_pat_*
  //   Slack:     xoxb-... + xoxp-... + xoxa-...
  //   AWS:       AKIA... (20-char access key id)
  return text
    .replaceAll(/AIza[\w-]{20,}/g, (match) => `AIza...${match.slice(-4)}`)
    .replaceAll(/gsk_[A-Za-z\d]{20,}/g, (match) => `gsk_...${match.slice(-4)}`)
    .replaceAll(/sk-ant-[A-Za-z\d_-]{20,}/g, (match) => `sk-ant-...${match.slice(-4)}`)
    .replaceAll(/xai-[A-Za-z\d]{20,}/g, (match) => `xai-...${match.slice(-4)}`)
    // Real Stripe keys use [A-Za-z0-9] in the body. Including `_` here
    // is intentionally permissive — masks more aggressively, never less.
    .replaceAll(/sk_(?:live|test)_[A-Za-z\d_]{20,}/g, (match) => `${match.slice(0, 8)}...${match.slice(-4)}`)
    .replaceAll(/sk-[A-Za-z\d]{20,}/g, (match) => `sk-...${match.slice(-4)}`)
    .replaceAll(/ghp_[A-Za-z\d]{20,}/g, (match) => `ghp_...${match.slice(-4)}`)
    .replaceAll(/github_pat_[A-Za-z\d_]{20,}/g, (match) => `github_pat_...${match.slice(-4)}`)
    .replaceAll(/xox[bpa]-[A-Za-z\d-]{20,}/g, (match) => `${match.slice(0, 5)}...${match.slice(-4)}`)
    .replaceAll(/AKIA[A-Z\d]{16}/g, (match) => `AKIA...${match.slice(-4)}`);
}

/**
 * Walk an arbitrary value and return a structurally-equivalent copy
 * with every string passed through maskApiKeysInText. Plain objects
 * and arrays are recursed; everything else (numbers, booleans, null,
 * Date, etc.) is returned as-is. Cycles are not expected in audit
 * metadata payloads, so detection is intentionally not implemented —
 * a cyclic input would simply blow the stack, which is an obvious
 * misuse.
 *
 * Use this at any boundary that persists user-controllable values
 * (audit logs, request-replay buffers, error reports). It cannot
 * promise zero leakage — only patterns enumerated in
 * maskApiKeysInText are caught — but it dramatically reduces the
 * blast radius of accidental secret-into-log propagation.
 *
 * @param {*} value - Arbitrary metadata value
 * @returns {*} Redacted copy
 */
export function redactSecretsDeep(value) {
  if (typeof value === 'string') {
    return maskApiKeysInText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretsDeep(entry));
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactSecretsDeep(v);
    }

    return out;
  }

  return value;
}

/**
 * Create a safe logger that masks API keys
 * @param {Function} originalLog - Original console.log function
 * @returns {Function} Wrapped logger
 */
export function createSafeLogger(originalLog) {
  return (...args) => {
    const safeArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return maskApiKeysInText(arg);
      }

      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.parse(maskApiKeysInText(JSON.stringify(arg)));
        } catch {
          return arg;
        }
      }

      return arg;
    });
    originalLog.apply(console, safeArgs);
  };
}

// =============================================================================
// Input Validation
// =============================================================================

/**
 * Sanitize input text by removing potentially dangerous content
 * @param {string} input - Raw input text
 * @returns {string} Sanitized text
 */
export function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input;

  // Remove script tags and event handlers
  for (const pattern of SUSPICIOUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Trim to max length
  if (sanitized.length > MAX_INPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH);
  }

  return sanitized;
}

/**
 * Validate input size
 * @param {string} input - Input to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateInputSize(input) {
  if (!input) {
    return { valid: false, error: 'Input is required' };
  }

  const size = Buffer.byteLength(input, 'utf8');
  if (size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Input exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
    };
  }

  return { valid: true };
}

/**
 * Express middleware for input validation
 */
export function inputValidationMiddleware(req, res, next) {
  // Skip for non-POST requests
  if (req.method !== 'POST') {
    return next();
  }

  // Validate Content-Length header
  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({
      error: 'Payload too large',
      maxSize: `${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
    });
  }

  // Validate and sanitize input field if present
  if (req.body && req.body.input) {
    const validation = validateInputSize(req.body.input);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    req.body.input = sanitizeInput(req.body.input);
  }

  next();
}

// =============================================================================
// Rate Limiting
// =============================================================================

/**
 * Rate limiter for /api/generate endpoint
 * 10 requests per hour per IP
 */
export const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too many generation requests',
    message: 'Please try again later',
    retryAfter: '1 hour'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Use default keyGenerator which handles IPv6 properly
  handler(req, res) {
    res.status(429).json({
      error: 'Too many generation requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Rate limiter for /api/history endpoint
 * 100 requests per hour per IP
 */
export const historyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: {
    error: 'Too many requests',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
  // Use default keyGenerator which handles IPv6 properly
});

/**
 * General rate limiter for other endpoints
 * 200 requests per hour per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
  // Use default keyGenerator which handles IPv6 properly
});

// =============================================================================
// CORS Configuration
// =============================================================================

/**
 * Get CORS configuration based on environment
 * @returns {Object} CORS options
 */
// Module-scoped flag so the prod-without-allowlist warning fires
// once per process — see resetCorsWarningForTests for the test reset.
let _loggedMissingProdAllowlist = false;

export function _resetCorsWarningForTests() {
  _loggedMissingProdAllowlist = false;
}

export function getCorsOptions() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null; // null = allow all in development

  if (
    process.env.NODE_ENV === 'production'
    && !allowedOrigins
    && !_loggedMissingProdAllowlist
  ) {
    _loggedMissingProdAllowlist = true;
    // Same shape of footgun as the WRANNGLE_AUTH_DEFAULT_ROLE trap
    // closed in PR #110: an unset env var silently flips a security
    // default to "allow all". Don't change behavior — that breaks
    // existing deploys — but make the misconfiguration visible.
    console.warn(
      '[cors] ALLOWED_ORIGINS unset in production: every Origin will be allowed. Set ALLOWED_ORIGINS=https://app.example.com,https://other.example.com to lock down.',
    );
  }

  return {
    origin(origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        return callback(null, true);
      }

      // In development, allow all origins
      if (!allowedOrigins || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // In production, check against allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    // server.js exposes PATCH and DELETE routes (e.g. PATCH /api/webhooks/:id,
    // DELETE /api/workspace/:wid/users/:uid). Without those methods in the
    // CORS allowlist the browser preflight OPTIONS for them is rejected and
    // the static console (cross-origin from app.wranngle.com) can't call
    // them at all. PUT is included for symmetry; HEAD is implicitly allowed.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-User-Role + X-User-Id + X-Request-Id + X-Workspace-Id are the dev-mode
    // auth-shim and tracing headers (lib/rbac.js#resolveDevAuthRole +
    // server.js request-id middleware). Without them on the allowlist the
    // browser strips them on cross-origin requests and the API never sees
    // the role token, so every requireRole(...) hit returns 401/403.
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-User-Role',
      'X-User-Id',
      'X-Workspace-Id',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 86_400, // 24 hours
  };
}

/**
 * CORS middleware
 */
export const corsMiddleware = cors(getCorsOptions());

// =============================================================================
// Security Headers
// =============================================================================

/**
 * Add security headers to responses.
 *
 * The matching CSP for the static console deploy lives in
 * `apps/ops-console/_headers` (Cloudflare Pages); these are the
 * headers the live API server emits in front of every response.
 */
export function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection should be 0 — the legacy XSS auditor it gated
  // was removed from Chrome/Edge and `1; mode=block` historically
  // introduced cross-site leaks on browsers that still parsed it.
  // Modern OWASP guidance: explicitly disable.
  res.setHeader('X-XSS-Protection', '0');

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 2-year HSTS with subdomains; matches `apps/ops-console/_headers`
  // and the production Cloudflare Pages policy.
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  // Lock down browser feature surface. The voice widget runs only on
  // the static console deploy, so the API-server origin needs none of
  // these — keep them denied here.
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  next();
}

/**
 * Sanitize a filename for use in a Content-Disposition response
 * header. Strips CR/LF (the header-injection vector), control
 * bytes, quotes, semicolons, and backslashes — anything that
 * could break out of the `filename="..."` parameter.
 *
 * Threat model: GDPR export filenames are constructed from
 * user_id + timestamp. If a future code path lets attacker-
 * controlled bytes flow into the filename, embedded CRLF +
 * extra headers could rewrite the response (cache poisoning,
 * XSS via Content-Type override, cookie theft). This helper
 * closes that vector even if the upstream sanitizer regresses.
 *
 * @param {string} filename - Untrusted filename string
 * @returns {string} Header-safe basename
 */
export function safeFilenameForHeader(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'download';
  }

  // Take just the last path segment as a defensive belt-and-suspenders
  // pass even when the caller has already called path.basename — this
  // strips the leading directory if any. Then scrub everything header-
  // unsafe (control bytes 0x00–0x1F + 0x7F, plus quote / single-quote
  // / semicolon / backslash) to underscore so length cues survive.
  const basename = filename.replace(/^.*\//, '');
  // eslint-disable-next-line no-control-regex -- intentional: stripping CR/LF/control bytes is the whole point.
  const sanitized = basename.replace(/[ -"';\\]/g, '_');
  return sanitized.length > 0 ? sanitized : 'download';
}

/**
 * Forbid caching of `/api/*` responses by browsers, proxies, and any
 * intermediary cache. API responses are role-aware and frequently
 * contain workspace-scoped or user-scoped data — a shared cache
 * serving one user's response to another would be a confidentiality
 * incident. `no-store` is the strongest directive and supersedes
 * `private` / `must-revalidate` for that purpose.
 *
 * Routes that need a different cache policy (e.g. SSE streams) can
 * still call `res.setHeader('Cache-Control', ...)` later — Express
 * overwrites on second-write, so the route handler wins.
 */
export function apiNoStoreMiddleware(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  // Pragma is HTTP/1.0; harmless on modern stacks but covers ancient
  // forward proxies that ignore Cache-Control.
  res.setHeader('Pragma', 'no-cache');
  next();
}
