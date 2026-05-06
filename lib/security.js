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
export function getCorsOptions() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null; // null = allow all in development

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
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86_400 // 24 hours
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
 * Add security headers to responses
 */
export function securityHeadersMiddleware(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
}
