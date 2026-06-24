import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Vitest config shares the same @/* alias as vite.config.ts so test imports match app imports.
// `tests/setup.ts` wires fake-indexeddb so Dexie can open an in-memory IndexedDB under node.
// The `test` npm script invokes `vitest run` (CI-safe, single pass) — never a watch default.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Wave 0 ships the harness with zero tests; the runner must still exit 0 so CI
    // (and this plan's acceptance gate) is green until later plans add real tests.
    passWithNoTests: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Playwright E2E specs live in e2e/ and are run by `npm run test:e2e`, not Vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
