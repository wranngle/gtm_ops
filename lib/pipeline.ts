// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

// CACHE BUST: 2026-01-15T01:05:00Z - Fixed systems_inventory to use empty array
/**
 * Unified Presales Pipeline
 *
 * Single pipeline that generates all 3 presales documents:
 * - Project Plan
 * - Proposal
 * - AI Process Report (formerly Audit/Traffic Light Report)
 *
 * Architecture: Schema-first sequential build
 * Input → Research → Project Plan → Proposal → AI Process Report → Render All → Polish All → PDF All
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Mustache from 'mustache';

// Core utilities
import {
  transformToProjectPlan,
  buildProposal,
  getPlaceholderPaths,
  transform as transformAudit,
  getLLMPlaceholders
} from '../src/transforms/index.js';
import { BatchLLMExecutor } from '../src/services/llm.js';
import { generateProjectIdentity, formatCurrency } from './project-identity.js';
import { ensureDir } from './file-utils.js';
import { generateHeaderHTML, generateFooterHTML, initSharedComponents } from './shared-components.js';

// Schema v2 compatibility
import { expandLegacyPaths } from './schema-compat.js';
import { buildTemplateContext } from './template-context.js';

// Business profile enrichment
import { getCompanySizeSegment } from './schemas/business-profile.schema.js';

// History
import { HistoryManager } from './history.js';

// Extraction
import { Extractor } from './extract.js';

// Research
import { researchAllIntegrations, getLibraryStatus, generateResearchGapReport, getResearchDerivedBaseHours } from './integration-research.js';
import { quickTierAssessment } from './research.js';
import { buildTechnicalApproach } from './build-technical-approach.js';
import { performProactiveResearch, mergeResearchResults, generateResearchSummary } from './proactive-research.js';

// System Intelligence (unified lookup)
import { getAllSystemIntelligence } from './system-intelligence.js';

// Product Detection (AI Voice Agent vs. Project)
import { detectProductType } from './product-detector.js';

// Estimation & Pricing
import { generateEstimate, extractVolumeFromIntake, initEstimate } from './estimate.js';
import { calculatePricing, calculateProductPricing, calculateROI, initPricing } from './pricing-calculator.js';
import { buildPhases, buildProductPhases, initMilestoneBuilder } from './milestone-builder.js';

// Transforms (consolidated TypeScript module - tsx handles .ts imports)

// LLM (consolidated TypeScript module - tsx handles .ts imports)
import { runFinalHtmlPass as polishHTML } from './html-polish.js';

// Validation & Output
import { initValidation } from './validate.js';
import { generatePDF } from './pdf-generator.js';
import { validateBleedOutputGate, validateExtractionGate } from './schema-validation.js';

// Display Field Sync (prevents display field desync bug)
import { regenerateFinopsDisplayFields } from './display-fields.js';

// Questionnaire & Lead Scoring (structured input path)
import {
  loadQuestionDatabase,
  loadSystemsCatalog,
  mapFormToIntake,
  validateFormData
} from './questionnaire-transform.js';
import {
  getLeadQualification,
  getKeyMetrics,
  getCompanyProfile,
  prepareLeadQualificationForTemplate,
  prepareKeyMetricsForTemplate
} from './lead-scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// LOGGER - Ultra-verbose pipeline logging with colors, timing, and specifics
// =============================================================================

/**
 * Convert markdown bold (**text**) to HTML <strong> tags
 * Applied recursively to all string fields in an object
 */
function convertMarkdownToHtml(obj) {
  if (typeof obj === 'string') {
    return obj.replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertMarkdownToHtml(item));
  }

  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertMarkdownToHtml(value);
    }

    return result;
  }

  return obj;
}

const COLORS = {
  reset: '\u001B[0m',
  bright: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  blue: '\u001B[34m',
  magenta: '\u001B[35m',
  cyan: '\u001B[36m',
  white: '\u001B[37m',
  orange: '\u001B[38;5;208m',
  gray: '\u001B[90m',
  bgGreen: '\u001B[42m',
  bgRed: '\u001B[41m',
  bgYellow: '\u001B[43m',
  bgBlue: '\u001B[44m'
};

class PipelineLogger {
  constructor(logHandler) {
    this.stageTimers = {};
    this.subStepTimers = {};
    this.currentStage = null;
    this.currentSubStep = null;
    this.indent = 0;
    this.startTime = Date.now();
    this.logHandler = logHandler;
    this.buffer = []; // Memory buffer for raw log persistence
  }

  _print(msg) {
    this.buffer.push(msg); // Store RAW msg with ANSI codes
    if (this.logHandler) {
      this.logHandler(msg);
    } else {
      console.log(msg);
    }
  }

  getBuffer() {
    return this.buffer.join('\n');
  }

  _ts() {
    const now = new Date();
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    return `${COLORS.gray}[${now.toISOString().slice(11, 23)}]${COLORS.reset} ${COLORS.dim}+${elapsed.padStart(6)}s${COLORS.reset}`;
  }

  _indent() {
    return '  '.repeat(this.indent);
  }

  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  _formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.floor(ms / 60_000)}m ${((ms % 60_000) / 1000).toFixed(1)}s`;
  }

  banner(title) {
    const line = '═'.repeat(70);
    this._print(`\n${COLORS.orange}╔${line}╗${COLORS.reset}`);
    this._print(`${COLORS.orange}║${COLORS.reset}${COLORS.bright}${COLORS.white}  ${title.padEnd(68)}${COLORS.reset}${COLORS.orange}║${COLORS.reset}`);
    this._print(`${COLORS.orange}╚${line}╝${COLORS.reset}\n`);
  }

  stage(num, title, icon = '📦') {
    this.currentStage = num;
    this.stageTimers[num] = Date.now();
    this.indent = 0;
    this._print(`\n${this._ts()} ${COLORS.bgBlue}${COLORS.white}${COLORS.bright} STAGE ${num} ${COLORS.reset} ${icon} ${COLORS.bright}${COLORS.cyan}${title}${COLORS.reset}`);
    this._print(`${COLORS.gray}${'─'.repeat(75)}${COLORS.reset}`);
    this.indent = 1;
  }

  stageComplete(summary = {}) {
    const duration = Date.now() - (this.stageTimers[this.currentStage] || Date.now());
    this.indent = 0;
    const summaryStr = Object.entries(summary)
      .map(([k, v]) => `${COLORS.dim}${k}:${COLORS.reset}${COLORS.white}${v}${COLORS.reset}`)
      .join('  ');
    this._print(`${this._ts()} ${COLORS.green}✓ Stage ${this.currentStage} complete${COLORS.reset} ${COLORS.dim}(${this._formatDuration(duration)})${COLORS.reset}  ${summaryStr}`);
  }

  subStep(label) {
    this.currentSubStep = label;
    this.subStepTimers[label] = Date.now();
    this._print(`${this._ts()} ${this._indent()}${COLORS.blue}→${COLORS.reset} ${label}...`);
    this.indent = 2;
  }

  subStepDone(details = null) {
    const duration = Date.now() - (this.subStepTimers[this.currentSubStep] || Date.now());
    this.indent = 1;
    const durationStr = `${COLORS.dim}(${this._formatDuration(duration)})${COLORS.reset}`;
    if (details) {
      this._print(`${this._ts()} ${this._indent()}${COLORS.green}✓${COLORS.reset} ${details} ${durationStr}`);
    }
  }

  data(label, value, unit = '') {
    const valueStr = typeof value === 'number'
      ? `${COLORS.bright}${COLORS.white}${value.toLocaleString()}${COLORS.reset}`
      : `${COLORS.white}${value}${COLORS.reset}`;
    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}${label}:${COLORS.reset} ${valueStr}${unit ? ` ${COLORS.dim}${unit}${COLORS.reset}` : ''}`);
  }

  dataLast(label, value, unit = '') {
    const valueStr = typeof value === 'number'
      ? `${COLORS.bright}${COLORS.white}${value.toLocaleString()}${COLORS.reset}`
      : `${COLORS.white}${value}${COLORS.reset}`;
    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}└─${COLORS.reset} ${COLORS.gray}${label}:${COLORS.reset} ${valueStr}${unit ? ` ${COLORS.dim}${unit}${COLORS.reset}` : ''}`);
  }

  list(label, items, maxShow = 5) {
    if (!items || items.length === 0) {
      this._print(`${this._ts()} ${this._indent()}${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}${label}:${COLORS.reset} ${COLORS.dim}(none)${COLORS.reset}`);
      return;
    }

    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}${label}:${COLORS.reset} ${COLORS.cyan}[${items.length} items]${COLORS.reset}`);
    const showItems = items.slice(0, maxShow);
    for (const [i, item] of showItems.entries()) {
      const isLast = i === showItems.length - 1 && items.length <= maxShow;
      const prefix = isLast ? '└─' : '├─';
      this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}${prefix}${COLORS.reset} ${COLORS.white}${item}${COLORS.reset}`);
    }

    if (items.length > maxShow) {
      this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}└─ ...and ${items.length - maxShow} more${COLORS.reset}`);
    }
  }

  json(label, obj, maxKeys = 8) {
    const keys = Object.keys(obj || {});
    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}${label}:${COLORS.reset} ${COLORS.magenta}{${keys.length} keys}${COLORS.reset}`);
    const showKeys = keys.slice(0, maxKeys);
    for (const [i, key] of showKeys.entries()) {
      const val = obj[key];
      const isLast = i === showKeys.length - 1 && keys.length <= maxKeys;
      const prefix = isLast ? '└─' : '├─';
      let valStr;
      if (val === null || val === undefined) {
        valStr = `${COLORS.dim}null${COLORS.reset}`;
      } else if (typeof val === 'object') {
        valStr = Array.isArray(val) ? `${COLORS.cyan}[${val.length}]${COLORS.reset}` : `${COLORS.magenta}{...}${COLORS.reset}`;
      } else if (typeof val === 'string') {
        valStr = val.length > 40 ? `${COLORS.green}"${val.slice(0, 40)}..."${COLORS.reset}` : `${COLORS.green}"${val}"${COLORS.reset}`;
      } else {
        valStr = `${COLORS.yellow}${val}${COLORS.reset}`;
      }

      this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}${prefix}${COLORS.reset} ${COLORS.white}${key}${COLORS.reset}: ${valStr}`);
    }

    if (keys.length > maxKeys) {
      this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}└─ ...and ${keys.length - maxKeys} more keys${COLORS.reset}`);
    }
  }

  file(action, filePath, sizeBytes = null) {
    const fileName = path.basename(filePath);
    const dir = path.dirname(filePath);
    const sizeStr = sizeBytes ? ` ${COLORS.dim}(${this._formatBytes(sizeBytes)})${COLORS.reset}` : '';
    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}├─${COLORS.reset} ${COLORS.green}${action}${COLORS.reset} ${COLORS.bright}${fileName}${COLORS.reset}${sizeStr}`);
    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}│  ${COLORS.reset}${COLORS.gray}→ ${dir}${COLORS.reset}`);
  }

  currency(label, amount) {
    const formatted = typeof amount === 'number' ? `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : amount;
    this._print(`${this._ts()} ${this._indent()}${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}${label}:${COLORS.reset} ${COLORS.bright}${COLORS.green}${formatted}${COLORS.reset}`);
  }

  warn(message) {
    this._print(`${this._ts()} ${this._indent()}${COLORS.yellow}⚠ WARNING:${COLORS.reset} ${message}`);
  }

  error(message, error = null) {
    this._print(`${this._ts()} ${this._indent()}${COLORS.red}✖ ERROR:${COLORS.reset} ${COLORS.bright}${message}${COLORS.reset}`);
    if (error?.stack) {
      const stackLines = error.stack.split('\n').slice(1, 4);
      for (const line of stackLines) {
        this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}${line.trim()}${COLORS.reset}`);
      }
    }
  }

  success(message) {
    this._print(`${this._ts()} ${this._indent()}${COLORS.green}✓${COLORS.reset} ${COLORS.bright}${message}${COLORS.reset}`);
  }

  info(message) {
    this._print(`${this._ts()} ${this._indent()}${COLORS.blue}ℹ${COLORS.reset} ${message}`);
  }

  divider() {
    this._print(`${COLORS.gray}${'─'.repeat(75)}${COLORS.reset}`);
  }

  summary(title, data) {
    this._print(`\n${COLORS.bgGreen}${COLORS.white}${COLORS.bright} ${title} ${COLORS.reset}`);
    for (const [k, v] of Object.entries(data)) {
      this._print(`  ${COLORS.gray}${k}:${COLORS.reset} ${COLORS.bright}${v}${COLORS.reset}`);
    }
  }

  finalReport(stats, outputs) {
    const totalDuration = Date.now() - this.startTime;
    this._print(`\n${COLORS.orange}╔${'═'.repeat(70)}╗${COLORS.reset}`);
    this._print(`${COLORS.orange}║${COLORS.reset}${COLORS.bright}${COLORS.white}  PIPELINE COMPLETE                                                    ${COLORS.reset}${COLORS.orange}║${COLORS.reset}`);
    this._print(`${COLORS.orange}╚${'═'.repeat(70)}╝${COLORS.reset}`);

    this._print(`\n  ${COLORS.gray}Total Duration:${COLORS.reset} ${COLORS.bright}${this._formatDuration(totalDuration)}${COLORS.reset}`);
    this._print(`  ${COLORS.gray}Stages Completed:${COLORS.reset} ${COLORS.bright}${Object.keys(stats.stages).length}/9${COLORS.reset}`);

    if (stats.stages.llmFill) {
      this._print(`  ${COLORS.gray}LLM API Calls:${COLORS.reset} ${COLORS.bright}${stats.stages.llmFill.apiCalls || 0}${COLORS.reset}`);
      this._print(`  ${COLORS.gray}Tokens Used:${COLORS.reset} ${COLORS.bright}${(stats.stages.llmFill.tokensUsed || 0).toLocaleString()}${COLORS.reset}`);
    }

    this._print(`\n  ${COLORS.cyan}${COLORS.bright}Generated Documents:${COLORS.reset}`);
    for (const [docType, output] of Object.entries(outputs)) {
      if (output.html) {
        const htmlSize = fs.existsSync(output.html) ? fs.statSync(output.html).size : 0;
        const pdfSize = output.pdf && fs.existsSync(output.pdf) ? fs.statSync(output.pdf).size : 0;
        this._print(`  ${COLORS.green}✓${COLORS.reset} ${COLORS.bright}${docType}${COLORS.reset}`);
        this._print(`    ${COLORS.gray}HTML:${COLORS.reset} ${path.basename(output.html)} ${COLORS.dim}(${this._formatBytes(htmlSize)})${COLORS.reset}`);
        if (output.pdf) {
          this._print(`    ${COLORS.gray}PDF:${COLORS.reset}  ${path.basename(output.pdf)} ${COLORS.dim}(${this._formatBytes(pdfSize)})${COLORS.reset}`);
        }
      }
    }

    this._print('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY OBSERVABILITY - Real-time logging for transient failure recovery
  // ═══════════════════════════════════════════════════════════════════════════

  retryStart(stageName, attempt, maxAttempts, error) {
    const errorType = classifyError(error);
    this._print(`${this._ts()} ${this._indent()}${COLORS.yellow}⟳ RETRY${COLORS.reset} ${COLORS.bright}${stageName}${COLORS.reset} ${COLORS.dim}(attempt ${attempt}/${maxAttempts})${COLORS.reset}`);
    this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}Error Type:${COLORS.reset} ${COLORS.yellow}${errorType}${COLORS.reset}`);
    this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}Message:${COLORS.reset} ${error.message?.slice(0, 80) || 'Unknown error'}`);
  }

  retryWaiting(delayMs, jitterMs) {
    const totalDelay = delayMs + jitterMs;
    this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}Backoff:${COLORS.reset} ${COLORS.cyan}${(delayMs/1000).toFixed(1)}s${COLORS.reset} ${COLORS.dim}+ ${(jitterMs/1000).toFixed(1)}s jitter = ${(totalDelay/1000).toFixed(1)}s${COLORS.reset}`);
    this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}└─${COLORS.reset} ${COLORS.yellow}⏳ Waiting...${COLORS.reset}`);
  }

  retrySuccess(stageName, attempt) {
    this._print(`${this._ts()} ${this._indent()}${COLORS.green}✓ RECOVERED${COLORS.reset} ${COLORS.bright}${stageName}${COLORS.reset} ${COLORS.dim}on attempt ${attempt}${COLORS.reset}`);
  }

  retryExhausted(stageName, attempts, lastError) {
    this._print(`${this._ts()} ${this._indent()}${COLORS.red}✖ RETRY EXHAUSTED${COLORS.reset} ${COLORS.bright}${stageName}${COLORS.reset}`);
    this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}├─${COLORS.reset} ${COLORS.gray}Attempts:${COLORS.reset} ${COLORS.red}${attempts}${COLORS.reset}`);
    this._print(`${this._ts()} ${this._indent()}  ${COLORS.dim}└─${COLORS.reset} ${COLORS.gray}Final Error:${COLORS.reset} ${lastError.message?.slice(0, 100) || 'Unknown'}`);
  }
}

