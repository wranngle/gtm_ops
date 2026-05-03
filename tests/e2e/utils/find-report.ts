/**
 * Utility to find generated reports in the output directory
 *
 * Output structure:
 * output/{client-slug}/{document-slug}/unified_report_*.html
 * output/{client-slug}/{document-slug}/INTERNAL_*.html
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Find the most recent unified report (excludes internal sheets)
 */
export function findLatestReport(): string | null {
  const outputDir = path.join(process.cwd(), 'output');

  if (!fs.existsSync(outputDir)) {
    return null;
  }

  // Get client directories sorted by modification time (most recent first)
  const clients = fs.readdirSync(outputDir)
    .filter(f => {
      const fullPath = path.join(outputDir, f);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort((a, b) => {
      const statA = fs.statSync(path.join(outputDir, a));
      const statB = fs.statSync(path.join(outputDir, b));
      return statB.mtime.getTime() - statA.mtime.getTime();
    });

  if (clients.length === 0) return null;

  // Search through client directories
  for (const client of clients) {
    const clientDir = path.join(outputDir, client);

    // Get document slug subdirectories
    const slugDirs = fs.readdirSync(clientDir)
      .filter(f => {
        const fullPath = path.join(clientDir, f);
        return fs.statSync(fullPath).isDirectory() && f.startsWith('WRN-AI-');
      })
      .sort((a, b) => {
        const statA = fs.statSync(path.join(clientDir, a));
        const statB = fs.statSync(path.join(clientDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    if (slugDirs.length === 0) {
      // Fallback: check if HTML files are directly in client dir (legacy structure)
      const directHtml = fs.readdirSync(clientDir)
        .filter(f => f.endsWith('.html') && !f.includes('internal') && !f.includes('INTERNAL'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(clientDir, a));
          const statB = fs.statSync(path.join(clientDir, b));
          return statB.mtime.getTime() - statA.mtime.getTime();
        });

      if (directHtml.length > 0) {
        return path.join(clientDir, directHtml[0]);
      }
      continue;
    }

    // Get HTML files from the most recent slug directory
    const slugDir = path.join(clientDir, slugDirs[0]);
    const htmlFiles = fs.readdirSync(slugDir)
      .filter(f => f.endsWith('.html') && !f.includes('internal') && !f.includes('INTERNAL'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(slugDir, a));
        const statB = fs.statSync(path.join(slugDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    if (htmlFiles.length > 0) {
      return path.join(slugDir, htmlFiles[0]);
    }
  }

  return null;
}

/**
 * Find the most recent internal sheet
 */
export function findLatestInternalSheet(): string | null {
  const outputDir = path.join(process.cwd(), 'output');

  if (!fs.existsSync(outputDir)) {
    return null;
  }

  // Get client directories sorted by modification time
  const clients = fs.readdirSync(outputDir)
    .filter(f => {
      const fullPath = path.join(outputDir, f);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort((a, b) => {
      const statA = fs.statSync(path.join(outputDir, a));
      const statB = fs.statSync(path.join(outputDir, b));
      return statB.mtime.getTime() - statA.mtime.getTime();
    });

  if (clients.length === 0) return null;

  // Search through client directories
  for (const client of clients) {
    const clientDir = path.join(outputDir, client);

    // Get document slug subdirectories
    const slugDirs = fs.readdirSync(clientDir)
      .filter(f => {
        const fullPath = path.join(clientDir, f);
        return fs.statSync(fullPath).isDirectory() && f.startsWith('WRN-AI-');
      })
      .sort((a, b) => {
        const statA = fs.statSync(path.join(clientDir, a));
        const statB = fs.statSync(path.join(clientDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    if (slugDirs.length === 0) {
      // Fallback: check if HTML files are directly in client dir
      const directHtml = fs.readdirSync(clientDir)
        .filter(f => f.endsWith('.html') && (f.includes('internal') || f.includes('INTERNAL')))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(clientDir, a));
          const statB = fs.statSync(path.join(clientDir, b));
          return statB.mtime.getTime() - statA.mtime.getTime();
        });

      if (directHtml.length > 0) {
        return path.join(clientDir, directHtml[0]);
      }
      continue;
    }

    // Get internal sheet from most recent slug directory
    const slugDir = path.join(clientDir, slugDirs[0]);
    const internalFiles = fs.readdirSync(slugDir)
      .filter(f => f.endsWith('.html') && (f.includes('internal') || f.includes('INTERNAL')))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(slugDir, a));
        const statB = fs.statSync(path.join(slugDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    if (internalFiles.length > 0) {
      return path.join(slugDir, internalFiles[0]);
    }
  }

  return null;
}
