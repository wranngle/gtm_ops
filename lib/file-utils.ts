/**
 * file-utils.ts - Shared File Organization Utilities
 *
 * Provides consistent file naming, slugification, and output path generation
 * across all Wranngle pipeline tools.
 *
 * Output Structure:
 *   output/
 *     {company_slug}/
 *       {project_slug}/
 *         {type}_{company_slug}_{project_slug}_{timestamp}.{ext}
 *
 * Input Structure:
 *   input/
 *     {descriptive_name}.{ext}
 */

import fs from 'fs';
import path from 'path';

// =============================================================================
// TYPES
// =============================================================================

type GenerateOutputPathOptions = {
  outputDir?: string;
  type?: string;
  company?: string;
  project?: string | null;
  ext?: string;
  timestamp?: Date;
  flat?: boolean;
};

type OutputPathResult = {
  path: string;
  dir: string;
  filename: string;
  company_slug: string;
  project_slug: string | null;
  timestamp: string;
};

type GenerateInputPathOptions = {
  inputDir?: string;
  name?: string;
  ext?: string;
};

type InputPathResult = {
  path: string;
  dir: string;
  filename: string;
};

type ParsedFilename = {
  type: string;
  company: string;
  project: string | null;
  timestamp: string;
  ext: string;
  filename: string;
} | null;

type RelatedPaths = {
  primary: string;
  [key: string]: string;
};

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Convert any string to a URL-safe slug
 * - Lowercase
 * - Replace non-alphanumeric with underscores
 * - Remove leading/trailing underscores
 * - Collapse multiple underscores
 * - Max 50 characters
 *
 * @param text - Text to slugify
 * @param maxLength - Maximum length (default 50)
 * @returns Slugified text
 */
export function slugify(text: string, maxLength: number = 50): string {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }

  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, maxLength);
}

/**
 * Generate consistent timestamp string
 * Format: YYYYMMDD_HHmmss
 *
 * @param date - Date to format (defaults to now)
 * @returns Formatted timestamp
 */
export function generateTimestamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Generate consistent ISO-style timestamp
 * Format: YYYY-MM-DD_HHmmss
 *
 * @param date - Date to format (defaults to now)
 * @returns Formatted timestamp
 */
export function generateISOTimestamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

/**
 * Ensure directory exists, creating it recursively if needed
 *
 * @param dirPath - Directory path to ensure
 * @returns True if directory was created, false if it already existed
 */
export function ensureDir(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true});
    return true;
  }
  return false;
}

/**
 * Generate output file path with consistent organization
 *
 * Structure: output/{company}/{project}/{type}_{company}_{project}_{timestamp}.{ext}
 *
 * @param options - Path generation options
 * @returns Path generation result
 */
export function generateOutputPath(options: GenerateOutputPathOptions): OutputPathResult {
  const {
    outputDir = './output',
    type = 'output',
    company = 'unknown',
    project = null,
    ext = 'html',
    timestamp = new Date(),
    flat = false
  } = options;

  const companySlug = slugify(company);
  const projectSlug = project ? slugify(project) : null;
  const formattedTimestamp = generateTimestamp(timestamp);

  // Build filename
  const filenameParts = [type, companySlug];
  if (projectSlug) {
    filenameParts.push(projectSlug);
  }
  filenameParts.push(formattedTimestamp);
  const filename = `${filenameParts.join('_')}.${ext}`;

  // Build directory path
  let dir: string;
  if (flat) {
    dir = outputDir;
  } else {
    const dirParts = [outputDir, companySlug];
    if (projectSlug) {
      dirParts.push(projectSlug);
    }
    dir = path.join(...dirParts);
  }

  // Ensure directory exists
  ensureDir(dir);

  const fullPath = path.join(dir, filename);

  return {
    path: fullPath,
    dir,
    filename,
    company_slug: companySlug,
    project_slug: projectSlug,
    timestamp: formattedTimestamp
  };
}

