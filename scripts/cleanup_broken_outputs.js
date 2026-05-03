#!/usr/bin/env node
/**
 * Cleanup script to archive broken output schemas
 * These are outputs from earlier pipeline versions missing required fields
 */
import fs from 'fs';
import path from 'path';

const outputDir = './output';
const archiveDir = './old/broken-outputs';

function findBrokenSchemas(dir) {
  const schemas = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        schemas.push(...findBrokenSchemas(fullPath));
      } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
        try {
          const schema = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          const isBroken = !schema.identity || !schema.version || !schema.generated_at;
          if (isBroken) {
            schemas.push({ file: fullPath, parent: path.dirname(fullPath) });
          }
        } catch (e) {
          // Invalid JSON is also broken
          schemas.push({ file: fullPath, parent: path.dirname(fullPath) });
        }
      }
    }
  } catch (e) {
    // Skip inaccessible directories
  }
  return schemas;
}

const broken = findBrokenSchemas(outputDir);
console.log(`Found ${broken.length} broken schema files`);

// Get unique parent directories
const parentsToMove = [...new Set(broken.map(b => b.parent))];
console.log(`From ${parentsToMove.length} directories\n`);

// Create archive directory
fs.mkdirSync(archiveDir, { recursive: true });

// Move each broken directory
let movedCount = 0;
for (const parentPath of parentsToMove) {
  const relativePath = path.relative(outputDir, parentPath);
  const targetPath = path.join(archiveDir, relativePath);

  // Create target parent directory
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Move if target doesn't exist
  if (!fs.existsSync(targetPath)) {
    try {
      fs.renameSync(parentPath, targetPath);
      movedCount++;
      console.log(`Moved: ${relativePath}`);
    } catch (e) {
      console.log(`Failed to move: ${relativePath} - ${e.message}`);
    }
  } else {
    console.log(`Skipped (exists): ${relativePath}`);
  }
}

console.log(`\nMoved ${movedCount} directories to ${archiveDir}`);
