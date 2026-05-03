/**
 * Convert any string to a URL-safe slug
 * - Lowercase
 * - Replace non-alphanumeric with underscores
 * - Remove leading/trailing underscores
 * - Collapse multiple underscores
 * - Max 50 characters
 *
 * @param {string} text - Text to slugify
 * @param {number} maxLength - Maximum length (default 50)
 * @returns {string} Slugified text
 */
export function slugify(text: string, maxLength?: number): string;
/**
 * Generate consistent timestamp string
 * Format: YYYYMMDD_HHmmss
 *
 * @param {Date} date - Date to format (defaults to now)
 * @returns {string} Formatted timestamp
 */
export function generateTimestamp(date?: Date): string;
/**
 * Generate consistent ISO-style timestamp
 * Format: YYYY-MM-DD_HHmmss
 *
 * @param {Date} date - Date to format (defaults to now)
 * @returns {string} Formatted timestamp
 */
export function generateISOTimestamp(date?: Date): string;
/**
 * Ensure directory exists, creating it recursively if needed
 *
 * @param {string} dirPath - Directory path to ensure
 * @returns {boolean} True if directory was created, false if it already existed
 */
export function ensureDir(dirPath: string): boolean;
/**
 * Generate output file path with consistent organization
 *
 * Structure: output/{company}/{project}/{type}_{company}_{project}_{timestamp}.{ext}
 *
 * @param {Object} options - Path generation options
 * @param {string} options.outputDir - Base output directory (default: './output')
 * @param {string} options.type - File type prefix (e.g., 'audit', 'proposal', 'project_plan')
 * @param {string} options.company - Company/client name (will be slugified)
 * @param {string} options.project - Project/workflow name (will be slugified, optional)
 * @param {string} options.ext - File extension (e.g., 'html', 'json', 'pdf')
 * @param {Date} options.timestamp - Timestamp to use (default: now)
 * @param {boolean} options.flat - If true, skip company/project subdirectories
 * @returns {Object} { path, dir, filename, company_slug, project_slug, timestamp }
 */
export function generateOutputPath(options: {
    outputDir: string;
    type: string;
    company: string;
    project: string;
    ext: string;
    timestamp: Date;
    flat: boolean;
}): Object;
/**
 * Generate related output paths (e.g., .json, .pdf, _polish_log.json for an .html file)
 *
 * @param {string} basePath - Primary output path (e.g., report.html)
 * @param {Array<string>} extensions - Additional extensions to generate
 * @param {Array<string>} suffixes - Additional suffixes before extension (e.g., '_polish_log')
 * @returns {Object} Map of extension/suffix to path
 */
export function generateRelatedPaths(basePath: string, extensions?: Array<string>, suffixes?: Array<string>): Object;
/**
 * Generate input file path with consistent naming
 *
 * @param {Object} options - Path generation options
 * @param {string} options.inputDir - Base input directory (default: './input')
 * @param {string} options.name - Descriptive name for the file
 * @param {string} options.ext - File extension
 * @returns {Object} { path, dir, filename }
 */
export function generateInputPath(options: {
    inputDir: string;
    name: string;
    ext: string;
}): Object;
/**
 * Move file to old directory instead of deleting
 * Preserves history while cleaning up active directories
 *
 * @param {string} sourcePath - Path to file to move
 * @param {string} oldDir - Old directory path (default: './old')
 * @returns {string|null} New path if moved, null if source didn't exist
 */
export function moveToOld(sourcePath: string, oldDir?: string): string | null;
/**
 * Parse existing output filename to extract metadata
 *
 * @param {string} filename - Filename to parse
 * @returns {Object|null} Parsed metadata or null if not valid format
 */
export function parseOutputFilename(filename: string): Object | null;
declare namespace _default {
    export { slugify };
    export { generateTimestamp };
    export { generateISOTimestamp };
    export { ensureDir };
    export { generateOutputPath };
    export { generateRelatedPaths };
    export { generateInputPath };
    export { moveToOld };
    export { parseOutputFilename };
}
export default _default;
//# sourceMappingURL=file_utils.d.ts.map