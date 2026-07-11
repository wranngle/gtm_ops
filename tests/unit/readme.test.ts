/**
 * README drift guard — assertions that hold while the repo has the
 * named files / scripts / dirs. Catches stale claims like the
 * pre-fix "vanilla HTML/JS" / "workflows/" / "DEMO_MODE only" wording
 * the moment a future PR removes a referenced file or breaks a
 * documented script.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const architecture = readFileSync(join(root, 'ARCHITECTURE.md'), 'utf8');
const pkgJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('README content reflects reality', () => {
  // Every directory or file the README mentions in backticks (relative
  // path form) should actually exist. Skips known-external link anchors.
  const claimedPaths = [
    'apps/ops-console/',
    'functions/api/',
    'tokens/',
    'ARCHITECTURE.md',
    'DESIGN.md',
    'LICENSE',
    'eval-harness.manifest.json',
    'requirements.txt',
    'wrangler.toml',
    'apps/ops-console/_headers',
    'apps/ops-console/_redirects',
    'docs/hero.webp',
    'docs/brand/gtm_ops-wordmark-light.png',
    'docs/brand/gtm_ops-wordmark-dark.png',
    'apps/ops-console/assets/screenshots/console-generate.png',
    'apps/ops-console/assets/screenshots/console-evals.png',
    'apps/ops-console/assets/screenshots/console-settings.png',
  ];
  for (const p of claimedPaths) {
    it(`mentions \`${p}\` and the path exists on disk`, () => {
      expect(readme).toContain(p);
      expect(existsSync(join(root, p)), `${p} missing on disk`).toBe(true);
    });
  }

  // Every npm script the README documents in a code block should be a
  // real entry in package.json scripts.
  const documentedScripts = ['start', 'typecheck', 'test:run', 'test:console', 'test:e2e', 'eval:harness', 'deploy', 'deploy:preview', 'pages:dev'];
  for (const s of documentedScripts) {
    it(`documents \`bun run ${s}\` and that script exists in package.json`, () => {
      expect(readme).toMatch(new RegExp(`bun run ${s.replace(/:/g, String.raw`\:`)}`));
      expect(pkgJson.scripts[s], `script "${s}" missing in package.json`).toBeTruthy();
    });
  }

  it('does not claim "vanilla HTML/JS" — the console is now React + babel-standalone', () => {
    expect(readme).not.toMatch(/vanilla HTML\/JS/i);
  });

  it('does not claim "DEMO_MODE only" — Pages deploy is now full-stack via functions/', () => {
    expect(readme).not.toMatch(/DEMO_MODE only/);
  });

  it('does not reference a removed `workflows/` directory', () => {
    // Inline link or backticked path to "workflows/" is the marker.
    // The github org link wranngle/n8n is allowed.
    const re = /[`(]workflows\//;
    expect(readme).not.toMatch(re);
  });

  it('apps/ops-console contains React .tsx sources (not vanilla static HTML)', () => {
    const consoleDir = join(root, 'apps', 'ops-console', 'console');
    expect(statSync(consoleDir).isDirectory()).toBe(true);
    expect(existsSync(join(consoleDir, 'app.tsx'))).toBe(true);
  });
});

describe('ARCHITECTURE content reflects reality', () => {
  const claimedPaths = [
    'apps/ops-console/',
    'lib/',
    'prompts/',
    'server.ts',
    'functions/api/',
    'cli.ts',
    'examples/',
    'templates/',
    'public/',
    'config/',
    'migrations/',
    'tokens/',
    'docs/',
    'scripts/',
    'tests/',
    'DESIGN.md',
    'README.md',
    'LICENSE',
  ];
  for (const p of claimedPaths) {
    it(`mentions \`${p}\` and the path exists on disk`, () => {
      expect(architecture).toContain(p);
      expect(existsSync(join(root, p)), `${p} missing on disk`).toBe(true);
    });
  }

  // Negative assertions blocking the specific stale phrases that ticks 24/28
  // surfaced. If anyone reintroduces these the test fails loudly.
  const stalePhrases = [
    'vanilla HTML/JS',           // console is React + babel-standalone
    'workflows/',                // dir doesn't exist; n8n moved out
    'openspec/',                 // dir doesn't exist
    'CHANGELOG.md',              // file doesn't exist
    'DEPLOYMENT.md',             // file doesn't exist
    'walkthrough-lead-comes-in', // doc doesn't exist
  ];
  for (const phrase of stalePhrases) {
    it(`does not contain stale phrase "${phrase}"`, () => {
      expect(architecture).not.toContain(phrase);
    });
  }

  it('mentions Cloudflare Pages Functions deploy mode', () => {
    expect(architecture).toMatch(/pages function/i);
  });
});
