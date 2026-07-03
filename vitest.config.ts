import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.js'],
      exclude: ['node_modules', 'tests']
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // Bun's worker_threads RPC can deadlock vitest's default `threads` pool
    // (CI saw "Closing rpc while onUserConsoleLog was pending" with no exit).
    // `forks` uses child_process — clean teardown, no hang.
    pool: 'forks'
  }
});
