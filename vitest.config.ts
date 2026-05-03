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
    hookTimeout: 10_000
  }
});
