// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Unified Project Identity Generator
 *
 * Generates consistent slugs, document IDs, and project_identity objects
 * across all Wranngle presales documents (Audit, Project Plan, Proposal).
 *
 * Slug Format: WRN-AI-{ClientSlug}-{ProjectSlug}-{YY}r{revision}
 * Example: WRN-AI-riverside-billing-25r1
 */

/**
 * Slugify text for use in identifiers and filenames
 * @param {string} text - Text to slugify
 * @param {number} maxLength - Maximum length (default: 20)
 * @returns {string} Slugified text (lowercase, hyphens, no special chars)
 */
export function slugify(text, maxLength = 20) {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }

  return text
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')    // Non-alphanumeric to hyphens
    .replaceAll(/^-+|-+$/g, '')        // Remove leading/trailing hyphens
    .replaceAll(/-+/g, '-')            // Collapse multiple hyphens
    .slice(0, maxLength);
}

/**
 * Slugify for filenames (uses underscores)
 * @param {string} text - Text to slugify
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} Slugified text with underscores
 */
export function slugifyFilename(text, maxLength = 50) {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }

  return text
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .replaceAll(/_+/g, '_')
    .slice(0, maxLength);
}

/**
 * Generate document slug in format: WRN-AI-{ClientSlug}-{ProjectSlug}-{YY}r{revision}
 * @param {string} clientName - Client/company name
 * @param {string} projectName - Project/workflow name
 * @param {Object} options - Options
 * @param {number} options.year - Year (default: current year)
 * @param {number} options.revision - Revision number (default: 1)
 * @returns {string} Document slug
 */
export function generateDocumentSlug(clientName, projectName, options = {}) {
  const year = options.year || 2026; // Default to 2026 for business documents
  const revision = options.revision || 1;
  const yearShort = String(year).slice(-2);

  const clientSlug = slugify(clientName, 15);
  const projectSlug = slugify(projectName, 15);

  return `WRN-AI-${clientSlug}-${projectSlug}-${yearShort}r${revision}`;
}

/**
 * Generate timestamp for filenames
 * @returns {string} Timestamp in YYYYMMDD_HHmmss format
 */
export function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date (e.g., "December 21, 2025")
 */
export function formatDateDisplay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format currency with thousands commas
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: '$')
 * @returns {string} Formatted currency (e.g., "$49,500")
 */
