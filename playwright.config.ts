import { defineConfig } from '@playwright/test';

// E2E config. `webServer` builds-and-serves the static app via `vite preview` so the
// tests exercise the real production bundle (correct base path, real SW once Plan 08
// lands). The Vite preview port for this project is 4173 (Vite default) under the
// /relation_blueprint/ base path.
const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}/relation_blueprint/`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