/**
 * Generate related output paths (e.g., .json, .pdf, _polish_log.json for an .html file)
 *
 * @param basePath - Primary output path (e.g., report.html)
 * @param extensions - Additional extensions to generate
 * @param suffixes - Additional suffixes before extension (e.g., '_polish_log')
 * @returns Map of extension/suffix to path
 */
export function generateRelatedPaths(
  basePath: string,
  extensions: string[] = [],
  suffixes: string[] = []
): RelatedPaths {
  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const base = path.basename(basePath, ext);

  const paths: RelatedPaths = {
    primary: basePath
  };

  // Generate paths for different extensions
  for (const newExt of extensions) {
    const key = newExt.replace(/^\./, '');
    paths[key] = path.join(dir, `${base}.${key}`);
  }

  // Generate paths for suffixes (keep original extension)
  for (const suffix of suffixes) {
    const key = suffix.replace(/^_/, '').replace(/_/g, '');
    paths[key] = path.join(dir, `${base}${suffix}${ext}`);
  }

  return paths;
}

/**
 * Generate input file path with consistent naming
 *
 * @param options - Path generation options
 * @returns Input path result
 */
export function generateInputPath(options: GenerateInputPathOptions): InputPathResult {
  const {
    inputDir = './input',
    name = 'input',
    ext = 'txt'
  } = options;

  const slug = slugify(name);
  const filename = `${slug}.${ext}`;

  ensureDir(inputDir);

  return {
    path: path.join(inputDir, filename),
    dir: inputDir,
    filename
  };
}

/**
 * Move file to old directory instead of deleting
 * Preserves history while cleaning up active directories
 *
 * @param sourcePath - Path to file to move
 * @param oldDir - Old directory path (default: './old')
 * @returns New path if moved, null if source didn't exist
 */
export function moveToOld(sourcePath: string, oldDir: string = './old'): string | null {
  if (!fs.existsSync(sourcePath)) {
    return null;
  }

  ensureDir(oldDir);

  const filename = path.basename(sourcePath);
  const destPath = path.join(oldDir, filename);

  // Handle collision by adding timestamp
  let resolvedDestination = destPath;
  if (fs.existsSync(destPath)) {
    const fileExtension = path.extname(filename);
    const baseName = path.basename(filename, fileExtension);
    const collisionTimestamp = generateTimestamp();
    resolvedDestination = path.join(oldDir, `${baseName}_${collisionTimestamp}${fileExtension}`);
  }

  fs.renameSync(sourcePath, resolvedDestination);
  return resolvedDestination;
}

/**
 * Parse existing output filename to extract metadata
 *
 * @param filename - Filename to parse
 * @returns Parsed metadata or null if not valid format
 */
export function parseOutputFilename(filename: string): ParsedFilename {
  // Expected format: {type}_{company}_{project}_{timestamp}.{ext}
  // or: {type}_{company}_{timestamp}.{ext}

  const ext = path.extname(filename).slice(1);
  const base = path.basename(filename, `.${ext}`);
  const parts = base.split('_');

  if (parts.length < 3) {
    return null;
  }

  // Last part is always timestamp (YYYYMMDD_HHmmss = 15 chars with underscore)
  // But since we split on underscore, timestamp is last 2 parts
  const timestampParts = parts.slice(-2);
  const timestamp = timestampParts.join('_');

  // Validate timestamp format
  if (!/^\d{8}_\d{6}$/.test(timestamp)) {
    return null;
  }

  const documentType = parts[0];
  const identifierParts = parts.slice(1, -2);

  let company: string;
  let project: string | null;
  if (identifierParts.length === 1) {
    company = identifierParts[0];
    project = null;
  } else if (identifierParts.length >= 2) {
    company = identifierParts[0];
    project = identifierParts.slice(1).join('_');
  } else {
    return null;
  }

  return {
    type: documentType,
    company,
    project,
    timestamp,
    ext,
    filename
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  slugify,
  generateTimestamp,
  generateISOTimestamp,
  ensureDir,
  generateOutputPath,
  generateRelatedPaths,
  generateInputPath,
  moveToOld,
  parseOutputFilename
};