// =============================================================================
// TRANSIENT ERROR DETECTION - Classify errors for retry eligibility
// =============================================================================

const TRANSIENT_ERROR_PATTERNS = [
  // Network errors
  'fetch failed',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'socket hang up',
  'network',
  'EAI_AGAIN',
  // HTTP status codes
  '429',
  '500',
  '502',
  '503',
  '504',
  // API-specific
  'rate limit',
  'rate_limit',
  'too many requests',
  'temporarily unavailable',
  'service unavailable',
  'internal server error',
  'gateway timeout',
  'overloaded',
  // Gemini/Groq specific
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'quota exceeded'
];

const PERMANENT_ERROR_PATTERNS = [
  'invalid api key',
  'unauthorized',
  'authentication failed',
  'invalid request',
  'permission denied',
  'not found',
  'validation error',
  'schema validation',
  'parse error',
  'syntax error'
];

function isTransientError(error) {
  const message = (error?.message || error?.toString() || '').toLowerCase();

  // Check for permanent errors first
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (message.includes(pattern)) return false;
  }

  // Check for transient patterns
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (message.includes(pattern.toLowerCase())) return true;
  }

  // Default: retry on unknown errors (safer)
  return true;
}

function classifyError(error) {
  const message = (error?.message || '').toLowerCase();

  if (message.includes('fetch failed') || message.includes('econnreset') || message.includes('etimedout')) {
    return 'NETWORK';
  }

  if (message.includes('429') || message.includes('rate limit') || message.includes('too many')) {
    return 'RATE_LIMIT';
  }

  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return 'SERVER_ERROR';
  }

  if (message.includes('quota') || message.includes('resource_exhausted')) {
    return 'QUOTA';
  }

  return 'UNKNOWN';
}

// =============================================================================
// RETRY WITH EXPONENTIAL BACKOFF - Auto-bootstrap transient failure recovery
// =============================================================================

const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 5000,      // 5 seconds
  maxDelayMs: 60_000,      // 1 minute max
  backoffMultiplier: 2,   // Exponential
  jitterPercent: 0.25     // 25% jitter to avoid thundering herd
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async function with automatic retry on transient failures.
 *
 * Uses exponential backoff with jitter to handle API rate limits,
 * network issues, and temporary server errors. Logs all retry attempts
 * and recovery status.
 *
 * @param {string} stageName - Human-readable stage name for logging
 * @param {Function} fn - Async function to execute (no arguments)
 * @param {PipelineLogger} logger - Logger instance for retry status
 * @param {Object} [config={}] - Retry configuration overrides
 * @param {number} [config.maxAttempts=3] - Maximum number of attempts
 * @param {number} [config.baseDelayMs=5000] - Initial delay between retries
 * @param {number} [config.maxDelayMs=60000] - Maximum delay cap
 * @param {number} [config.backoffMultiplier=2] - Exponential backoff factor
 * @param {number} [config.jitterPercent=0.25] - Random jitter percentage
 * @returns {Promise<*>} Result of the function if successful
 * @throws {Error} Last error if all attempts exhausted
 */
async function withRetry(stageName, fn, logger, config = {}) {
  const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();

      // Log recovery if this wasn't the first attempt
      if (attempt > 1) {
        logger.retrySuccess(stageName, attempt);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isTransientError(error)) {
        logger.error(`${stageName} failed with permanent error`, error);
        throw error;
      }

      // Check if we have attempts remaining
      if (attempt >= opts.maxAttempts) {
        logger.retryExhausted(stageName, attempt, error);
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const baseDelay = Math.min(
        opts.baseDelayMs * opts.backoffMultiplier**(attempt - 1),
        opts.maxDelayMs
      );
      const jitter = Math.random() * opts.jitterPercent * baseDelay;
      const totalDelay = Math.round(baseDelay + jitter);

      // Log retry attempt
      logger.retryStart(stageName, attempt, opts.maxAttempts, error);
      logger.retryWaiting(baseDelay, jitter);

      // Wait before retry
      await sleep(totalDelay);
    }
  }

  throw lastError;
}

// =============================================================================
// MODULE INITIALIZATION
// =============================================================================

let _pipelineInitialized = false;

/**
 * Initialize all config-dependent modules (SQLite-based config)
 *
 * This consolidates all module initialization into a single async call.
 * Modules depend on SQLite config being loaded before they can work.
 *
 * Idempotent: safe to call multiple times (no-op after first call).
 */
async function initializePipelineModules() {
  if (_pipelineInitialized) return;

  await Promise.all([
    initEstimate(),
    initPricing(),
    initSharedComponents(),
    initMilestoneBuilder(),
    initValidation()
  ]);

  _pipelineInitialized = true;
}

/**
 * Format currency value to string without $ prefix
 * Used for template values like ${{{amount}}}
 */
