#!/usr/bin/env node
/**
 * Check for numeric issues in output schemas
 */
import fs from 'fs';
import path from 'path';

const outputDir = './output';

function findSchemas(dir) {
  const schemas = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        schemas.push(...findSchemas(fullPath));
      } else if (entry.name.includes('_schema_') && entry.name.endsWith('.json')) {
        try {
          schemas.push({ file: fullPath, schema: JSON.parse(fs.readFileSync(fullPath, 'utf8')) });
        } catch {}
      }
    }
  } catch {}
  return schemas;
}

const schemas = findSchemas(outputDir);
console.log(`Checking ${schemas.length} schemas...\n`);

// Check for Infinity values
console.log('=== NA-051: Infinity values ===');
let infinityCount = 0;
for (const { schema, file } of schemas) {
  const jsonString = JSON.stringify(schema);
  if (jsonString.includes('Infinity')) {
    infinityCount++;
    console.log(`  FOUND in: ${path.basename(path.dirname(file))}`);
  }
}
console.log(`  ${infinityCount} schemas with Infinity\n`);

// Check for complexity scores outside 1-10
console.log('=== NA-033: Complexity scores outside 1-10 ===');
let scoreIssues = 0;
for (const { schema, file } of schemas) {
  const integrations = schema.research?.integrations || [];
  for (const int of integrations) {
    const score = int.research?.complexity?.score;
    if (score !== undefined && (score < 1 || score > 10)) {
      scoreIssues++;
      console.log(`  ${path.basename(path.dirname(file))}: ${int.integration} = ${score}`);
    }
  }
}
console.log(`  ${scoreIssues} integrations with score outside 1-10\n`);

// Check NA-030: total hours vs role sum
console.log('=== NA-030: Total hours vs role sum ===');
let hoursIssues = 0;
for (const { schema, file } of schemas) {
  const baseHours = schema.estimate?.effort?.base_hours;
  if (baseHours?.total) {
    const roleSum =
      (baseHours.solutions_architect || 0) +
      (baseHours.automation_engineer || 0) +
      (baseHours.ai_developer || 0) +
      (baseHours.qa_documentation || 0);
    const diff = Math.abs(baseHours.total - roleSum);
    const tolerance = Math.max(baseHours.total * 0.1, 5);
    if (diff > tolerance) {
      hoursIssues++;
      console.log(`  ${path.basename(path.dirname(file))}: total=${baseHours.total}, sum=${roleSum}, diff=${diff}`);
    }
  }
}
console.log(`  ${hoursIssues} schemas with hours mismatch\n`);
