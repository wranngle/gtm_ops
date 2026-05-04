/**
 * Tiny static server for ops-console Playwright tests.
 * Bun-native — no Express, no port collisions with the main API server.
 *
 * Serves apps/ops-console as the docroot. Default port 4173.
 */
// Bun globals (Bun.serve, Bun.file, import.meta.dir) are typed via the
// bun-types package wired into tsconfig.json#compilerOptions.types — no
// per-file reference needed.
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const port = Number(process.argv[2] || 4173);
const root = resolve(import.meta.dir, '..', '..', 'apps', 'ops-console');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return TYPES[ext] || 'application/octet-stream';
}

const server = Bun.serve({
  port,
  hostname: '127.0.0.1',
  async fetch(req) {
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return new Response('bad url', { status: 400 });
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('..')) return new Response('forbidden', { status: 403 });
    if (pathname.endsWith('/')) pathname = `${pathname}index.html`;
    const filePath = join(root, pathname);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      // Try directory index for /console etc.
      const idx = join(root, pathname, 'index.html');
      if (existsSync(idx)) {
        const file = Bun.file(idx);
        return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return new Response('not found', { status: 404 });
    }
    const file = Bun.file(filePath);
    return new Response(file, {
      headers: {
        'Content-Type': contentType(filePath),
        'Cache-Control': 'no-store',
        // Force DEMO_MODE so the console swaps to fixtures.
        'X-Demo-Mode': '1',
      },
    });
  },
});

console.log(`[console-static] listening on http://${server.hostname}:${server.port} (root: ${root})`);