function formatCurrencyForTemplate(value) {
  if (typeof value !== 'number' || isNaN(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Format project plan data for Mustache template rendering.
 *
 * This function performs critical transformations:
 * - Converts numeric currency values to formatted strings (e.g., 1234 -> "1,234")
 * - Extracts raw numeric values before formatting for Page 8 hidden buffers
 * - Ensures all display fields are populated for template consumption
 * - Handles nested structures: estimate.cost, milestones, payments, finops
 *
 * IMPORTANT: This function mutates a deep clone of the input, not the original.
 * Currency values are formatted WITHOUT decimal places for cleaner display.
 *
 * @param {Object} plan - Raw project plan data from transform stage
 * @param {Object} plan.estimate - Effort and cost estimates
 * @param {Object} plan.milestones - Payment milestone data
 * @param {Object} plan.finops - Financial operations section
 * @returns {Object} Formatted plan with string currency values and display fields
 */
function formatProjectPlanForRender(plan) {
  const formatted = JSON.parse(JSON.stringify(plan));

  // CRITICAL: Extract raw numeric values BEFORE formatting for Page 8 Hidden Buffers
  const rawContingency = formatted.estimate?.cost?.contingency || 0;
  const rawContingencyPercent = formatted.estimate?.cost?.contingency_percent || 0.15;
  const rawSubtotal = formatted.estimate?.cost?.subtotal || 0;
  const rawTotal = formatted.estimate?.cost?.total || 0;
  const rawInternalCost = formatted.finops?.total_internal_cost || 0;

  // Format estimate.cost values
  if (formatted.estimate?.cost) {
    // Add display fields BEFORE formatting (for derivation formulas)
    if (typeof formatted.estimate.cost.subtotal === 'number') {
      formatted.estimate.cost.subtotal_display = formatted.estimate.cost.subtotal.toLocaleString();
    }

    if (typeof formatted.estimate.cost.contingency_percent === 'number') {
      formatted.estimate.cost.contingency_percent_display = Math.round(formatted.estimate.cost.contingency_percent * 100);
    }
    
    if (typeof formatted.estimate.cost.total === 'number') {
      formatted.estimate.cost.total = formatCurrencyForTemplate(formatted.estimate.cost.total);
    }

    if (typeof formatted.estimate.cost.subtotal === 'number') {
      formatted.estimate.cost.subtotal = formatCurrencyForTemplate(formatted.estimate.cost.subtotal);
    }

    if (typeof formatted.estimate.cost.contingency === 'number') {
      formatted.estimate.cost.contingency = formatCurrencyForTemplate(formatted.estimate.cost.contingency);
    }

    if (typeof formatted.estimate.cost.contingency_percent === 'number') {
      formatted.estimate.cost.contingency_percent = Math.round(formatted.estimate.cost.contingency_percent * 100);
    }

    if (formatted.estimate.cost.range) {
      formatted.estimate.cost.range.low = formatCurrencyForTemplate(formatted.estimate.cost.range.low);
      formatted.estimate.cost.range.high = formatCurrencyForTemplate(formatted.estimate.cost.range.high);
    }

    // Format cost breakdown (role-specific costs)
    if (formatted.estimate.cost.breakdown) {
      for (const key of Object.keys(formatted.estimate.cost.breakdown)) {
        if (typeof formatted.estimate.cost.breakdown[key] === 'number') {
          formatted.estimate.cost.breakdown[key] = formatCurrencyForTemplate(formatted.estimate.cost.breakdown[key]);
        }
      }
    }
  }

  // Format milestones
  if (formatted.milestones) {
    const totalHours = formatted.estimate?.hours?.total || 0;
    for (const milestone of formatted.milestones) {
      milestone.allocation_display = Math.round((milestone.allocation || 0) * 100) + '%';
      milestone.hours_formula = `${totalHours} × ${milestone.allocation || 0} = ${milestone.hours}`;
      if (typeof milestone.cost === 'number') {
        milestone.cost = formatCurrencyForTemplate(milestone.cost);
      }
    }
  }

  // Format payment schedule
  if (formatted.payment?.schedule) {
    for (const item of formatted.payment.schedule) {
      if (typeof item.amount === 'number') {
        item.amount = formatCurrencyForTemplate(item.amount);
      }
    }
  }

  // Format FinOps section
  if (formatted.finops) {
    formatted.finops.total_hours = formatted.estimate?.hours?.total || 0;
    if (typeof formatted.finops.raw_production_cost === 'number') {
      formatted.finops.raw_production_cost = formatCurrencyForTemplate(formatted.finops.raw_production_cost);
    }

    if (typeof formatted.finops.compute_estimate === 'number') {
      formatted.finops.compute_estimate = formatCurrencyForTemplate(formatted.finops.compute_estimate);
    }

    if (typeof formatted.finops.total_internal_cost === 'number') {
      formatted.finops.total_internal_cost = formatCurrencyForTemplate(formatted.finops.total_internal_cost);
    }

    if (typeof formatted.finops.target_price === 'number') {
      formatted.finops.target_price = formatCurrencyForTemplate(formatted.finops.target_price);
    }

    if (typeof formatted.finops.margin_amount === 'number') {
      formatted.finops.margin_amount = formatCurrencyForTemplate(formatted.finops.margin_amount);
    }

    if (typeof formatted.finops.margin_percent === 'number') {
      formatted.finops.margin_percent_display = Math.round(formatted.finops.margin_percent * 100);
    }

    if (typeof formatted.finops.internal_rate === 'number') {
      formatted.finops.internal_rate = formatCurrencyForTemplate(formatted.finops.internal_rate);
    }

    if (formatted.finops.roi && typeof formatted.finops.roi.monthly_value === 'number') {
      formatted.finops.roi.annual_value = formatCurrencyForTemplate((formatted.finops.roi.monthly_value || 0) * 12);
      formatted.finops.roi.monthly_value = formatCurrencyForTemplate(formatted.finops.roi.monthly_value);
    }

    // Page 8 Hidden Buffers: Add contingency data using pre-extracted raw values
    formatted.finops.contingency = formatCurrencyForTemplate(rawContingency);
    formatted.finops.contingency_percent = Math.round(rawContingencyPercent * 100);
    formatted.finops.subtotal = formatCurrencyForTemplate(rawSubtotal);
    formatted.finops.total_with_contingency = formatCurrencyForTemplate(rawTotal);

    // Page 8 Negotiation Guardrails: Walk-away price (internal cost + 20% minimum margin)
    formatted.finops.walk_away_price = formatCurrencyForTemplate(Math.round(rawInternalCost * 1.2));
  }

  // Format Commercial section
  if (formatted.commercial) {
    if (typeof formatted.commercial.subscription_price === 'number') {
      formatted.commercial.subscription_price = formatCurrencyForTemplate(formatted.commercial.subscription_price);
    }

    if (typeof formatted.commercial.ad_hoc_rate === 'number') {
      formatted.commercial.ad_hoc_rate = formatCurrencyForTemplate(formatted.commercial.ad_hoc_rate);
    }

    if (formatted.commercial.payment_terms) {
      formatted.commercial.payment_terms.upfront_percent_display =
        Math.round((formatted.commercial.payment_terms.upfront_percent || 0) * 100);
      formatted.commercial.payment_terms.final_percent_display =
        Math.round((formatted.commercial.payment_terms.final_percent || 0) * 100);
    }
  }

  return formatted;
}

/**
 * Unified Pipeline Class
 * Orchestrates the full presales document generation flow
 */
export class UnifiedPipeline {
  constructor(options = {}) {
    this.stats = {
      startTime: null,
      endTime: null,
      stages: {}
    };
    // Initialize schema with version metadata (Schema v2)
    this.schema = {
      $schema: 'wranngle://presales/v2',
      version: '2.0.0',
      generated_at: new Date().toISOString()
    };
    // Provenance tracking - records data origins during pipeline execution
    this.provenance = {
      pipeline_version: '1.5.0',
      stages: {},
      field_sources: {}
    };
    this.log = new PipelineLogger(options.logHandler);
    this.history = new HistoryManager();
    this.executionId = null;
    this.inputHash = null;
    // Structured input options (bypasses LLM extraction)
    this.forceStructured = options.structured || false;
    // Business profile enrichment (optional, from /api/generate)
    this.businessProfile = options.businessProfile || null;
  }

  /**
   * Detect if input is structured JSON
   * @param {string} content - File content
   * @param {string} filePath - File path for extension check
   * @returns {boolean} True if input is structured JSON
   */
  isStructuredInput(content, filePath) {
    // CLI flag override
    if (this.forceStructured) return true;

    // Extension check
    if (filePath.endsWith('.json')) return true;

    // Content detection (starts with { and is valid JSON)
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Stage 1-ALT: Extract from structured JSON input (no LLM)
   * Parses structured form data into intake schema
   * @param {string} inputPath - Path to JSON input file
   */
  async runStructuredExtract(inputPath) {
    this.log.stage(1, 'EXTRACT — Parse structured JSON input (no LLM)', '📄');

    // Read input file
    this.log.subStep('Reading structured input file');
    const rawContent = fs.readFileSync(inputPath, 'utf8');
    const inputBytes = Buffer.byteLength(rawContent, 'utf8');

    this.log.file('READ', inputPath, inputBytes);
    this.log.data('Mode', 'Structured JSON (LLM bypass)');

    // Parse JSON
    this.log.subStep('Parsing JSON');
    let formData;
    try {
      formData = JSON.parse(rawContent);
    } catch (error) {
      throw new Error(`Invalid JSON input: ${error.message}`);
    }

    // Calculate input hash for history tracking
    this.inputHash = crypto.createHash('sha256').update(rawContent).digest('hex');
    this.log.data('Input Hash', this.inputHash.slice(0, 8));

    // Load question database and systems catalog
    this.log.subStep('Loading question database');
    const questionDb = loadQuestionDatabase();
    const systemsCatalog = loadSystemsCatalog();
    this.log.data('Questions', questionDb.questions.length);
    this.log.dataLast('Systems', systemsCatalog.systems.length);

    // Detect if input is already intake format (e.g., from evaluation masker)
    const isAlreadyIntake = formData.section_a_workflow_definition || formData.prepared_for;

    let intake;
    if (isAlreadyIntake) {
      // Direct intake format - skip form transformation
      this.log.subStep('Detected direct intake format');
      intake = formData;
      this.log.success('Direct intake format accepted');
    } else {
      // Validate form data
      this.log.subStep('Validating form data');
      const validation = validateFormData(formData, questionDb.questions);
      if (validation.valid) {
        this.log.success('Form validation passed');
      } else {
        const errorCount = Object.keys(validation.errors).length;
        this.log.warn(`${errorCount} validation warnings`);
        for (const [field, errors] of Object.entries(validation.errors)) {
          this.log.data(field, errors.join('; '));
        }
      }

      // Transform form data to intake schema
      this.log.subStep('Transforming to IntakeSchema');
      intake = mapFormToIntake(formData, questionDb.questions);
      this.log.subStepDone('Transformation complete');
    }

    // Log extracted data details
    const clientName = intake.prepared_for?.account_name || 'Unknown';
    const workflowName = intake.section_a_workflow_definition?.q01_workflow_name || 'Unknown';

    this.log.data('Client Name', clientName);
    this.log.data('Workflow', workflowName);

    // Calculate lead qualification
    this.log.subStep('Calculating lead qualification');
    let leadQualification; let keyMetrics; let companyProfile;

    if (isAlreadyIntake) {
      // For direct intake, create default qualification based on intake data
      const systemsCount = intake.section_c_systems_handoffs?.q10_systems_involved?.length || 0;
      leadQualification = {
        score: 65,
        score_display: '65/100',
        status: 'warm',
        status_label: 'WARM',
        components: {
          budget: { score: 50, max: 20, label: 'Budget' },
          complexity: { score: 50, max: 15, label: 'Complexity' },
          volume: { score: 50, max: 15, label: 'Volume' },
          timeline: { score: 50, max: 10, label: 'Timeline' },
          decision_maker: { score: 50, max: 15, label: 'Decision Maker' },
          pain_severity: { score: 70, max: 15, label: 'Pain Severity' },
          api_readiness: { score: systemsCount > 0 ? 70 : 40, max: 10, label: 'API Readiness' },
        },
      };
      keyMetrics = {
        systems_count: systemsCount,
        volume_per_period: intake.section_b_volume_timing?.q06_runs_per_period || '100',
        period_unit: intake.section_b_volume_timing?.q06_period_unit || 'day',
      };
      companyProfile = {
        industry: 'General',
        size_category: 'Medium',
      };
    } else {
      leadQualification = getLeadQualification(formData, questionDb.qualification_config, systemsCatalog);
      keyMetrics = getKeyMetrics(formData, leadQualification);
      companyProfile = getCompanyProfile(formData);
    }

    this.log.data('Lead Score', leadQualification.score_display);
    this.log.data('Lead Status', leadQualification.status_label);
    this.log.dataLast('Systems Count', keyMetrics.systems_count);
    this.log.subStepDone('Lead qualification complete');

    // Build measurements from form data (simplified for structured input)
    const measurements = this._buildMeasurementsFromForm(formData, intake);

    // Store raw input stats
    this.rawInputOpening = rawContent.slice(0, 1000) + (rawContent.length > 1000 ? '...' : '');
    this.rawInputStats = { lines: rawContent.split('\n').length, words: 0, characters: rawContent.length };

    // Add to schema
    this.schema.intake = intake;
    this.schema.measurements = measurements;
    this.schema.raw_input = {
      opening: this.rawInputOpening,
      stats: this.rawInputStats,
      structured: true
    };

    // Add lead qualification to schema (with Mustache helper booleans)
    this.schema.lead_qualification = prepareLeadQualificationForTemplate(leadQualification);
    this.schema.key_metrics = prepareKeyMetricsForTemplate(keyMetrics);
    this.schema.company_profile = {
      ...companyProfile,
      ...this.businessProfile,
    };

    // Extract item_type from intake
    const volumeData = extractVolumeFromIntake(intake);
    this.schema.measurements.item_type = volumeData.item_type || 'items';

    // Product type detection (AI Voice Agent vs. Project)
    const classification = detectProductType(intake);
    intake.classification = classification;
    this.schema.intake = intake; // Ensure classification is in schema
    this.log.data('Project Type', classification.project_type_display);
    this.log.data('Is Product', classification.is_product ? 'Yes (AI Voice Agent)' : 'No (Custom Project)');
    this.log.data('Detection Confidence', classification.confidence_display);
    if (classification.is_product) {
      this.log.data('Matched Keywords', classification.matched_keywords.slice(0, 5).map(k => k.keyword).join(', '));
    }

    // Track provenance
    this.provenance.stages.extract = {
      model: 'none',
      source: 'structured_json',
      confidence: 'high'
    };
    this.provenance.field_sources.intake = { source: 'questionnaire_form', model: 'none' };
    this.provenance.field_sources.measurements = { source: 'questionnaire_form', model: 'none' };
    this.provenance.field_sources.lead_qualification = { source: 'calculated', formula: 'lead-scoring.js' };

    // Generate project identity
    this.log.subStep('Generating project identity');
    let identity = generateProjectIdentity(intake, { documentType: 'unified' });

    const nextRev = await this.history.getNextRevision(identity.client_slug, identity.project_slug);
    if (nextRev > 1) {
      this.log.info(`Found existing project. Bumping revision to ${nextRev}`);
      identity = generateProjectIdentity(intake, {
        documentType: 'unified',
        revision: nextRev
      });
    }

    // Schema v2: Set canonical identity source (SSOT)
    this.schema.identity = identity;
    // Legacy path (will be populated via expandLegacyPaths before render)
    this.schema.project_identity = identity;

    // Create execution record
    const exec = await this.history.startExecution(identity, inputPath, this.inputHash);
    this.executionId = exec.id;

    this.log.data('Document Slug', identity.document_slug);
    this.log.data('Client Slug', identity.client_slug);
    this.log.dataLast('Execution ID', this.executionId || 'N/A');
    this.log.subStepDone('Identity generated');

    // VALIDATION GATE: Ensure structured extraction produced usable data
    this.log.subStep('Validating structured input');
    const extractionValidation = validateExtractionGate(intake, measurements, {
      throwOnError: false,
      logWarnings: true
    });

    if (extractionValidation.warnings.length > 0) {
      this.log.warn(`Structured input has ${extractionValidation.warnings.length} warnings`);
    }

    this.log.subStepDone(extractionValidation.valid ? 'Structured input validated' : 'Structured input has issues');

    this.log.stageComplete({
      client: clientName,
      workflow: workflowName,
      leadScore: leadQualification.score,
      mode: 'structured'
    });
  }

  /**
   * Build measurements object from structured form data
   * @private
   */
  _buildMeasurementsFromForm(formData, _intake) {
    const runsPerPeriod = Number(formData.q06_runs_per_period) || 0;
    const periodUnit = formData.q06_period_unit || 'day';
    const avgTime = Number(formData.q07_avg_trigger_to_end) || 0;
    const timeUnit = formData.q07_time_unit || 'minutes';

    // Calculate monthly volume
    let monthlyVolume = runsPerPeriod;
    switch (periodUnit) {
      case 'hour': { monthlyVolume = runsPerPeriod * 24 * 30; break;
      }

      case 'day': { monthlyVolume = runsPerPeriod * 30; break;
      }

      case 'week': { monthlyVolume = runsPerPeriod * 4; break;
      }

      case 'month': { monthlyVolume = runsPerPeriod; break;
      }
    }

    // Calculate minutes per item
    let minutesPerItem = avgTime;
    switch (timeUnit) {
      case 'hours': { minutesPerItem = avgTime * 60; break;
      }

      case 'seconds': { minutesPerItem = avgTime / 60; break;
      }
    }

    // Assume hourly cost of $45 for bleed calculation
    const hourlyRate = 45;
    const monthlyMinutes = monthlyVolume * minutesPerItem;
    const monthlyHours = monthlyMinutes / 60;
    const monthlyBleed = monthlyHours * hourlyRate;

    return {
      measurements: [
        {
          id: 'monthly_volume',
          name: 'Monthly Volume',
          metric_type: 'count',
          value: monthlyVolume,
          value_display: `${monthlyVolume.toLocaleString()} items/mo`,
          unit: 'items/month',
          status: 'healthy',
          status_reason: 'Baseline metric'
        },
        {
          id: 'time_per_item',
          name: 'Time Per Item',
          metric_type: 'time',
          value: minutesPerItem,
          value_display: `${minutesPerItem} min`,
          unit: 'minutes',
          status: 'healthy',
          status_reason: 'Baseline metric'
        },
        {
          id: 'monthly_bleed',
          name: 'Monthly Time Bleed',
          metric_type: 'currency',
          value: monthlyBleed,
          value_display: `$${monthlyBleed.toLocaleString()}/mo`,
          unit: 'USD/month',
          status: monthlyBleed > 1000 ? 'critical' : monthlyBleed > 500 ? 'warning' : 'healthy',
          status_reason: monthlyBleed > 1000 ? 'High labor cost due to manual process' : 'Labor cost within acceptable range'
        }
      ],
      bleed_assumptions: [
        {
          id: 'a_hourly_rate',
          label: 'Hourly Labor Cost',
          value: hourlyRate,
          value_display: `$${hourlyRate}/hr`,
          source: 'Client-provided estimate'
        },
        {
          id: 'a_period',
          label: 'Measurement Period',
          value: 1,
          value_display: '1 month',
          source: 'Standard period'
        }
      ],
      bleed_total: {
        value: monthlyBleed,
        amount: monthlyBleed,  // backwards compat
        currency: 'USD',
        period: 'month',
        display: `$${monthlyBleed.toLocaleString()}/mo`
      }
    };
  }

  /**
   * Build client-facing pricing structure for template
   * Transforms root schema.pricing into template-expected format
   */
  _buildClientFacingPricing() {
    const rootPricing = this.schema.pricing || {};
    const milestones = rootPricing.milestones || {};
    
    const installments = Object.entries(milestones).map(([key, m]) => ({
      label: `${m.milestone_name || key}`,
      amount: {
        amount: m.amount || 0,
        currency: 'USD',
        period: 'once',
        display: `$${(m.amount || 0).toLocaleString()}`
      },
      percent: m.percentage || 0
    }));

    const finalPrice = rootPricing.final_price || 0;
    const subtotal = rootPricing.subtotal || finalPrice;

    return {
      currency: rootPricing.currency || 'USD',
      pricing_model: rootPricing.pricing_model || 'fixed_price',
      total: { amount: finalPrice, currency: 'USD', period: 'once', display: `$${finalPrice.toLocaleString()}` },
      subtotal: { amount: subtotal, currency: 'USD', period: 'once', display: `$${subtotal.toLocaleString()}` },
      payment_schedule: { schedule_type: 'milestone_based', installments },
      audit_credit: rootPricing.audit_credit || null,
      early_adopter_discount: rootPricing.early_adopter_discount || null,
      platform_fees: { platform: 'direct', fee_percentage: 0, fee_note: 'Direct engagement - no platform fees' }
    };
  }

  /**
   * Stage 1: Extract from raw input
   * Parses unstructured text into structured intake data
   */
  async runExtract(inputPath) {
    this.log.stage(1, 'EXTRACT — Parse raw input into structured intake', '📄');

    // Read input file
    this.log.subStep('Reading input file');
    const rawText = fs.readFileSync(inputPath, 'utf8');
    const inputBytes = Buffer.byteLength(rawText, 'utf8');
    const lineCount = rawText.split('\n').length;
    const wordCount = rawText.split(/\s+/).filter(Boolean).length;

    // Store raw input text opening for internal artifacts display (first 1000 chars)
    // This helps Wranngle team see the original source material
    this.rawInputOpening = rawText.slice(0, 1000) + (rawText.length > 1000 ? '...' : '');
    this.rawInputStats = { lines: lineCount, words: wordCount, characters: rawText.length };

    // Calculate input hash for history tracking
    this.inputHash = crypto.createHash('sha256').update(rawText).digest('hex');
    
    this.log.file('READ', inputPath, inputBytes);
    this.log.data('Lines', lineCount);
    this.log.data('Words', wordCount);
    this.log.data('Input Hash', this.inputHash.slice(0, 8));
    this.log.dataLast('Characters', rawText.length);
    this.log.subStepDone(`Read ${lineCount} lines, ${wordCount} words`);

    // Run LLM extraction
    this.log.subStep('Running LLM extraction (Gemini API)');
    this.log.data('Model', 'gemini-3-flash-preview');
    this.log.dataLast('Task', 'Extract client info, workflow definition, measurements');

    const extractor = new Extractor({
      apiKey: process.env.GEMINI_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
      verbose: false // We handle logging
    });

    const { intake, measurements } = await extractor.extract(rawText);
    this.log.subStepDone('LLM extraction complete');

    // Log extracted data details
    this.log.subStep('Processing extracted data');
    const clientName = intake.prepared_for?.account_name || intake.client?.name || 'Unknown';
    const workflowName = intake.section_a_workflow_definition?.q01_workflow_name || intake.project?.workflow_name || 'Unknown';
    const measurementCount = measurements?.measurements?.length || 0;

    this.log.data('Client Name', clientName);
    this.log.data('Workflow', workflowName);
    this.log.data('Measurements Found', measurementCount);

    // Log intake structure
    this.log.json('Intake Schema', intake);

    // Log measurements detail
    if (measurements?.measurements?.length > 0) {
      const measurementNames = measurements.measurements.map(m => m.metric_name || m.name || 'unnamed');
      this.log.list('Measurement Types', measurementNames);

      // Log bleed if found
      const bleedMeasurement = measurements.measurements.find(
        m => m.metric_name?.toLowerCase().includes('bleed') || m.metric_name?.toLowerCase().includes('cost')
      );
      if (bleedMeasurement) {
        this.log.currency('Monthly Bleed Detected', bleedMeasurement.measured_value);
      }
    }

    // Add to schema
    this.schema.intake = intake;
    this.schema.measurements = measurements;
    this.schema.raw_input = {
      opening: this.rawInputOpening || '',
      stats: this.rawInputStats || { lines: 0, words: 0, characters: 0 }
    };

    // Extract item_type from intake for bleed calculations (e.g., "appointments", "orders")
    // This enables the LLM to generate specific math_defender_text like "200 appointments/day"
    const volumeData = extractVolumeFromIntake(intake);
    this.schema.measurements.item_type = volumeData.item_type || 'items';
    this.log.data('Item Type', this.schema.measurements.item_type);

    // Product type detection (AI Voice Agent vs. Project)
    const classification = detectProductType(intake);
    intake.classification = classification;
    this.log.data('Project Type', classification.project_type_display);
    this.log.data('Is Product', classification.is_product ? 'Yes (AI Voice Agent)' : 'No (Custom Project)');
    this.log.data('Detection Confidence', classification.confidence_display);
    if (classification.is_product) {
      this.log.data('Matched Keywords', classification.matched_keywords.slice(0, 5).map(k => k.keyword).join(', '));
    }

    // Track provenance for extracted fields (Schema v2)
    this.provenance.stages.extract = {
      model: 'gemini-3-flash-preview',
      source: 'llm_extraction',
      confidence: 'medium'
    };
    this.provenance.field_sources.intake = { source: 'llm_extract', model: 'gemini-3-flash' };
    this.provenance.field_sources.measurements = { source: 'llm_extract', model: 'gemini-3-flash' };
    this.provenance.field_sources['measurements.bleed_total'] = { source: 'calculated', formula: 'deterministic_js' };

    // Generate project identity with history revisioning
    this.log.subStep('Generating project identity');
    
    // 1. Generate initial identity to get slugs
    let identity = generateProjectIdentity(intake, {
      documentType: 'unified'
    });
    
    // 2. Check history for next revision
    const nextRev = await this.history.getNextRevision(identity.client_slug, identity.project_slug);
    if (nextRev > 1) {
      this.log.info(`Found existing project. Bumping revision to ${nextRev}`);
      identity = generateProjectIdentity(intake, {
        documentType: 'unified',
        revision: nextRev
      });
    }

    // 3. Start execution tracking
    const exec = await this.history.startExecution(identity, inputPath, this.inputHash);
    this.executionId = exec.id;

    // Schema v2: Set canonical identity source (SSOT)
    this.schema.identity = identity;
    // Legacy path (will be populated via expandLegacyPaths before render)
    this.schema.project_identity = identity;

    this.log.data('Document Slug', this.schema.project_identity.document_slug);
    this.log.data('Client Slug', this.schema.project_identity.client_slug);
    this.log.data('Revision', nextRev);
    this.log.data('Execution ID', this.executionId);
    this.log.dataLast('Process Date', this.schema.project_identity.process_date_display);
    this.log.subStepDone(`Identity: ${this.schema.project_identity.document_slug}`);

    this.stats.stages.extract = {
      complete: true,
      client: clientName,
      workflow: workflowName,
      measurementCount,
      inputBytes,
      lineCount,
      wordCount
    };

    // VALIDATION GATE: Ensure extraction produced usable data
    this.log.subStep('Validating extraction output');
    const extractionValidation = validateExtractionGate(intake, measurements, {
      throwOnError: false, // Log warnings but don't fail - allow pipeline to continue
      logWarnings: true
    });

    if (extractionValidation.warnings.length > 0) {
      this.log.warn(`Extraction has ${extractionValidation.warnings.length} warnings`);
    }

    if (!extractionValidation.valid) {
      this.log.error(`Extraction validation failed: ${extractionValidation.errors.join(', ')}`);
    }

    this.log.subStepDone(extractionValidation.valid ? 'Extraction validated' : 'Extraction has issues');

    this.log.stageComplete({ client: clientName, measurements: measurementCount });
    return { intake, measurements };
  }

  /**
   * Stage 2: Research integrations and prospect
   * Uses n8n research library and Exa API
   */
  async runResearch() {
    this.log.stage(2, 'RESEARCH — Integration analysis & tier assessment', '🔍');

    let integrationResearch = [];

    // Check n8n research library
    this.log.subStep('Checking n8n research library status');
    const libraryStatus = getLibraryStatus();
    this.log.data('Library Available', libraryStatus.available ? 'Yes' : 'No');
    if (libraryStatus.path) {
      this.log.data('Library Path', libraryStatus.path);
    }

    if (libraryStatus.fileCount) {
      this.log.dataLast('Research Files', libraryStatus.fileCount);
    }

    this.log.subStepDone(libraryStatus.available ? 'Library ready' : 'Library unavailable');

    // Research integrations
    if (libraryStatus.available) {
      this.log.subStep('Researching integrations from intake');

      try {
        // Merge business_profile.tech_stack into intake systems for research
        if (this.businessProfile?.tech_stack?.length > 0) {
          const existing = this.schema.intake?.section_c_systems_handoffs?.q10_systems_involved || [];
          const existingLower = new Set(existing.map(s => (typeof s === 'string' ? s : s.name || '').toLowerCase()));
          const newSystems = this.businessProfile.tech_stack.filter(t => !existingLower.has(t.toLowerCase()));
          if (newSystems.length > 0) {
            if (!this.schema.intake.section_c_systems_handoffs) {
              this.schema.intake.section_c_systems_handoffs = { q10_systems_involved: [] };
            }

            this.schema.intake.section_c_systems_handoffs.q10_systems_involved = [...existing, ...newSystems];
            this.log.data('Tech Stack Merged', `${newSystems.length} systems from business_profile`);
          }
        }

        integrationResearch = await researchAllIntegrations(this.schema.intake);

        // Generate research gap report (let allows reassignment after proactive research)
        let gapReport = generateResearchGapReport(integrationResearch);

        this.log.data('Total Integrations', gapReport.summary.total);
        this.log.data('Fresh (from cache)', gapReport.summary.fresh);
        this.log.data('Stale (>30 days)', gapReport.summary.stale);
        this.log.data('Missing', gapReport.summary.missing);

        // Show research-derived metrics
        if (gapReport.average_complexity) {
          this.log.data('Avg Complexity', `${gapReport.average_complexity}/10`);
        }

        if (gapReport.research_derived_hours) {
          this.log.data('Research Base Hours', gapReport.research_derived_hours);
        }

        // List integration names
        const integrationNames = integrationResearch.map(r => r.system || r.name || 'unknown');
        this.log.list('Systems Researched', integrationNames);

        // PROACTIVE RESEARCH: Trigger LLM research for missing/stale integrations
        if (gapReport.summary.needs_research > 0) {
          this.log.subStep(`Triggering proactive research for ${gapReport.summary.needs_research} integration(s)`);

          // Collect names of missing/stale integrations
          const missingNames = gapReport.missing.map(m => m.name);
          const staleNames = gapReport.stale.map(s => s.name);
          const needsResearch = [...new Set([...missingNames, ...staleNames])];

          this.log.data('Missing', missingNames.join(', ') || 'None');
          this.log.data('Stale', staleNames.join(', ') || 'None');

          try {
            // Extract client/workflow context for research reports
            const clientName = this.schema.intake?.prepared_for?.account_name ||
              this.schema.intake?.client?.name || 'Unknown';
            const workflowName = this.schema.intake?.section_a_workflow_definition?.q01_workflow_name ||
              this.schema.intake?.project?.workflow_name || 'Unknown';

            // Perform proactive research using LLM
            const proactiveResults = await performProactiveResearch(needsResearch, {
              saveToCache: true,
              clientName,
              workflowName
            });

            // Merge with existing results
            integrationResearch = mergeResearchResults(integrationResearch, proactiveResults);

            // Update gap report with new data
            const updatedGapReport = generateResearchGapReport(integrationResearch);
            gapReport = updatedGapReport;

            // Show summary of proactive research
            const summary = generateResearchSummary(proactiveResults);
            this.log.data('Proactive Successful', `${summary.successful_research}/${summary.total_integrations}`);
            this.log.data('Total Est. Hours', summary.total_estimated_hours);
            this.log.data('Avg Complexity', `${summary.average_complexity}/10`);

            this.log.subStepDone(`Proactive research complete`);
          } catch (proactiveError) {
            this.log.error('Proactive research failed', proactiveError);
            this.log.warn('Continuing with partial research data');
          }
        }

        // Store gap report for later use
        this.schema.research_gap_report = gapReport;

        this.log.subStepDone(`${gapReport.summary.fresh}/${gapReport.summary.total} integrations have research`);
      } catch (error) {
        this.log.error('Integration research failed', error);
        this.log.warn('Continuing without integration research');
      }
    } else {
      // Library not available - do proactive research directly
      this.log.warn(`Research library unavailable: ${libraryStatus.error || 'Not found'}`);
      this.log.subStep('Triggering proactive research (library unavailable)');

      try {
        // Extract integration names from intake
        const systemsInvolved = this.schema.intake?.section_c_systems_handoffs?.q10_systems_involved || [];
        const projectIntegrations = this.schema.intake?.project?.integrations || [];

        const integrationNames = new Set();
        for (const system of systemsInvolved) {
          const name = typeof system === 'string' ? system : system.name;
          if (name) {
            // Extract tool name from parentheses if present (e.g., "CRM (HubSpot)" -> "HubSpot")
            const parenMatch = name.match(/\(([^)]+)\)/);
            if (parenMatch) integrationNames.add(parenMatch[1].trim());
            const baseName = name.replace(/\s*\([^)]+\)/, '').trim();
            if (baseName && baseName.length > 1) integrationNames.add(baseName);
          }
        }

        for (const integration of projectIntegrations) {
          const name = typeof integration === 'string' ? integration : integration.name;
          if (name) integrationNames.add(name);
        }

        const names = [...integrationNames];
        this.log.data('Integrations Found', names.join(', ') || 'None');

        if (names.length > 0) {
          // Extract client/workflow context for research reports
          const clientName = this.schema.intake?.prepared_for?.account_name ||
            this.schema.intake?.client?.name || 'Unknown';
          const workflowName = this.schema.intake?.section_a_workflow_definition?.q01_workflow_name ||
            this.schema.intake?.project?.workflow_name || 'Unknown';

          const proactiveResults = await performProactiveResearch(names, {
            saveToCache: true,
            clientName,
            workflowName
          });
          integrationResearch = proactiveResults;

          const summary = generateResearchSummary(proactiveResults);
          this.log.data('Proactive Successful', `${summary.successful_research}/${summary.total_integrations}`);
          this.log.data('Total Est. Hours', summary.total_estimated_hours);
          this.log.subStepDone('Proactive research complete');
        } else {
          this.log.warn('No integrations found in intake');
        }
      } catch (proactiveError) {
        this.log.error('Proactive research failed', proactiveError);
      }
    }

    // Quick tier assessment
    this.log.subStep('Running complexity tier assessment');
    const tierAssessment = await quickTierAssessment(this.schema.intake);

    if (tierAssessment) {
      this.log.data('Tier Key', tierAssessment.key);
      this.log.data('Tier Label', tierAssessment.label);
      this.log.data('Base Hours', tierAssessment.baseHours);
      this.log.data('Risk Multiplier', tierAssessment.riskMultiplier);
      if (tierAssessment.factors?.length > 0) {
        this.log.list('Complexity Factors', tierAssessment.factors);
      }
    }

    this.log.subStepDone(`Tier: ${tierAssessment?.key || 'unknown'}`);

    // Add to schema
    this.schema.research = {
      integrations: integrationResearch,
      tier_assessment: tierAssessment
    };

    // Build unified system intelligence map (catalog + research merged)
    this.log.subStep('Building unified system intelligence map');
    const systemNames = integrationResearch.map(r => r.system || r.integration).filter(Boolean);
    try {
      this.schema.system_intelligence = await getAllSystemIntelligence(systemNames);
      this.log.data('Systems Mapped', this.schema.system_intelligence.size);
    } catch (error) {
      this.log.warn(`System intelligence lookup failed: ${error.message}`);
      this.schema.system_intelligence = new Map();
    }

    this.stats.stages.research = {
      complete: true,
      integrationCount: integrationResearch.length,
      tier: tierAssessment?.key,
      cached: integrationResearch.filter(r => r.research?.from_cache).length
    };

    this.log.stageComplete({
      integrations: integrationResearch.length,
      tier: tierAssessment?.key || 'unknown'
    });
    return this.schema.research;
  }

  /**
   * Stage 3: Build Project Plan fields
   * Generates estimate and project structure
   */
  async runProjectPlan() {
    this.log.stage(3, 'PROJECT PLAN — Generate estimate & project structure', '📊');

    // Generate estimate
    this.log.subStep('Generating effort estimate');
    const tierKey = this.schema.research?.tier_assessment?.key || 'unknown';
    const tierHours = this.schema.research?.tier_assessment?.baseHours || 0;

    // Check for research-derived base hours (more accurate than tier-based)
    const researchHours = getResearchDerivedBaseHours(
      this.schema.research?.integrations || [],
      this.schema.research?.tier_assessment
    );

    // Use research hours if available and higher than tier hours
    const effectiveBaseHours = Math.max(researchHours, tierHours);

    this.log.data('Input Tier', tierKey);
    this.log.data('Tier Base Hours', tierHours);
    if (researchHours > 0 && researchHours !== tierHours) {
      this.log.data('Research Base Hours', researchHours);
      this.log.data('Effective Base Hours', effectiveBaseHours);
    }

    // Build enriched research object with tier assessment and integration research
    const enrichedResearch = {
      ...this.schema.research?.tier_assessment,
      baseHours: effectiveBaseHours, // Use research-derived hours
      researchDerivedHours: researchHours,
      integrations: this.schema.research?.integrations || [],
      gapReport: this.schema.research_gap_report || null
    };

    const estimate = await generateEstimate(
      this.schema.intake,
      enrichedResearch
    );

    // Log estimate details
    const adjustedHours = estimate?.effort?.adjusted_hours?.total || estimate?.hours?.total || 0;
    const baseHours = estimate?.effort?.base_hours?.total || estimate?.hours?.base || 0;
    const riskMultiplier = estimate?.effort?.risk_multiplier || 1;
    this.log.data('Base Hours Calculated', baseHours);
    this.log.data('Risk Multiplier', riskMultiplier);
    this.log.data('Adjusted Hours', adjustedHours);

    // Log hour breakdown by category
    const hourBreakdown = estimate?.effort?.adjusted_hours || estimate?.hours || {};
    if (Object.keys(hourBreakdown).length > 0) {
      this.log.json('Hours Breakdown', hourBreakdown);
    }

    // Log cost calculation
    const hourlyRate = estimate?.cost?.hourly_rate || 85;
    const subtotal = estimate?.cost?.subtotal || 0;
    const contingency = estimate?.cost?.contingency || 0;
    const totalCost = estimate?.cost?.total || 0;
    this.log.data('Hourly Rate', `$${hourlyRate}`);
    this.log.data('Subtotal', `$${subtotal.toLocaleString()}`);
    this.log.data('Contingency', `$${contingency.toLocaleString()}`);
    this.log.currency('Total Estimate', totalCost);
    this.log.subStepDone(`Estimate: $${totalCost.toLocaleString()} (${adjustedHours}h)`);

    // Transform to project plan
    this.log.subStep('Transforming to project plan structure');
    this.log.data('Integration Count', this.schema.research?.integrations?.length || 0);

    const projectPlan = transformToProjectPlan(
      this.schema.intake,
      this.schema.research?.tier_assessment,
      estimate,
      { integrationResearch: this.schema.research?.integrations }
    );

    // Log project plan structure
    const milestoneCount = projectPlan?.milestones?.length || 0;
    const riskCount = projectPlan?.risks?.length || 0;
    const assumptionCount = projectPlan?.assumptions?.length || 0;
    this.log.data('Milestones', milestoneCount);
    this.log.data('Risks Identified', riskCount);
    this.log.data('Assumptions', assumptionCount);

    // Log milestone details
    if (projectPlan?.milestones?.length > 0) {
      const milestoneNames = projectPlan.milestones.map(m =>
        `${m.name || m.title} (${m.hours || 0}h, ${Math.round((m.allocation || 0) * 100)}%)`
      );
      this.log.list('Milestone Breakdown', milestoneNames);
    }

    this.log.subStepDone(`Plan built: ${milestoneCount} milestones, ${riskCount} risks`);

    // Inject extracted bleed_total into finops for consistency with audit/proposal
    // This ensures all three reports use the same bleed value source
    const extractedBleed = this.schema.measurements?.bleed_total?.value || 0;
    
    // SCHEMA VALIDATION GATE - Validate bleed output before using in calculations
    if (this.schema.measurements?.bleed_total) {
      const bleedValidation = validateBleedOutputGate(this.schema.measurements.bleed_total, { logWarnings: true });
      if (!bleedValidation.valid) {
        this.log.warn('Bleed validation warnings:', bleedValidation.errors);
      }
    }
    
    if (estimate?.finops && extractedBleed > 0) {
      this.log.subStep('Synchronizing bleed data with audit extraction');
      this.log.currency('Extracted Bleed (from audit)', extractedBleed);

      // Override the calculated hard_savings with extracted bleed data
      const annualBleed = extractedBleed * 12;
      
      // Calculate hours saved from bleed using client's hourly rate
      const clientHourlyRate = this.schema.measurements?.bleed_assumptions?.find(a => a.id === 'a_hourly_rate')?.value || 50;
      const hoursSavedMonthly = Math.round((extractedBleed / clientHourlyRate) * 10) / 10;
      
      estimate.finops.value_breakdown = estimate.finops.value_breakdown || {};
      estimate.finops.value_breakdown.hard_savings = {
        monthly: extractedBleed,
        annual: annualBleed,
        monthly_display: formatCurrency(extractedBleed),
        annual_display: formatCurrency(annualBleed),
        hours_saved_monthly: hoursSavedMonthly,
        client_hourly_value: clientHourlyRate,
        type: 'hard_savings',
        label: 'Labor/Process Savings (from Audit)',
        formula: `Audit bleed $${extractedBleed.toLocaleString()}/mo × 12`
      };

      // Ensure modeled_opportunity has proper structure (preserve or use intelligent calculation)
      if (!estimate.finops.value_breakdown.modeled_opportunity ||
        typeof estimate.finops.value_breakdown.modeled_opportunity.annual !== 'number') {
        // INTELLIGENT: Extract volume from intake instead of hardcoded default
        const volumeData = extractVolumeFromIntake(this.schema.intake);
        const dailyLeads = volumeData.daily_volume;
        const liftPercent = 1;
        const avgDealValue = 500; // Realistic default for service businesses (was $5000)
        let monthlyOpportunity = dailyLeads * 30 * (liftPercent / 100) * avgDealValue;

        // GUARDRAILS: Cap modeled opportunity to prevent unrealistic projections
        const maxMonthlyOpp = 50_000; // Hard cap at $50K/month
        let wasCapped = false;
        let capReason = '';

        if (monthlyOpportunity > maxMonthlyOpp) {
          wasCapped = true;
          capReason = `capped at $${maxMonthlyOpp.toLocaleString()}/mo max`;
          monthlyOpportunity = maxMonthlyOpp;
        }

        // Secondary cap: modeled opportunity shouldn't exceed 2x hard savings
        const hardSavingsMonthly = estimate.finops.value_breakdown.hard_savings?.monthly || extractedBleed;
        const hardSavingsCap = hardSavingsMonthly * 2;
        if (monthlyOpportunity > hardSavingsCap) {
          wasCapped = true;
          capReason = `capped at 2x hard savings ($${hardSavingsCap.toLocaleString()}/mo)`;
          monthlyOpportunity = hardSavingsCap;
        }

        const annualOpportunity = monthlyOpportunity * 12;
        const monthlyRounded = Math.round(monthlyOpportunity);
        const annualRounded = Math.round(annualOpportunity);

        // Build formula with source attribution
        const volumeNote = volumeData.source === 'intake_section_b'
          ? '(from intake)'
          : volumeData.source === 'industry_heuristic'
            ? `(est. from ${volumeData.keyword_matched})`
            : '(default)';

        const formulaBase = `${Math.round(dailyLeads)} ${volumeNote}/day × 30 × ${liftPercent}% × $${avgDealValue.toLocaleString()}`;
        const formulaWithCap = wasCapped ? `${formulaBase} → ${capReason}` : formulaBase;

        estimate.finops.value_breakdown.modeled_opportunity = {
          monthly: monthlyRounded,
          annual: annualRounded,
          monthly_display: `$${monthlyRounded.toLocaleString()}`,
          annual_display: `$${annualRounded.toLocaleString()}`,
          type: 'modeled_opportunity',
          label: `Modeled Opportunity (Est. ${liftPercent}% Lift)`,
          formula: formulaWithCap,
          volume_source: volumeData.source,
          volume_confidence: volumeData.confidence,
          was_capped: wasCapped
        };
        this.log.subStep(`Volume: ${Math.round(dailyLeads)}/day (${volumeData.source})${wasCapped ? ` [${capReason}]` : ''}`);
      }

      // Recalculate totals after hard_savings update
      const hardMonthly = estimate.finops.value_breakdown.hard_savings.monthly;
      const hardAnnual = estimate.finops.value_breakdown.hard_savings.annual;
      const modeledMonthly = estimate.finops.value_breakdown.modeled_opportunity.monthly || 0;
      const modeledAnnual = estimate.finops.value_breakdown.modeled_opportunity.annual || 0;

      const totalMonthlyValue = hardMonthly + modeledMonthly;
      const totalAnnualValue = hardAnnual + modeledAnnual;

      estimate.finops.value_breakdown.total_monthly_value = totalMonthlyValue;
      estimate.finops.value_breakdown.total_annual_value = totalAnnualValue;
      estimate.finops.value_breakdown.display_note = 'Labor Savings + Revenue Impact = Total Value';

      // CRITICAL: Use utility to regenerate ALL display fields after bleed sync
      // This prevents the display field desync bug (documented in CLAUDE.md)
      estimate.finops = regenerateFinopsDisplayFields(estimate.finops, totalCost);

      // ALSO sync projectPlan.finops to the updated estimate.finops
      // (transformToProjectPlan creates projectPlan.finops = estimate.finops reference,
      // but regenerateFinopsDisplayFields creates a NEW object)
      projectPlan.finops = estimate.finops;
      this.log.subStep('DISPLAY SYNC: projectPlan.finops = estimate.finops');
      this.log.data('estimate.finops.value_breakdown.total_annual_display', estimate.finops?.value_breakdown?.total_annual_display);
      this.log.data('projectPlan.finops.value_breakdown.total_annual_display', projectPlan.finops?.value_breakdown?.total_annual_display);

      this.log.currency('Annual Hard Savings (synced)', annualBleed);
      this.log.currency('Annual Modeled Opportunity', modeledAnnual);
      this.log.subStepDone('Bleed synced from audit extraction');
    }

    // Add to schema
    this.schema.estimate = estimate;
    this.schema.project_plan = projectPlan;

    this.stats.stages.projectPlan = {
      complete: true,
      estimatedHours: adjustedHours,
      estimatedCost: totalCost,
      milestoneCount,
      riskCount
    };

    this.log.stageComplete({
      hours: adjustedHours,
      cost: `$${totalCost.toLocaleString()}`,
      milestones: milestoneCount
    });
    return projectPlan;
  }

  /**
   * Stage 4: Build Proposal fields
   * Calculates pricing and builds milestone structure
   */
  async runProposal() {
    this.log.stage(4, 'PROPOSAL — Calculate pricing & build milestones', '💰');

    // Build proposal from accumulated schema (including project_plan for pricing alignment)
    this.log.subStep('Preparing proposal input data');
    const proposalData = {
      intake: this.schema.intake,
      measurements: this.schema.measurements,
      estimate: this.schema.estimate,
      project_identity: this.schema.project_identity,
      project_plan: this.schema.project_plan,  // Include for pricing alignment
      business_profile: this.businessProfile || null
    };
    // Inject industry from business_profile into client for assessComplexity() lookup
    if (this.businessProfile?.industry) {
      proposalData.client = { ...proposalData.client, industry: this.businessProfile.industry };
    }

    this.log.data('Intake Keys', Object.keys(this.schema.intake || {}).length);
    this.log.data('Measurements', this.schema.measurements?.measurements?.length || 0);
    this.log.data('Estimate Available', this.schema.estimate ? 'Yes' : 'No');
    this.log.data('Project Plan Available', this.schema.project_plan ? 'Yes' : 'No');
    this.log.subStepDone('Input data assembled');

    // Check if this is a product (AI Voice Agent) or custom project
    const isProduct = this.schema.intake?.classification?.is_product || false;
    this.log.data('Pricing Mode', isProduct ? 'Product (AI Voice Agent)' : 'Project (Custom)');

    // Calculate pricing based on product type
    this.log.subStep('Calculating pricing');
    let pricing;
    let productPricing = null;
    let finalPrice;

    if (isProduct) {
      // Product pricing: Setup fee + monthly recurring
      // Pass monthlyBleed from measurements (same source as audit report)
      const monthlyBleed = this.schema.measurements?.bleed_total?.value || 0;
      productPricing = calculateProductPricing(this.schema.intake, { monthlyBleed });
      finalPrice = productPricing.first_year.amount;

      this.log.currency('Setup Fee', productPricing.setup_fee.amount);
      this.log.currency('Monthly Recurring', productPricing.monthly.amount);
      this.log.currency('First Year Total', finalPrice);
      this.log.data('Product Tier', productPricing.tier.name);

      // Log product ROI for verification
      this.log.currency('Monthly Bleed (for ROI)', productPricing.roi.monthly_bleed);
      this.log.currency('Net Monthly Savings', productPricing.roi.net_monthly_savings);
      this.log.data('Payback Period', productPricing.roi.payback_display);

      // Create compatible pricing object for templates
      pricing = {
        pricing_model: 'hybrid_product',
        is_product: true,
        base_price: productPricing.setup_fee.amount,
        final_price: finalPrice,
        subtotal: productPricing.setup_fee.amount,
        total: { amount: finalPrice, display: productPricing.first_year.display },
        milestones: null, // Products don't use traditional milestones
        product_pricing: productPricing
      };
    } else {
      // Standard project pricing — pass business profile enrichment options
      const pricingOptions = {};
      if (this.businessProfile?.employee_count) {
        const { getCompanySizeSegment } = await import('./schemas/business-profile.schema.js');
        pricingOptions.company_size_segment = getCompanySizeSegment(this.businessProfile.employee_count);
      }

      pricing = calculatePricing(proposalData, pricingOptions);

      const basePrice = pricing?.base_price || pricing?.subtotal || 0;
      const discount = pricing?.discount || 0;
      const discountPercent = pricing?.discount_percent || 0;
      finalPrice = pricing?.final_price || pricing?.total || 0;
      this.log.currency('Base Price', basePrice);
      if (discount > 0) {
        this.log.data('Discount', `$${discount.toLocaleString()} (${Math.round(discountPercent * 100)}%)`);
      }

      this.log.currency('Final Price', finalPrice);

      // Log pricing breakdown if available
      if (pricing?.breakdown) {
        this.log.json('Pricing Breakdown', pricing.breakdown);
      }
    }

    this.log.subStepDone(`Price: $${finalPrice.toLocaleString()}`);

    // Build milestones (product or project)
    this.log.subStep('Building payment milestones');
    const milestones = await (isProduct && productPricing ? buildProductPhases(this.schema.intake, productPricing) : buildPhases(proposalData, pricing));
    const milestoneCount = milestones?.length || 0;
    this.log.data('Milestone Count', milestoneCount);

    // Extract Phase 2 (Stabilize) milestones for payment schedule display
    const phase2 = milestones?.find(p => p.phase_number === 2);
    if (phase2?.milestones?.length > 0) {
      const milestoneDetails = phase2.milestones.map(m =>
        `${m.milestone_name}: ${m.price_allocation?.display || '$0'} (${m.price_allocation?.percentage || 0}%)`
      );
      this.log.list('Payment Schedule', milestoneDetails);
    }

    this.log.subStepDone(`${milestoneCount} phases defined`);

    // Calculate ROI - Use bleed_total from extraction (same source as audit report)
    this.log.subStep('Calculating ROI metrics');
    const monthlyBleed = this.schema.measurements?.bleed_total?.value || 0;
    this.log.currency('Monthly Bleed (from bleed_total)', monthlyBleed);

    const roiOptions = {};
    if (this.businessProfile?.revenue_estimate) {
      const { parseRevenueEstimate } = await import('./schemas/business-profile.schema.js');
      const parsed = parseRevenueEstimate(this.businessProfile.revenue_estimate);
      if (parsed) roiOptions.revenue_midpoint = parsed.midpoint;
    }

    const roi = calculateROI(monthlyBleed, finalPrice, roiOptions);
    if (roi) {
      this.log.data('Payback Period', roi.payback_display || 'N/A');
      this.log.data('Annual Savings', roi.annual_recovery?.display || 'N/A');
      this.log.data('Annual ROI', roi.annual_roi_percent ? `${roi.annual_roi_percent}%` : 'N/A');
    }

    this.log.subStepDone(roi?.payback_display ? `Payback: ${roi.payback_display}` : 'ROI calculated');

    // Build full proposal
    this.log.subStep('Assembling full proposal document');
    const proposal = await buildProposal(proposalData, {
      platform: 'direct',
      valid_days: 14
    });

    const proposalSections = Object.keys(proposal || {}).filter(k => proposal[k] !== null);
    this.log.data('Proposal Sections', proposalSections.length);
    this.log.list('Section Keys', proposalSections, 10);
    this.log.subStepDone('Proposal assembled');

    // Add to schema
    this.schema.pricing = pricing;
    this.schema.milestones = milestones;
    this.schema.roi = roi;
    this.schema.proposal = proposal;
    if (productPricing) {
      this.schema.product_pricing = productPricing;
    }

    this.stats.stages.proposal = {
      complete: true,
      totalPrice: finalPrice,
      milestoneCount,
      monthlyBleed,
      paybackMonths: roi?.payback_months
    };

    this.log.stageComplete({
      price: `$${finalPrice.toLocaleString()}`,
      milestones: milestoneCount,
      payback: roi?.payback_months ? `${roi.payback_months}mo` : 'N/A'
    });
    return proposal;
  }

  /**
   * Stage 5: Build AI Process Report fields
   * Generates audit findings and scorecard
   */
  async runAuditReport() {
    this.log.stage(5, 'AI PROCESS REPORT — Generate audit findings & scorecard', '🔬');

    // Transform to audit report format
    this.log.subStep('Transforming intake to audit report structure');
    this.log.data('Intake Available', this.schema.intake ? 'Yes' : 'No');
    this.log.data('Measurements Available', this.schema.measurements ? 'Yes' : 'No');

    const auditReport = transformAudit(this.schema.intake, this.schema.measurements);

    // Log audit structure details
    const sectionCount = Object.keys(auditReport || {}).filter(k =>
      k.startsWith('section_') || k === 'executive_summary' || k === 'scorecard'
    ).length;
    this.log.data('Report Sections', sectionCount);

    // Log scorecard if present
    if (auditReport?.scorecard) {
      const {scorecard} = auditReport;
      
      // Calculate overall score if missing or 0
      if (!scorecard.overall_score || scorecard.overall_score === 0) {
        const counts = scorecard.overall?.status_distribution || { critical: 0, warning: 0, healthy: 0 };
        const total = (counts.critical || 0) + (counts.warning || 0) + (counts.healthy || 0);
        
        if (total > 0) {
          // Healthy = 100, Warning = 50, Critical = 0
          const weightedSum = (counts.healthy * 100) + (counts.warning * 50);
          scorecard.overall_score = Math.round(weightedSum / total);
          scorecard.overall_status = scorecard.overall_score > 80 ? 'healthy' : (scorecard.overall_score > 50 ? 'warning' : 'critical');
        } else {
          // Absolute fallback if no measurements found
          scorecard.overall_score = 75; // Default moderate health
          scorecard.overall_status = 'warning';
        }
      }

      this.log.data('Overall Score', `${scorecard.overall_score}%`);
      this.log.data('Status', scorecard.overall_status);

      // Log category scores
      if (scorecard.categories?.length > 0) {
        const categoryDetails = scorecard.categories.map(c =>
          `${c.name}: ${c.score}% (${c.status})`
        );
        this.log.list('Category Scores', categoryDetails);
      }
    }

    // Log findings if present
    if (auditReport?.findings?.length > 0) {
      const criticalCount = auditReport.findings.filter(f => f.severity === 'critical').length;
      const warningCount = auditReport.findings.filter(f => f.severity === 'warning').length;
      const healthyCount = auditReport.findings.filter(f => f.severity === 'healthy').length;
      this.log.data('Critical Findings', criticalCount);
      this.log.data('Warning Findings', warningCount);
      this.log.data('Healthy Findings', healthyCount);
    }

    this.log.subStepDone(`Audit structure built: ${sectionCount} sections`);

    // Add to schema
    this.schema.audit_report = auditReport;

    // Get placeholders that need LLM fill
    this.log.subStep('Identifying LLM placeholders');
    const placeholders = getLLMPlaceholders(auditReport);
    this.log.data('Total Placeholders', placeholders.length);

    // Group placeholders by type
    const placeholderTypes = {};
    for (const p of placeholders) {
      const type = (p.path || p).split('.')[0] || 'other';
      placeholderTypes[type] = (placeholderTypes[type] || 0) + 1;
    }

    if (Object.keys(placeholderTypes).length > 0) {
      this.log.json('Placeholder Types', placeholderTypes);
    }

    // List some placeholder paths
    if (placeholders.length > 0) {
      const paths = placeholders.map(p => p.path || p);
      this.log.list('Placeholder Paths', paths, 8);
    }

    this.log.subStepDone(`${placeholders.length} placeholders need LLM fill`);

    this.stats.stages.auditReport = {
      complete: true,
      placeholders: placeholders.length,
      sectionCount,
      findingsCount: auditReport?.findings?.length || 0
    };

    this.log.stageComplete({
      sections: sectionCount,
      placeholders: placeholders.length
    });
    return auditReport;
  }

  /**
   * Stage 6: LLM Polish on JSON narratives
   * Fills all narrative placeholders across all document types
   */
  async runLLMFill() {
    this.log.stage(6, 'LLM FILL — Generate narrative content via AI', '🤖');

    // Initialize batch executor
    this.log.subStep('Initializing LLM batch executor');
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasGroq = Boolean(process.env.GROQ_API_KEY);
    this.log.data('Gemini API', hasGemini ? 'Available' : 'Not configured');
    this.log.data('Groq API (fallback)', hasGroq ? 'Available' : 'Not configured');
    this.log.data('Primary Model', 'gemini-3-flash-preview');

    // Skip LLM Fill entirely if no API keys available (allows testing without LLM)
    if (!hasGemini && !hasGroq) {
      this.log.warn('No LLM API keys configured - skipping narrative generation');
      this.log.subStepDone('Stage skipped (placeholders retained)');
      this.stats.stages.llmFill = { skipped: true, reason: 'No API keys' };
      return;
    }

    const batchExecutor = new BatchLLMExecutor({
      apiKey: process.env.GEMINI_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
      verbose: false // We handle logging ourselves
    });
    this.log.subStepDone('Executor ready');

    let totalApiCalls = 0;
    let totalTokens = 0;

    // Fill audit report narratives
    if (this.schema.audit_report) {
      this.log.subStep('Filling AI Process Report narratives');
      const auditPlaceholders = getLLMPlaceholders(this.schema.audit_report);
      this.log.data('Placeholders to Fill', auditPlaceholders.length);

      if (auditPlaceholders.length > 0) {
        const startTime = Date.now();
        this.schema.audit_report = await batchExecutor.fillAllNarratives(this.schema.audit_report);
        const duration = Date.now() - startTime;

        const auditStats = batchExecutor.getStats();
        this.log.data('API Calls Made', auditStats.apiCalls);
        this.log.data('Tokens Used', auditStats.tokensUsed?.toLocaleString() || '0');
        this.log.data('Duration', `${(duration / 1000).toFixed(1)}s`);
        this.log.data('Avg per Call', auditStats.apiCalls > 0 ? `${(duration / auditStats.apiCalls / 1000).toFixed(2)}s` : 'N/A');
        totalApiCalls += auditStats.apiCalls || 0;
        totalTokens += auditStats.tokensUsed || 0;
        this.log.subStepDone(`Audit narratives: ${auditStats.apiCalls} calls, ${auditStats.tokensUsed?.toLocaleString() || 0} tokens`);

        // Copy unified executive summary to proposal and project_plan
        const auditExecSummary = this.schema.audit_report?.scorecard?.executive_summary?.body;
        if (auditExecSummary && !auditExecSummary.includes('[LLM_PLACEHOLDER')) {
          this.log.subStep('Copying unified executive summary to other documents');
          if (this.schema.proposal?.executive_summary) {
            this.schema.proposal.executive_summary.body = auditExecSummary;
            this.log.data('Copied to', 'Proposal');
          }

          if (this.schema.project_plan?.executive_summary) {
            this.schema.project_plan.executive_summary.body = auditExecSummary;
            this.log.data('Copied to', 'Project Plan');
          }

          this.log.subStepDone('Executive summary unified across all documents');
        }
      } else {
        this.log.subStepDone('No placeholders to fill');
      }
    }

    // Fill proposal narratives if needed (CTA, value_proposition - exec summary already copied)
    if (this.schema.proposal) {
      this.log.subStep('Filling Proposal narratives');
      const proposalPlaceholders = getPlaceholderPaths(this.schema.proposal);
      this.log.data('Placeholders to Fill', proposalPlaceholders.length);

      if (proposalPlaceholders.length > 0) {
        this.log.list('Proposal Placeholders', proposalPlaceholders, 5);
        const startTime = Date.now();

        // Reset stats before proposal fill
        batchExecutor.resetStats?.();
        this.schema.proposal = await batchExecutor.fillAllNarratives(this.schema.proposal);
        const duration = Date.now() - startTime;

        const proposalStats = batchExecutor.getStats();
        this.log.data('API Calls Made', proposalStats.apiCalls);
        this.log.data('Tokens Used', proposalStats.tokensUsed?.toLocaleString() || '0');
        this.log.data('Duration', `${(duration / 1000).toFixed(1)}s`);
        totalApiCalls += proposalStats.apiCalls || 0;
        totalTokens += proposalStats.tokensUsed || 0;
        this.log.subStepDone(`Proposal narratives: ${proposalStats.apiCalls} calls`);
      } else {
        this.log.subStepDone('No placeholders to fill');
      }
    }

    // Log final totals
    this.log.subStep('LLM fill summary');
    this.log.data('Total API Calls', totalApiCalls);
    this.log.data('Total Tokens', totalTokens.toLocaleString());
    const estimatedCost = (totalTokens / 1_000_000) * 0.075; // Rough Gemini Flash pricing
    this.log.data('Est. API Cost', `$${estimatedCost.toFixed(4)}`);
    this.log.subStepDone('All narratives filled');

    this.stats.stages.llmFill = {
      complete: true,
      apiCalls: totalApiCalls,
      tokensUsed: totalTokens,
      estimatedCost
    };

    this.log.stageComplete({
      calls: totalApiCalls,
      tokens: totalTokens.toLocaleString(),
      cost: `$${estimatedCost.toFixed(4)}`
    });
    return true;
  }

  /**
   * Stage 7: Render unified HTML document (7 client sheets + 1 internal)
   */
  async runRender(outputDir) {
    console.log('[PIPELINE] Stage 7: runRender invoked - UPDATED CODE');
    this.log.stage(7, 'RENDER — Generate 7 client + 1 internal sheets', '📝');

    // Convert markdown bold to HTML in all text fields
    this.log.subStep('Converting markdown to HTML');
    this.schema = convertMarkdownToHtml(this.schema);
    this.log.subStepDone('Markdown converted');

    // Setup output paths
    this.log.subStep('Configuring output paths');
    const clientSlug = this.schema.project_identity?.client_slug || 'unknown';
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19);
    this.log.data('Client Slug', clientSlug);
    this.log.data('Timestamp', timestamp);

    // Create output directory
    const docSlug = this.schema.project_identity?.document_slug || 'unknown';
    const fullOutputDir = path.join(outputDir, clientSlug, docSlug);
    this.log.data('Output Directory', fullOutputDir);
    ensureDir(fullOutputDir);
    this.log.subStepDone(`Directory ready: ${fullOutputDir}`);

    const outputs = {};

    // Pre-render unified header/footer HTML for each document type
    this.log.subStep('Generating unified header/footer components');
    const auditHeader = generateHeaderHTML(this.schema.project_identity, 'audit');
    const projectPlanHeader = generateHeaderHTML(this.schema.project_identity, 'project_plan');
    const proposalHeader = generateHeaderHTML(this.schema.project_identity, 'proposal');
    const unifiedFooter = generateFooterHTML(this.schema.project_identity);
    this.log.data('Header Variants', 3);
    this.log.data('Footer (shared)', 'Generated');
    this.log.subStepDone('Components ready');

    // Load unified template
    this.log.subStep('Loading unified template');
    const unifiedTemplatePath = path.join(__dirname, '..', 'templates', 'presales_report.html');
    const unifiedTemplate = fs.readFileSync(unifiedTemplatePath, 'utf8');
    this.log.data('Template', 'presales_report.html');
    this.log.data('Template Size', `${(unifiedTemplate.length / 1024).toFixed(1)} KB`);
    this.log.subStepDone('Template loaded');

    // Format project plan data for rendering
    const formattedProjectPlan = formatProjectPlanForRender(this.schema.project_plan);

    // Schema v2: Expand canonical identity to all legacy paths before render
    // This ensures templates using {{project_identity.X}} or {{proposal.project_identity.X}} still work
    expandLegacyPaths(this.schema);

    // Build combined data context for all 4 sheets
    this.log.subStep('Building unified data context');
    const templateData = {
      // AI Process Report (Sheet 1)
      ...this.schema.audit_report,
      scorecard: this.schema.audit_report?.scorecard,
      // CRITICAL: Fallback bleed from measurements if not in audit_report (MR-002 fix)
      bleed: this.schema.audit_report?.bleed || (() => {
        const bt = this.schema.measurements?.bleed_total;
        if (!bt) return undefined;
        return {
          total: {
            value: bt.monthly || bt.value || 0,
            display: bt.display || `$${(bt.monthly || bt.value || 0).toLocaleString()}`
          },
          period: 'monthly',
          period_display: 'Per Month'
        };
      })(),
      fixes: this.schema.audit_report?.fixes,
      cta: this.schema.audit_report?.cta,
      rendering: { is_conversion_mode: false },

      // Project Plan (Sheet 2) - spread formatted data at root
      ...formattedProjectPlan,
      estimate: formattedProjectPlan.estimate || this.schema.estimate,
      risk_analysis: this.schema.estimate?.risk_analysis || formattedProjectPlan.estimate?.risk_analysis,
      milestones: formattedProjectPlan.milestones || this.schema.project_plan?.milestones,
      technical: formattedProjectPlan.technical || this.schema.project_plan?.technical,
      scope: formattedProjectPlan.scope || this.schema.project_plan?.scope,
      payment: formattedProjectPlan.payment || this.schema.project_plan?.payment,

      // Technical Approach (Scope of Work page) - built from integration research
      // Build once and spread to root for template access
      ...(() => {
        const researchIntegrations = this.schema.research?.integrations || [];
        const systemIntel = this.schema.system_intelligence || null;
        const ta = buildTechnicalApproach(
          this.schema.intake,
          researchIntegrations,
          systemIntel
        );
        return {
          technical_approach: ta,
          // Spread specificity at root: {{specificity.has_generic}} not {{technical_approach.specificity.has_generic}}
          specificity: ta.specificity,
          // Spread integrations at root for template loops using {{#integrations}}
          integrations: ta.integrations,
          // Spread features at root for evaluation comparison
          features: ta.features
        };
      })(),

      // Proposal (Sheets 3 & 4) - spread at root for Mustache template access
      // This makes pricing, audit_reference, executive_summary, roi, terms, etc.
      // available at root level: {{pricing.total.display}} instead of {{proposal.pricing.total.display}}
      ...this.schema.proposal,
      // ALSO keep proposal as nested object for template references like {{proposal.executive_summary.body}}
      proposal: this.schema.proposal,

      // OVERRIDE pricing with CLIENT-FACING pricing (not internal costs from proposal.pricing)
      // Template uses {{pricing.total.display}} and {{pricing.payment_schedule.installments}}
      pricing: (() => {
        const rp = this.schema.pricing || {};
        const ms = rp.milestones || {};
        const fp = rp.final_price || 0;
        const st = rp.subtotal || fp;
        return {
          currency: rp.currency || 'USD',
          pricing_model: rp.pricing_model || 'fixed_price',
          total: { amount: fp, currency: 'USD', period: 'once', display: `$${fp.toLocaleString()}` },
          subtotal: { amount: st, currency: 'USD', period: 'once', display: `$${st.toLocaleString()}` },
          payment_schedule: {
            schedule_type: 'milestone_based',
            installments: Object.entries(ms).map(([k, m]) => ({
              label: m.milestone_name || k,
              amount: { amount: m.amount || 0, currency: 'USD', period: 'once', display: `$${(m.amount || 0).toLocaleString()}` },
              percent: m.percentage || 0
            }))
          },
          audit_credit: rp.audit_credit || null,
          early_adopter_discount: rp.early_adopter_discount || null,
          platform_fees: { platform: 'direct', fee_percentage: 0, fee_note: 'Direct engagement' }
        };
      })(),

      // Conditional flag for Mustache template: show subtotal/credits section if savings exist
      _has_savings: Boolean(this.schema.pricing?.audit_credit || this.schema.pricing?.early_adopter_discount),

      // Client-facing ROI (uses client price, not internal cost)
      // OVERRIDE the roi from ...this.schema.proposal which uses internal cost
      roi: this.schema.roi,

      // Pre-computed ROI display with formatting for large values
      roi_display: (() => {
        const roiPercent = this.schema.roi?.annual_roi_percent;
        // Graceful fallback when ROI is unavailable or zero
        if (!roiPercent || roiPercent === 0) {
          return 'significant';  // Neutral fallback for "significant return"
        }

        if (roiPercent >= 10_000) {
          // Very large ROI: show as "XXx return" instead of percentage
          return `${Math.round(roiPercent / 100).toLocaleString()}x`;
        }

        if (roiPercent >= 1000) {
          // Large ROI: format with commas
          return `${roiPercent.toLocaleString()}%`;
        }

        return `${roiPercent}%`;
      })(),

      // Unified identity and branding
      // Schema v2: canonical identity at root (new templates use {{identity.client_name}})
      identity: this.schema.identity,
      // Legacy path for backward compatibility (existing templates use {{project_identity.client_name}})
      project_identity: this.schema.project_identity,
      document: {
        title: 'Unified Presales Report',
        brand: {
          // Wranngle wordmark logo (hosted on ibb.co)
          logo_uri: "https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png"
        },
        report_year: new Date().getFullYear().toString()
      },

      // INTERNAL ARTIFACT: Raw input text opening for team review
      // Shows first 1000 chars of original source material
      raw_input: {
        opening: this.rawInputOpening || '',
        stats: this.rawInputStats || { lines: 0, words: 0, characters: 0 },
        has_content: Boolean(this.rawInputOpening && this.rawInputOpening.length > 0)
      },

      // INTAKE: Full intake data including classification for product detection
      intake: this.schema.intake,

      // PRODUCT PRICING: AI Voice Agent hybrid pricing (setup + monthly recurring)
      product_pricing: this.schema.product_pricing,

      // INTERNAL: Lead qualification + company profile for internal sheet
      lead_qualification: this.schema.lead_qualification,
      company_profile: this._buildCompanyProfileDisplay(),
      key_metrics: this.schema.key_metrics,

      // INTERNAL: System intelligence for systems inventory (disabled for debugging)
      systems_inventory: [],

      // Pre-rendered header/footer HTML (per-sheet)
      unified_header_html: auditHeader,
      unified_footer_html: unifiedFooter,
      audit_header_html: auditHeader,
      project_plan_header_html: projectPlanHeader,
      proposal_header_html: proposalHeader
    };

    const dataKeyCount = Object.keys(templateData).length;
    this.log.data('Data Keys', dataKeyCount);
    this.log.subStepDone('Data context ready');

    // Schema v2: Build _fmt.* formatted values at render time
    this.log.subStep('Building _fmt.* render-time formatters');
    const fmtContext = buildTemplateContext(this.schema);
    templateData._fmt = fmtContext._fmt;
    this.log.data('_fmt Fields', Object.keys(templateData._fmt || {}).length);
    this.log.subStepDone('Formatters ready');

    // Render unified template
    this.log.subStep('Rendering unified document');
    const unifiedHtml = Mustache.render(unifiedTemplate, templateData);
    const unifiedSize = Buffer.byteLength(unifiedHtml, 'utf8');
    this.log.data('Rendered Size', `${(unifiedSize / 1024).toFixed(1)} KB`);

    // Write unified HTML (client-facing - 7 pages, no internal sheet)
    const unifiedPath = path.join(fullOutputDir, `unified_report_${clientSlug}_${timestamp}.html`);
    fs.writeFileSync(unifiedPath, unifiedHtml);
    this.log.file('WRITE', unifiedPath, unifiedSize);
    outputs.unified = { html: unifiedPath };
    if (this.executionId) await this.history.addArtifact(this.executionId, 'html', unifiedPath);
    this.log.subStepDone(`Client Report: ${(unifiedSize / 1024).toFixed(1)} KB (7 sheets)`);

    // Load and validate sales strategy config for internal sheet
    const salesStrategyPath = path.join(__dirname, '..', 'config', 'sales_strategy.json');
    let salesStrategy = null;
    if (fs.existsSync(salesStrategyPath)) {
      try {
        const rawData = JSON.parse(fs.readFileSync(salesStrategyPath, 'utf8'));
        // Import validateSalesStrategy dynamically to avoid circular deps
        const { validateSalesStrategy } = await import('./schemas/sales-strategy.schema.js');
        salesStrategy = validateSalesStrategy(rawData);
        if (salesStrategy) {
          this.log.data('Sales Strategy', `${salesStrategy.industry_label} (v${salesStrategy.version})`);
          this.log.data('  Packages', salesStrategy.pricing_strategy?.packages?.length || 0);
          this.log.data('  Objections', salesStrategy.objections?.length || 0);
          this.log.data('  Scripts', salesStrategy.scripts?.cold_call?.segments?.length || 0);
        } else {
          this.log.data('Sales Strategy', 'Validation failed - internal sheet sections 05-10 will be empty');
        }
      } catch (error) {
        this.log.data('Sales Strategy', `Failed to load: ${error.message}`);
      }
    } else {
      this.log.data('Sales Strategy', 'config/sales_strategy.json not found');
    }

    // Render internal sheet (SEPARATE FILE - never sent to clients)
    this.log.subStep('Rendering internal cost/negotiation sheet');
    const internalTemplatePath = path.join(__dirname, '..', 'templates', 'internal_sheet.html');
    if (fs.existsSync(internalTemplatePath)) {
      const internalTemplate = fs.readFileSync(internalTemplatePath, 'utf8');
      
      // Inject sales strategy config into templateData for internal sheet
      if (salesStrategy) {
        // Transform compliance styles from string to boolean flags for Mustache
        if (salesStrategy.compliance && Array.isArray(salesStrategy.compliance)) {
          salesStrategy.compliance = salesStrategy.compliance.map(item => ({
            ...item,
            style_healthy: item.style === 'healthy',
            style_warning: item.style === 'warning'
          }));
        }

        // --- Sales Compensation Analysis & Discount Logic ---
        if (salesStrategy.pricing_strategy && salesStrategy.pricing_strategy.packages) {
          const {packages} = salesStrategy.pricing_strategy;
          const prices = packages.map(p => p.price).filter(p => typeof p === 'number');
          if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
              
            // Compensation Constants
            const commRate = 0.3;
            const churnRate = 0.15;
              
            salesStrategy.compensation_analysis = {
              monthly: {
                low: Math.round(minPrice * commRate),
                high: Math.round(maxPrice * commRate),
                display: `$${Math.round(minPrice * commRate)} – $${Math.round(maxPrice * commRate)}`
              },
              annual: {
                low: Math.round(minPrice * 12 * commRate),
                high: Math.round(maxPrice * 12 * commRate),
                display: `$${Math.round(minPrice * 12 * commRate).toLocaleString()} – $${Math.round(maxPrice * 12 * commRate).toLocaleString()}`
              },
              ltv: { // LTV = (Price / Churn) * CommRate
                low: Math.round((minPrice / churnRate) * commRate),
                high: Math.round((maxPrice / churnRate) * commRate),
                display: `$${Math.round((minPrice / churnRate) * commRate).toLocaleString()} – $${Math.round((maxPrice / churnRate) * commRate).toLocaleString()}`
              },
              details: {
                commission_rate: "30%",
                churn_assumption: "15%",
                formula: "LTV = (MonthlyPrice ÷ Churn%) × Commission%"
              }
            };

            // Discount Logic
            const targetPkg = packages.find(p => p.is_target) || packages[0];
            const targetPrice = targetPkg ? targetPkg.price : minPrice;
            const discountPercent = 15;
            const discountedPrice = Math.round(targetPrice * (1 - (discountPercent / 100)));
              
            salesStrategy.pricing_strategy.discount_offer = {
              percent: discountPercent,
              original_price: targetPrice,
              discounted_price: discountedPrice,
              annual_savings: (targetPrice - discountedPrice) * 12,
              display: `Annual Agreement: $${discountedPrice}/mo (billed monthly)`
            };
          }
        }
        // ----------------------------------------------------

        templateData.sales_strategy = salesStrategy;
      }
      
      const internalHtml = Mustache.render(internalTemplate, templateData);
      const internalSize = Buffer.byteLength(internalHtml, 'utf8');
      const internalPath = path.join(fullOutputDir, `INTERNAL_${clientSlug}_${timestamp}.html`);
      fs.writeFileSync(internalPath, internalHtml);
      this.log.file('WRITE', internalPath, internalSize);
      outputs.internal = { html: internalPath };
      if (this.executionId) await this.history.addArtifact(this.executionId, 'html_internal', internalPath);
      this.log.subStepDone(`Internal Sheet: ${(internalSize / 1024).toFixed(1)} KB (CONFIDENTIAL)`);
    } else {
      this.log.subStepDone('Internal template not found - skipping');
    }

    // Save unified schema JSON
    this.log.subStep('Saving unified schema JSON');

    // FINAL SYNC: Ensure project_plan.finops matches estimate.finops display fields
    // This is a failsafe to prevent display field desync (documented in CLAUDE.md)
    if (this.schema.project_plan && this.schema.estimate?.finops?.value_breakdown) {
      const estVB = this.schema.estimate.finops.value_breakdown;
      if (this.schema.project_plan.finops?.value_breakdown) {
        const ppVB = this.schema.project_plan.finops.value_breakdown;
        // Copy the correct display values from estimate to project_plan
        ppVB.total_annual_value = estVB.total_annual_value;
        ppVB.total_annual_display = estVB.total_annual_display;
        ppVB.total_monthly_value = estVB.total_monthly_value;
        ppVB.total_monthly_display = estVB.total_monthly_display;
        if (estVB.hard_savings) ppVB.hard_savings = estVB.hard_savings;
        if (estVB.modeled_opportunity) ppVB.modeled_opportunity = estVB.modeled_opportunity;
      }
    }

    // CRITICAL: Ensure all required top-level sections are present (CC-052 fix)
    // Required sections: intake, measurements, identity, research, estimate
    const requiredSections = {
      intake: this.schema.intake || { section_a_process_identification: {}, intake_version: '1.0' },
      measurements: this.schema.measurements || { metrics: { byId: {}, order: [], count: 0 }, measurements: [] },
      identity: this.schema.identity || { client_name: 'Unknown', document_slug: 'WRN-AI-unknown' },
      research: this.schema.research || { integrations: [], tier_assessment: {} },
      estimate: this.schema.estimate || { effort: {}, pricing: {}, finops: {} }
    };

    // Final JSON persistence - ensure all metadata is included
    const finalSchema = {
      ...this.schema,
      // Spread required sections to ensure they exist
      ...requiredSections,
      // Business profile enrichment metadata
      ...(this.businessProfile ? { business_profile: this.businessProfile } : {}),
      raw_input: {
        opening: this.rawInputOpening || '',
        stats: this.rawInputStats || { lines: 0, words: 0, characters: 0 }
      },
      provenance: {
        ...this.provenance,
        input_hash: this.inputHash,
        generated_at: new Date().toISOString(),
        stages: { ...this.provenance.stages, render: { complete: true } }
      }
    };

    const jsonPath = path.join(fullOutputDir, `unified_schema_${clientSlug}_${timestamp}.json`);
    const jsonContent = JSON.stringify(finalSchema, null, 2);
    fs.writeFileSync(jsonPath, jsonContent);
    const jsonSize = Buffer.byteLength(jsonContent, 'utf8');
    this.log.file('WRITE', jsonPath, jsonSize);
    this.log.data('Schema Keys', Object.keys(finalSchema).length);
    outputs.json = jsonPath;
    if (this.executionId) await this.history.addArtifact(this.executionId, 'json', jsonPath);
    this.log.subStepDone(`Schema: ${(jsonSize / 1024).toFixed(1)} KB`);

    // Calculate total size including internal sheet if rendered
    const internalSize = outputs.internal?.html ? fs.statSync(outputs.internal.html).size : 0;
    const totalSize = unifiedSize + jsonSize + internalSize;
    this.stats.stages.render = {
      complete: true,
      outputs,
      totalBytes: totalSize
    };

    this.log.stageComplete({
      documents: outputs.internal ? 2 : 1,
      sheets: outputs.internal ? '7 client + 1 internal' : 7,
      total: `${(totalSize / 1024).toFixed(1)} KB`
    });
    return outputs;
  }

  /**
   * Stage 8: Polish all HTML documents
   */
  async runPolish(outputs) {
    this.log.stage(8, 'POLISH — LLM refinement pass on HTML', '✨');

    const polishResults = {};
    let totalChanges = 0;

    this.log.subStep('Preparing polish configuration');
    this.log.data('Client Name', this.schema.project_identity?.client_name || 'Unknown');
    this.log.data('Documents to Polish', Object.keys(outputs).filter(k => outputs[k]?.html).length);
    this.log.subStepDone('Config ready');

    for (const [docType, output] of Object.entries(outputs)) {
      if (output.html) {
        this.log.subStep(`Polishing ${docType}`);
        const filePath = output.html;
        const originalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        this.log.data('Input File', path.basename(filePath));
        this.log.data('Original Size', `${(originalSize / 1024).toFixed(1)} KB`);

        const startTime = Date.now();
        const result = await polishHTML(filePath, {
          client_name: this.schema.project_identity?.client_name,
          document_type: docType
        });
        const duration = Date.now() - startTime;

        // Extract changes array with proper fallback
        const changes = result?.changes || [];
        const method = result?.method || 'unknown';
        const newSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        const sizeDiff = newSize - originalSize;

        this.log.data('Method', method);
        this.log.data('Changes Made', changes.length);
        if (changes.length > 0 && changes[0]?.type) {
          this.log.data('Change Type', changes[0].type);
        }

        this.log.data('Duration', `${(duration / 1000).toFixed(2)}s`);
        this.log.data('New Size', `${(newSize / 1024).toFixed(1)} KB`);
        this.log.data('Size Delta', `${sizeDiff >= 0 ? '+' : ''}${sizeDiff} bytes`);

        // Log specific changes if any
        if (changes.length > 0) {
          const changeDescriptions = changes.slice(0, 5).map(c => c.description || c.type || 'modification');
          this.log.list('Changes Applied', changeDescriptions);
        }

        polishResults[docType] = {
          changes: changes.length,
          duration,
          sizeDelta: sizeDiff
        };
        totalChanges += changes.length;
        this.log.subStepDone(`${docType}: ${changes.length} changes in ${(duration / 1000).toFixed(2)}s`);
      }
    }

    this.log.subStep('Polish summary');
    this.log.data('Total Changes', totalChanges);
    this.log.data('Documents Polished', Object.keys(polishResults).length);
    this.log.subStepDone('All documents polished');

    this.stats.stages.polish = {
      complete: true,
      results: polishResults,
      totalChanges
    };

    this.log.stageComplete({
      documents: Object.keys(polishResults).length,
      changes: totalChanges
    });
    return polishResults;
  }

  /**
   * Stage 9: Generate all PDFs
   */
  async runPDF(outputs) {
    this.log.stage(9, 'PDF — Generate print-ready documents', '📄');

    const pdfResults = {};
    let successCount = 0;
    let failCount = 0;
    let totalPdfBytes = 0;

    this.log.subStep('Initializing Puppeteer for PDF generation');
    this.log.data('Documents to Convert', Object.keys(outputs).filter(k => outputs[k]?.html).length);
    this.log.data('PDF Engine', 'Puppeteer (Chromium)');
    this.log.subStepDone('Puppeteer ready');

    for (const [docType, output] of Object.entries(outputs)) {
      if (output.html) {
        this.log.subStep(`Generating PDF: ${docType}`);
        const htmlPath = output.html;
        const htmlSize = fs.existsSync(htmlPath) ? fs.statSync(htmlPath).size : 0;
        this.log.data('Source HTML', path.basename(htmlPath));
        this.log.data('HTML Size', `${(htmlSize / 1024).toFixed(1)} KB`);

        try {
          const pdfPath = htmlPath.replace(/\.html$/, '.pdf');
          this.log.data('Target PDF', path.basename(pdfPath));

          const startTime = Date.now();

          const pdfResult = await generatePDF(htmlPath, pdfPath);

          const duration = Date.now() - startTime;

          const pdfSize = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0;
          totalPdfBytes += pdfSize;

          this.log.data('PDF Size', `${(pdfSize / 1024).toFixed(1)} KB`);
          this.log.data('Compression', `${((1 - pdfSize / htmlSize) * 100).toFixed(0)}% smaller`);
          this.log.data('Duration', `${(duration / 1000).toFixed(2)}s`);
          this.log.data('Sheets Found', pdfResult?.sheetsFound ?? 'N/A');
          this.log.data('Internal Mode', pdfResult?.isInternalSheet ? 'Yes' : 'No');

          output.pdf = pdfPath;
          pdfResults[docType] = {
            success: true,
            path: pdfPath,
            size: pdfSize,
            duration
          };
          successCount++;
          this.log.file('WRITE', pdfPath, pdfSize);
          // Only add client-facing PDFs as artifacts (internal PDFs labeled separately)
          if (this.executionId) {
            const artifactType = docType === 'internal' ? 'pdf_internal' : 'pdf';
            await this.history.addArtifact(this.executionId, artifactType, pdfPath);
          }

          this.log.subStepDone(`${docType}: ${(pdfSize / 1024).toFixed(1)} KB in ${(duration / 1000).toFixed(2)}s`);
        } catch (error) {
          failCount++;
          pdfResults[docType] = { success: false, error: error.message };
          this.log.error(`PDF generation failed for ${docType}`, error);
          this.log.subStepDone(`${docType}: FAILED`);
        }
      }
    }

    this.log.subStep('PDF generation summary');
    this.log.data('Successful', successCount);
    this.log.data('Failed', failCount);
    this.log.data('Total PDF Size', `${(totalPdfBytes / 1024).toFixed(1)} KB`);
    this.log.subStepDone(`${successCount}/${successCount + failCount} PDFs generated`);

    this.stats.stages.pdf = {
      complete: true,
      results: pdfResults,
      successCount,
      failCount,
      totalBytes: totalPdfBytes
    };

    this.log.stageComplete({
      success: successCount,
      failed: failCount,
      size: `${(totalPdfBytes / 1024).toFixed(1)} KB`
    });
    return pdfResults;
  }

  _buildCompanyProfileDisplay() {
    const cp = this.schema.company_profile || {};
    const sizeSegment = cp.employee_count ? getCompanySizeSegment(cp.employee_count) : null;
    const segmentLabels = { smb: 'SMB', mid_market: 'Mid-Market', enterprise: 'Enterprise', large_enterprise: 'Large Enterprise' };
    return {
      ...cp,
      employee_count_display: cp.employee_count ? cp.employee_count.toLocaleString() : null,
      size_segment: sizeSegment,
      size_segment_label: sizeSegment ? segmentLabels[sizeSegment] : null,
      tech_stack: (cp.tech_stack || []).map(t => ({ name: t })),
      tech_stack_count: cp.tech_stack?.length || 0,
      _has_company_profile: Boolean(cp.company_name || cp.industry || cp.employee_count),
      _has_url: Boolean(cp.company_url),
      _has_industry: Boolean(cp.industry),
      _has_revenue: Boolean(cp.revenue_estimate),
      _has_tech_stack: Boolean(cp.tech_stack?.length),
      _has_funding: Boolean(cp.funding_stage),
      _has_enrichment: Boolean(cp.enrichment_source && cp.enrichment_source !== 'manual'),
      enrichment_label: cp.enrichment_source === 'clay_n8n' ? 'Enriched via Clay' : cp.enrichment_source === 'pdl' ? 'Enriched via PDL' : null,
    };
  }

  /**
   * Run the full pipeline
   * @param {string} inputPath - Path to input file (unstructured text)
   * @param {string} outputDir - Output directory
   * @returns {Object} Pipeline results
   */
  async run(inputPath, outputDir) {
    this.stats.startTime = Date.now();

    // Initialize all config-dependent modules (consolidated)
    await initializePipelineModules();

    // Show banner
    this.log.banner('WRANNGLE UNIFIED PRESALES PIPELINE');

    // Log run configuration
    this.log.info(`Input: ${inputPath}`);
    this.log.info(`Output: ${outputDir}`);
    this.log.info(`Node: ${process.version}`);
    this.log.info(`Platform: ${process.platform}`);
    this.log.info(`Auto-Retry: ${COLORS.green}ENABLED${COLORS.reset} (exponential backoff + jitter)`);
    this.log.divider();

    // Retry configuration per stage (LLM-heavy stages get more attempts)
    const STAGE_RETRY_CONFIG = {
      extract:    { maxAttempts: 3, baseDelayMs: 5000 },   // LLM call
      research:   { maxAttempts: 2, baseDelayMs: 3000 },   // n8n library lookup
      projectPlan:{ maxAttempts: 2, baseDelayMs: 3000 },   // Transform only
      proposal:   { maxAttempts: 2, baseDelayMs: 3000 },   // Transform only
      audit:      { maxAttempts: 2, baseDelayMs: 3000 },   // Transform only
      llmFill:    { maxAttempts: 4, baseDelayMs: 8000 },   // Heavy LLM (most failures here)
      render:     { maxAttempts: 2, baseDelayMs: 2000 },   // Template render
      polish:     { maxAttempts: 4, baseDelayMs: 10_000 },  // LLM polish passes
      pdf:        { maxAttempts: 3, baseDelayMs: 5000 }    // Puppeteer (fonts, network)
    };

    try {
      // Stage 1: Extract - detect structured vs unstructured input
      const inputContent = fs.readFileSync(inputPath, 'utf8');
      const isStructured = this.isStructuredInput(inputContent, inputPath);

      if (isStructured) {
        this.log.info(`${COLORS.cyan}Structured JSON input detected${COLORS.reset}`);
        // Structured path: No LLM, direct transform
        await withRetry('Extract (Structured)', () => this.runStructuredExtract(inputPath), this.log, { maxAttempts: 1, baseDelayMs: 1000 });
      } else {
        // Unstructured path: LLM extraction
        await withRetry('Extract', () => this.runExtract(inputPath), this.log, STAGE_RETRY_CONFIG.extract);
      }

      // Enrich business profile from company_url (before Research)
      if (this.businessProfile?.company_url) {
        try {
          const { enrichBusinessProfile } = await import('./enrichment.js');
          this.log.subStep('Enriching business profile from company URL');
          this.businessProfile = await enrichBusinessProfile(this.businessProfile);
          if (this.businessProfile.enrichment_source && this.businessProfile.enrichment_source !== 'manual') {
            this.log.data('Enrichment Source', this.businessProfile.enrichment_source);
            this.log.data('Industry', this.businessProfile.industry || 'unknown');
            this.log.data('Employees', this.businessProfile.employee_count || 'unknown');
          }

          this.log.subStepDone('Business profile enriched');
        } catch (error) {
          this.log.warn(`Business profile enrichment failed: ${error.message}`);
        }
      }

      // Enrich person profile from contact signals (before Research)
      const intake = this.schema;
      if (intake?.prepared_for?.contact_email || intake?.prepared_for?.contact_name) {
        try {
          const { enrichPersonProfile } = await import('./enrichment.js');
          this.log.subStep('Enriching contact profile');
          const personInput = {
            contact_email: intake.prepared_for.contact_email,
            contact_name: intake.prepared_for.contact_name,
            contact_title: intake.prepared_for.contact_title,
            contact_phone: intake.prepared_for.contact_phone,
            company_name: intake.prepared_for.account_name,
          };
          const enrichedPerson = await enrichPersonProfile(personInput);
          if (enrichedPerson.enrichment_source && enrichedPerson.enrichment_source !== 'manual') {
            intake.prepared_for.contact_email ??= enrichedPerson.contact_email;
            intake.prepared_for.contact_name ??= enrichedPerson.contact_name;
            intake.prepared_for.contact_title ??= enrichedPerson.contact_title;
            intake.prepared_for.contact_phone ??= enrichedPerson.contact_phone;
            this.log.data('Person Enrichment', enrichedPerson.enrichment_source);
            this.log.data('Contact Title', enrichedPerson.contact_title || 'unknown');
            this.log.data('Seniority', enrichedPerson.seniority || 'unknown');
          }

          this.log.subStepDone('Contact profile enriched');
        } catch (error) {
          this.log.warn(`Person enrichment failed: ${error.message}`);
        }
      }

      // Stage 2: Research
      await withRetry('Research', () => this.runResearch(), this.log, STAGE_RETRY_CONFIG.research);

      // Case study suggestions (after research, uses industry from business profile)
      if (this.businessProfile?.industry) {
        try {
          const { listCaseStudies } = await import('./evaluation/corpus.js');
          const industryTag = this.businessProfile.industry.toLowerCase().replaceAll(/[\s_]+/g, '-');
          const matches = await listCaseStudies({ tags: [industryTag], limit: 3 });
          this.schema.suggested_case_studies = matches.map(cs => ({
            industry: cs.problem?.industry || industryTag,
            company_size: cs.problem?.company_size || null,
            pain_points: (cs.problem?.pain_points || []).slice(0, 3),
          }));
          this.schema._has_case_studies = this.schema.suggested_case_studies.length > 0;
        } catch {
          this.schema.suggested_case_studies = [];
          this.schema._has_case_studies = false;
        }
      }

      // Stage 3: Project Plan
      await withRetry('Project Plan', () => this.runProjectPlan(), this.log, STAGE_RETRY_CONFIG.projectPlan);
      // Stage 4: Proposal
      await withRetry('Proposal', () => this.runProposal(), this.log, STAGE_RETRY_CONFIG.proposal);
      // Stage 5: AI Process Report
      await withRetry('AI Process Report', () => this.runAuditReport(), this.log, STAGE_RETRY_CONFIG.audit);
      // Stage 6: LLM Fill
      await withRetry('LLM Fill', () => this.runLLMFill(), this.log, STAGE_RETRY_CONFIG.llmFill);
      // Stage 7: Render
      const outputs = await withRetry('Render', () => this.runRender(outputDir), this.log, STAGE_RETRY_CONFIG.render);
      // Stage 8: Polish
      await withRetry('Polish', () => this.runPolish(outputs), this.log, STAGE_RETRY_CONFIG.polish);
      // Stage 9: PDF
      await withRetry('PDF', () => this.runPDF(outputs), this.log, STAGE_RETRY_CONFIG.pdf);

      this.stats.endTime = Date.now();
      this.stats.duration = this.stats.endTime - this.stats.startTime;

      // Final report
      this.log.finalReport(this.stats, outputs);

      if (this.executionId) {
        const clientSlug = this.schema.project_identity?.client_slug || 'unknown';
        const docSlug = this.schema.project_identity?.document_slug || 'unknown';
        const finalOutputDir = path.join(outputDir, clientSlug, docSlug);
        
        // Save log file
        if (fs.existsSync(finalOutputDir)) {
          const logPath = path.join(finalOutputDir, 'pipeline.log');
          fs.writeFileSync(logPath, this.log.getBuffer());
        }

        // Calculate final score proactively
        let finalAuditScore = 0;
        const scorecard = this.schema.audit_report?.scorecard;
        if (scorecard) {
          const counts = scorecard.overall?.status_distribution || { critical: 0, warning: 0, healthy: 0 };
          const total = (counts.critical || 0) + (counts.warning || 0) + (counts.healthy || 0);
          if (total > 0) {
            const weightedSum = (counts.healthy * 100) + (counts.warning * 50);
            finalAuditScore = Math.round(weightedSum / total);
          } else {
            finalAuditScore = 75; // Default fallback
          }

          // Update the schema object too so JSON artifact is correct
          scorecard.overall_score = finalAuditScore;
        }

        const summaryData = {
          totalPrice: this.stats.stages.proposal?.totalPrice || 0,
          totalHours: this.stats.stages.projectPlan?.estimatedHours || 0,
          riskScore: this.schema.estimate?.risk_analysis?.risk_score || 5,
          monthlyBleed: this.stats.stages.proposal?.monthlyBleed || 0,
          auditScore: finalAuditScore
        };

        // CRITICAL: Force DB update
        await this.history.updateExecutionStatus(this.executionId, 'completed', finalOutputDir, summaryData);
        this.log.success(`Database updated with results: Score ${finalAuditScore}%`);
      }

      return {
        success: true,
        stats: this.stats,
        outputs,
        schema: this.schema
      };

    } catch (error) {
      this.stats.endTime = Date.now();
      this.stats.error = error.message;
      this.stats.duration = this.stats.endTime - this.stats.startTime;

      this.log.error('Pipeline failed', error);

      if (this.executionId) {
        // Attempt to save partial logs even on failure
        try {
          const clientSlug = this.schema.project_identity?.client_slug || 'unknown';
          const docSlug = this.schema.project_identity?.document_slug || 'unknown';
          const finalOutputDir = path.join(outputDir, clientSlug, docSlug);
          if (fs.existsSync(finalOutputDir)) {
            fs.writeFileSync(path.join(finalOutputDir, 'pipeline.log'), this.log.getBuffer());
          }

          await this.history.updateExecutionStatus(this.executionId, 'failed', finalOutputDir);
        } catch {
          await this.history.updateExecutionStatus(this.executionId, 'failed', null);
        }
      }

      return {
        success: false,
        stats: this.stats,
        error
      };
    }
  }
}

export default UnifiedPipeline;
