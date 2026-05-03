/**
 * Wranngle Unified Presales Components
 *
 * Generates identical HTML components for all presales documents.
 * Ensures consistent header, footer, and styling across all deliverables.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ensureLoaded, getLegacySharedComponents } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Shared components loaded from SQLite (async init)
let _componentCache = null;
let _isInitialized = false;

/**
 * Initialize shared components from SQLite
 */
export async function initSharedComponents() {
  if (_isInitialized) return;
  await ensureLoaded();
  _componentCache = await getLegacySharedComponents();
  _isInitialized = true;
}

/**
 * Get the shared CSS as a string for embedding in templates
 * @returns {string} CSS content
 */
export function getSharedCSS() {
  return readFileSync(join(__dirname, '..', 'shared_styles.css'), 'utf-8');
}

/**
 * Get document type labels (must call initSharedComponents first)
 */
function getDocTypeLabels() {
  if (!_isInitialized) {
    // Fallback for sync calls before init
    return {
      audit: 'Phase 1: AI Process Audit',
      project_plan: 'Phase 2: Project Plan',
      proposal: 'Phase 2: Stabilize Proposal'
    };
  }

  return _componentCache.DOC_TYPE_LABELS;
}

// Legacy export for backwards compatibility
const DOC_TYPE_LABELS = {
  audit: 'Phase 1: AI Process Audit',
  project_plan: 'Phase 2: Project Plan',
  proposal: 'Phase 2: Stabilize Proposal'
};

/**
 * Generate unified header HTML
 *
 * Layout:
 * LEFT:  Client Name → Process Name → Friendly Name
 * RIGHT: Logo → Doc Title → Slug → Date/Validity
 *
 * @param {Object} identity - Project identity object from generateProjectIdentity()
 * @param {string} documentType - Document type (audit, project_plan, proposal)
 * @param {Object} options - Additional options
 * @param {string} options.logoUrl - Logo URL (default: Wranngle hosted logo)
 * @returns {string} HTML string
 */
export function generateHeaderHTML(identity, documentType, options = {}) {
  const logoUrl = options.logoUrl || 'https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png';
  const docTitle = getDocTypeLabels()[documentType] || 'Document';

  // Build validity text
  let metaText = escapeHtml(identity.process_date_display || '');
  if (identity.valid_until_display) {
    metaText += ` · Valid until ${escapeHtml(identity.valid_until_display)}`;
  }

  // Uses wrn-header-* class names for unified styling
  return `
    <header class="wrn-header">
      <div class="wrn-header-left">
        <div class="wrn-header-client">${escapeHtml(identity.client_name || '')}</div>
        <div class="wrn-header-process">${escapeHtml(identity.process_name || '')}</div>
        <div class="wrn-header-friendly">${escapeHtml(identity.friendly_name || '')}</div>
      </div>
      <div class="wrn-header-right">
        <img src="${logoUrl}" alt="Wranngle Systems LLC" class="wrn-header-logo">
        <div class="wrn-header-doc-title">${docTitle}</div>
        <div class="wrn-header-slug">${escapeHtml(identity.document_slug || '')}</div>
        <div class="wrn-header-meta">${metaText}</div>
      </div>
    </header>
    <div class="wrn-header-separator"></div>
  `;
}

/**
 * Generate unified footer HTML
 *
 * Layout:
 * LEFT:  Project Slug (monospace pill)
 * RIGHT: "Wranngle Systems LLC © YEAR · All Rights Reserved"
 *
 * @param {Object} identity - Project identity object
 * @returns {string} HTML string
 */
export function generateFooterHTML(identity) {
  const year = identity.year || new Date().getFullYear();
  const slug = identity.document_slug || 'WRN-AI';

  // Uses wrn-footer-* class names for unified styling
  return `
    <footer class="wrn-footer">
      <div class="wrn-footer-slug">${escapeHtml(slug)}</div>
      <div class="wrn-footer-copy">Wranngle Systems LLC © ${year} · All Rights Reserved</div>
    </footer>
  `;
}

