/**
 * Unit tests for lib/file-utils.ts — slugification, timestamp
 * formatting, and structured output-path construction. Untested
 * before this file. Path-shape regressions silently break all
 * downstream consumers that read by directory layout (the proposal
 * pipeline, history queries, the gardener cleanup).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let slugify: any;
let generateTimestamp: any;
let generateISOTimestamp: any;
let ensureDir: any;
let generateOutputPath: any;
let generateRelatedPaths: any;
let generateInputPath: any;
let moveToOld: any;
let parseOutputFilename: any;

let scratch: string;

beforeEach(async () => {
  const mod: any = await import('../../lib/file-utils.js');
  ({
    slugify,
    generateTimestamp,
    generateISOTimestamp,
    ensureDir,
    generateOutputPath,
    generateRelatedPaths,
    generateInputPath,
    moveToOld,
    parseOutputFilename,
  } = mod);

  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fileutils-'));
});

afterEach(() => {
  if (scratch && fs.existsSync(scratch)) {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

describe('[P0] slugify', () => {
  it('[P0] should lowercase, replace non-alphanumeric with _, collapse runs, trim', () => {
    expect(slugify('Acme  Corp / Phase 2!')).toBe('acme_corp_phase_2');
  });

  it('[P0] should fall back to "unknown" for empty / non-string', () => {
    expect(slugify('')).toBe('unknown');
    expect(slugify(null as any)).toBe('unknown');
    expect(slugify(undefined as any)).toBe('unknown');
  });

  it('[P1] should clamp to default 50 chars, configurable via second arg', () => {
    const long = 'x'.repeat(120);
    expect(slugify(long).length).toBe(50);
    expect(slugify(long, 10).length).toBe(10);
  });

  it('[P1] should strip leading/trailing underscores', () => {
    expect(slugify('!!!hello world!!!')).toBe('hello_world');
  });
});

describe('[P0] generateTimestamp / generateISOTimestamp', () => {
  it('[P0] generateTimestamp should match YYYYMMDD_HHmmss', () => {
    expect(generateTimestamp()).toMatch(/^\d{8}_\d{6}$/);
  });

  it('[P0] generateISOTimestamp should match YYYY-MM-DD_HHmmss', () => {
    expect(generateISOTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}$/);
  });

  it('[P1] should respect a passed-in Date', () => {
    const d = new Date(2026, 4, 6, 9, 30, 15); // local time
    expect(generateTimestamp(d)).toBe('20260506_093015');
    expect(generateISOTimestamp(d)).toBe('2026-05-06_093015');
  });
});

describe('[P0] ensureDir', () => {
  it('[P0] should create a missing directory and return true', () => {
    const target = path.join(scratch, 'a', 'b', 'c');
    expect(fs.existsSync(target)).toBe(false);
    expect(ensureDir(target)).toBe(true);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('[P1] should return false when directory already exists', () => {
    const target = path.join(scratch, 'pre-existing');
    fs.mkdirSync(target);
    expect(ensureDir(target)).toBe(false);
  });
});

describe('[P0] generateOutputPath', () => {
  it('[P0] should build the {dir, path, filename, slugs, timestamp} shape', () => {
    const d = new Date(2026, 4, 6, 9, 30, 15);
    const result = generateOutputPath({
      outputDir: scratch,
      type: 'proposal',
      company: 'Acme Corp',
      project: 'Phase 2',
      ext: 'html',
      timestamp: d,
    });
    expect(result.company_slug).toBe('acme_corp');
    expect(result.project_slug).toBe('phase_2');
    expect(result.timestamp).toBe('20260506_093015');
    expect(result.filename).toBe('proposal_acme_corp_phase_2_20260506_093015.html');
    expect(result.dir).toBe(path.join(scratch, 'acme_corp', 'phase_2'));
    expect(result.path).toBe(path.join(result.dir, result.filename));
    expect(fs.existsSync(result.dir)).toBe(true);
  });

  it('[P0] should support flat=true (no company/project subdirs)', () => {
    const result = generateOutputPath({
      outputDir: scratch,
      company: 'Acme',
      project: 'P',
      flat: true,
      timestamp: new Date(2026, 4, 6, 9, 30, 15),
    });
    expect(result.dir).toBe(scratch);
  });

  it('[P1] should drop the project segment when null', () => {
    const result = generateOutputPath({
      outputDir: scratch,
      type: 'proposal',
      company: 'Acme',
      project: null,
      ext: 'html',
      timestamp: new Date(2026, 4, 6, 9, 30, 15),
    });
    expect(result.project_slug).toBeNull();
    expect(result.filename).toBe('proposal_acme_20260506_093015.html');
    expect(result.dir).toBe(path.join(scratch, 'acme'));
  });
});

describe('[P0] generateRelatedPaths', () => {
  it('[P0] should produce sibling extensions and suffixed paths', () => {
    const base = path.join(scratch, 'proposal_acme_20260506_093015.html');
    const related = generateRelatedPaths(
      base,
      ['.json', '.pdf'],
      ['_polish_log'],
    );
    expect(related.primary).toBe(base);
    expect(related.json).toBe(path.join(scratch, 'proposal_acme_20260506_093015.json'));
    expect(related.pdf).toBe(path.join(scratch, 'proposal_acme_20260506_093015.pdf'));
    // Suffix path: original extension preserved.
    expect(related.polishlog).toBe(
      path.join(scratch, 'proposal_acme_20260506_093015_polish_log.html'),
    );
  });
});

describe('[P0] generateInputPath', () => {
  it('[P0] should slugify name and create the input dir', () => {
    const result = generateInputPath({
      inputDir: path.join(scratch, 'input'),
      name: 'Big Customer ABC.txt',
      ext: 'txt',
    });
    expect(result.filename).toBe('big_customer_abc_txt.txt');
    expect(fs.existsSync(result.dir)).toBe(true);
  });
});

describe('[P0] moveToOld', () => {
  it('[P0] should move an existing file into oldDir', () => {
    const src = path.join(scratch, 'a.txt');
    fs.writeFileSync(src, 'hello');
    const oldDir = path.join(scratch, 'old');
    const dest = moveToOld(src, oldDir);
    expect(dest).toBe(path.join(oldDir, 'a.txt'));
    expect(fs.existsSync(src)).toBe(false);
    expect(fs.readFileSync(dest!, 'utf8')).toBe('hello');
  });

  it('[P0] should return null when source does not exist', () => {
    const src = path.join(scratch, 'missing.txt');
    expect(moveToOld(src, path.join(scratch, 'old'))).toBeNull();
  });

  it('[P1] should disambiguate by timestamp on collision', () => {
    const oldDir = path.join(scratch, 'old');
    fs.mkdirSync(oldDir);
    fs.writeFileSync(path.join(oldDir, 'a.txt'), 'first');
    const src = path.join(scratch, 'a.txt');
    fs.writeFileSync(src, 'second');
    const dest = moveToOld(src, oldDir);
    // Should NOT have overwritten the existing a.txt; the new one
    // gets a timestamped suffix and lives alongside.
    expect(dest).not.toBe(path.join(oldDir, 'a.txt'));
    expect(dest).toMatch(/a_\d{8}_\d{6}\.txt$/);
    expect(fs.readFileSync(path.join(oldDir, 'a.txt'), 'utf8')).toBe('first');
  });
});

describe('[P0] parseOutputFilename - reverse the naming convention', () => {
  it('[P0] should parse {type}_{company}_{project}_{timestamp}.{ext}', () => {
    const parsed = parseOutputFilename('proposal_acme_phase_2_20260506_093015.html');
    expect(parsed).toEqual({
      type: 'proposal',
      company: 'acme',
      project: 'phase_2',
      timestamp: '20260506_093015',
      ext: 'html',
      filename: 'proposal_acme_phase_2_20260506_093015.html',
    });
  });

  it('[P0] should parse {type}_{company}_{timestamp}.{ext} (no project)', () => {
    const parsed = parseOutputFilename('proposal_acme_20260506_093015.html');
    expect(parsed).toMatchObject({
      type: 'proposal',
      company: 'acme',
      project: null,
      timestamp: '20260506_093015',
      ext: 'html',
    });
  });

  it('[P1] should return null when timestamp shape is invalid', () => {
    expect(parseOutputFilename('proposal_acme_oops.html')).toBeNull();
  });

  it('[P1] should return null for too-short filenames', () => {
    expect(parseOutputFilename('foo.html')).toBeNull();
  });
});
