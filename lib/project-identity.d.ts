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
export function slugify(text: string, maxLength?: number): string;
/**
 * Slugify for filenames (uses underscores)
 * @param {string} text - Text to slugify
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} Slugified text with underscores
 */
export function slugifyFilename(text: string, maxLength?: number): string;
/**
 * Generate document slug in format: WRN-AI-{ClientSlug}-{ProjectSlug}-{YY}r{revision}
 * @param {string} clientName - Client/company name
 * @param {string} projectName - Project/workflow name
 * @param {Object} options - Options
 * @param {number} options.year - Year (default: current year)
 * @param {number} options.revision - Revision number (default: 1)
 * @returns {string} Document slug
 */
export function generateDocumentSlug(clientName: string, projectName: string, options?: {
  year: number;
  revision: number;
}): string;
/**
 * Generate timestamp for filenames
 * @returns {string} Timestamp in YYYYMMDD_HHmmss format
 */
export function generateTimestamp(): string;
/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date (e.g., "December 21, 2025")
 */
export function formatDateDisplay(date: Date | string): string;
/**
 * Format currency with thousands commas
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: '$')
 * @returns {string} Formatted currency (e.g., "$49,500")
 */
export function formatCurrency(amount: number, currency?: string): string;
/**
 * Format currency with period suffix
 * @param {number} amount - Amount to format
 * @param {string} period - Period (e.g., 'mo', 'yr')
 * @returns {string} Formatted currency with period (e.g., "$49,500/mo")
 */
export function formatCurrencyPeriod(amount: number, period?: string): string;
/**
 * Format number with thousands commas (no currency symbol)
 * @param {number} num - Number to format
 * @param {number} decimals - Maximum decimal places (default: 0)
 * @returns {string} Formatted number (e.g., "49,500")
 */
export function formatNumber(num: number, decimals?: number): string;
/**
 * Format hours with 'hrs' suffix
 * @param {number} hours - Hours to format
 * @returns {string} Formatted hours (e.g., "120 hrs")
 */
export function formatHours(hours: number): string;
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
export function generateProjectIdentity(intake: Record<string, unknown>, options?: {
  documentType?: string | undefined;
  friendlyName?: string | undefined;
  validityDays?: number | undefined;
  revision?: number | undefined;
}): Record<string, unknown>;
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
export function generateOutputPath(options: {
  outputDir: string;
  type: string;
  clientSlug: string;
  projectSlug: string;
  ext: string;
}): Record<string, unknown>;
declare namespace _default {
  export { slugify };
  export { slugifyFilename };
  export { generateDocumentSlug };
  export { generateTimestamp };
  export { formatDateDisplay };
  export { formatCurrency };
  export { formatCurrencyPeriod };
  export { formatNumber };
  export { formatHours };
  export { generateProjectIdentity };
  export { generateOutputPath };
}
export default _default;
// # sourceMappingURL=project_identity.d.ts.map