/**
 * Generate a math/data pill HTML
 *
 * @param {string} content - Pill content (formula, source, etc.)
 * @param {string} variant - Variant: 'default', 'warning', 'success', 'critical'
 * @returns {string} HTML string
 */
export function generatePillHTML(content, variant = 'default') {
  const variantClass = variant === 'default' ? '' : ` wrn-pill--${variant}`;
  return `<span class="wrn-pill${variantClass}">${escapeHtml(content)}</span>`;
}

/**
 * Generate executive summary HTML
 *
 * @param {string} summary - Main summary text
 * @param {string} valueProp - Value proposition subtext
 * @returns {string} HTML string
 */
export function generateExecSummaryHTML(summary, valueProp) {
  return `
    <div class="wrn-exec-summary">
      <p>${summary}</p>
      ${valueProp ? `<p class="value-prop">${valueProp}</p>` : ''}
    </div>
  `;
}

/**
 * Generate a gradient tile/card HTML
 *
 * @param {Object} options - Tile options
 * @param {string} options.variant - Variant: 'default', 'accent', 'critical', 'warning', 'healthy'
 * @param {string} options.content - Inner HTML content
 * @returns {string} HTML string
 */
export function generateTileHTML(options) {
  const variant = options.variant || 'default';
  const variantClass = variant === 'default' ? '' : ` wrn-tile--${variant}`;
  return `<div class="wrn-tile${variantClass}">${options.content}</div>`;
}

/**
 * Generate stat tile HTML
 *
 * @param {string} value - Display value (e.g., "$49,500")
 * @param {string} label - Label text
 * @param {string} formula - Optional formula to show as pill
 * @returns {string} HTML string
 */
export function generateStatTileHTML(value, label, formula = null) {
  return `
    <div class="wrn-stat-tile">
      <div class="value">${value}</div>
      <div class="label">${escapeHtml(label)}</div>
      ${formula ? `<div style="margin-top: 0.25rem;">${generatePillHTML(formula)}</div>` : ''}
    </div>
  `;
}

/**
 * Generate CTA button HTML
 *
 * @param {string} text - Button text
 * @param {string} href - Link URL
 * @returns {string} HTML string
 */
export function generateCTAHTML(text, href) {
  return `<a href="${escapeHtml(href)}" class="wrn-cta">${escapeHtml(text)}</a>`;
}

/**
 * Format currency with thousands commas
 * @param {number} amount - Amount to format
 * @param {string} suffix - Optional suffix (e.g., '/mo', '/yr')
 * @returns {string} Formatted currency
 */
export function formatCurrency(amount, suffix = '') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '$0' + suffix;
  }

  return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 0 }) + suffix;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

/**
 * Generate Mustache-compatible template variables for unified header
 *
 * These can be used in Mustache templates with:
 * {{#unified_header}}...{{/unified_header}}
 *
 * @param {Object} identity - Project identity object
 * @param {string} documentType - Document type
 * @returns {Object} Template variables
 */
export function getHeaderTemplateVars(identity, documentType) {
  return {
    client_name: identity.client_name,
    process_name: identity.process_name,
    friendly_name: identity.friendly_name,
    document_slug: identity.document_slug,
    doc_title: getDocTypeLabels()[documentType] || 'Document',
    date_display: identity.process_date_display,
    valid_until_display: identity.valid_until_display,
    logo_url: 'https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png'
  };
}

/**
 * Generate Mustache-compatible template variables for unified footer
 *
 * @param {Object} identity - Project identity object
 * @returns {Object} Template variables
 */
export function getFooterTemplateVars(identity) {
  return {
    document_slug: identity.document_slug,
    year: identity.year || new Date().getFullYear(),
    copyright_text: `Wranngle Systems LLC © ${identity.year || new Date().getFullYear()} · All Rights Reserved`
  };
}

export default {
  getSharedCSS,
  generateHeaderHTML,
  generateFooterHTML,
  generatePillHTML,
  generateExecSummaryHTML,
  generateTileHTML,
  generateStatTileHTML,
  generateCTAHTML,
  formatCurrency,
  getHeaderTemplateVars,
  getFooterTemplateVars
};