export function formatCurrency(amount, currency = '$') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return `${currency}0`;
  }

  return `${currency}${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Format currency with period suffix
 * @param {number} amount - Amount to format
 * @param {string} period - Period (e.g., 'mo', 'yr')
 * @returns {string} Formatted currency with period (e.g., "$49,500/mo")
 */
export function formatCurrencyPeriod(amount, period = 'mo') {
  return `${formatCurrency(amount)}/${period}`;
}

/**
 * Format number with thousands commas (no currency symbol)
 * @param {number} num - Number to format
 * @param {number} decimals - Maximum decimal places (default: 0)
 * @returns {string} Formatted number (e.g., "49,500")
 */
export function formatNumber(num, decimals = 0) {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }

  return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

/**
 * Format hours with 'hrs' suffix
 * @param {number} hours - Hours to format
 * @returns {string} Formatted hours (e.g., "120 hrs")
 */
export function formatHours(hours) {
  return `${formatNumber(hours)} hrs`;
}

/**
 * Generate unified project_identity object
 * Used across all 3 document types for consistency
 *
 * @param {Object} intake - Intake/audit data
 * @param {Object} [options] - Options
 * @param {string} [options.documentType] - Document type (audit, project_plan, proposal)
 * @param {string} [options.friendlyName] - Pre-generated friendly name (optional)
 * @param {number} [options.validityDays] - Validity period in days (default: 14)
 * @param {number} [options.revision] - Revision number (default: 1)
 * @returns {Object} Unified project_identity object
 */
export function generateProjectIdentity(intake, options = {}) {
  // Extract client name from various intake formats
  const clientName =
    intake.prepared_for?.account_name ||
    intake.client?.name ||
    intake.prospect?.company_name ||
    intake.client_name ||
    'Unknown Client';

  // Extract process/workflow name (prefer short names over long summaries)
  let processName =
    intake.section_a_workflow_definition?.q01_workflow_name ||  // Audit format
    intake.project?.workflow_name ||                            // Project plan format
    intake.workflow_name ||                                     // Direct field
    intake.process_name ||
    extractShortProcessName(intake.project?.title) ||
    extractShortProcessName(intake.project?.summary) ||
    'Business Process';

  // Strip trailing periods from process name
  processName = processName.trim().replace(/\.+$/, '');

  // Generate project name (usually same as process name, can be overridden)
  const projectName = (options.projectName || processName).trim().replace(/\.+$/, '');

  // Generate friendly name (consistent across all document types)
  const friendlyName = options.friendlyName ||
    generateFriendlyName(processName);

  // Generate slugs
  const clientSlug = slugify(clientName, 15);
  const projectSlug = slugify(projectName, 15);
  const documentSlug = generateDocumentSlug(clientName, projectName, {
    revision: options.revision || 1
  });

  // Calculate dates - Force 2026 for document year (business year)
  const processDate = new Date();
  const documentYear = options.year || 2026; // Default to 2026 for business documents
  const validityDays = options.validityDays || 14;
  const validUntil = new Date(processDate);
  validUntil.setDate(validUntil.getDate() + validityDays);

  return {
    client_name: clientName,
    client_slug: clientSlug,
    project_name: projectName,
    project_slug: projectSlug,
    process_name: processName,
    document_slug: documentSlug,
    friendly_name: friendlyName,
    process_date: processDate.toISOString(),
    process_date_display: formatDateDisplay(processDate),
    valid_until: validUntil.toISOString(),
    valid_until_display: formatDateDisplay(validUntil),
    validity_days: validityDays,
    year: documentYear
  };
}

/**
 * Extract a short process name from a long title/summary
 * Extracts key business terms (2-4 words max)
 * @param {string} text - Long title or summary
 * @returns {string|null} Short process name or null
 */
function extractShortProcessName(text) {
  if (!text || typeof text !== 'string') return null;

  // If already short (<=30 chars), use as-is
  if (text.length <= 30) return text;

  // Common patterns to extract short names from long descriptions
  const patterns = [
    /automat\w*\s+(\w+(?:\s+\w+)?)\s+(?:system|workflow|process)/i,  // "automated X system"
    /(\w+\s+fulfillment)/i,  // "order fulfillment"
    /(\w+\s+automation)/i,   // "inventory automation"
    /(\w+\s+integration)/i,  // "API integration"
    /(\w+\s+workflow)/i,     // "billing workflow"
    /(\w+\s+processing)/i,   // "claims processing"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Capitalize first letter of each word
      return match[1].replaceAll(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Fallback: extract first 2-3 significant words
  const words = text
    .replace(/^(the|a|an)\s+/i, '')  // Remove leading articles
    .replace(/client requires?\s*/i, '')  // Remove "client requires"
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^(the|and|for|with|from|into|that|this)$/i.test(w))
    .slice(0, 3);

  if (words.length >= 2) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return null;
}

/**
 * Generate a professional friendly name for the project
 * Creates a catchy codename that's different from the process name
 * IMPORTANT: This must be consistent across all document types (audit, project_plan, proposal)
 * @param {string} processName - Process/workflow name
 * @returns {string} Friendly project name (codename)
 */
function generateFriendlyName(processName) {
  // Extract key words from process name
  const words = processName
    .split(/[\s_-]+/)
    .filter(w => w.length > 2 && !/^(the|and|for|with|from)$/i.test(w))
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  if (words.length === 0) {
    return 'Project Alpha';
  }

  // Get a single key word to build the codename
  const keyWord = words[0];

  // Generate consistent codename based on process name (deterministic)
  // Using "Operation" prefix for professional military-style codenames
  const suffixes = ['Overhaul', 'Streamline', 'Accelerator', 'Catalyst', 'Evolution'];

  // Pick suffix deterministically based on keyWord (same process = same suffix always)
  const suffixIndex = keyWord.codePointAt(0) % suffixes.length;
  const suffix = suffixes[suffixIndex];

  // Use "Operation" prefix for a catchy codename
  return `Operation ${keyWord} ${suffix}`;
}

/**
 * Generate output file path with consistent naming
 * @param {Object} options - Options
 * @param {string} options.outputDir - Base output directory
 * @param {string} options.type - File type (audit, project_plan, proposal)
 * @param {string} options.clientSlug - Client slug
 * @param {string} options.projectSlug - Project slug (optional)
 * @param {string} options.ext - File extension
 * @returns {Object} { path, dir, filename }
 */
export function generateOutputPath(options) {
  const { outputDir, type, clientSlug, projectSlug, ext } = options;
  const timestamp = generateTimestamp();

  // Build directory path
  let dir = outputDir;
  if (clientSlug) {
    dir = `${dir}/${clientSlug}`;
  }

  if (projectSlug) {
    dir = `${dir}/${projectSlug}`;
  }

  // Build filename
  const parts = [type, clientSlug];
  if (projectSlug) {
    parts.push(projectSlug);
  }

  parts.push(timestamp);
  const filename = `${parts.join('_')}.${ext}`;

  return {
    path: `${dir}/${filename}`,
    dir,
    filename
  };
}

export default {
  slugify,
  slugifyFilename,
  generateDocumentSlug,
  generateTimestamp,
  formatDateDisplay,
  formatCurrency,
  formatCurrencyPeriod,
  formatNumber,
  formatHours,
  generateProjectIdentity,
  generateOutputPath
};
