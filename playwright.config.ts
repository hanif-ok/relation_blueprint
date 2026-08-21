import { defineConfig } from '@playwright/test';

// E2E config. `webServer` builds-and-serves the static app via `vite preview` so the
// tests exercise the real production bundle (correct base path, real SW once Plan 08
// lands). The Vite preview port for this project is 4173 (Vite default).
//
// BASE_PATH MUST track `vite.config.ts`'s `BASE` const. That moved from the GitHub Pages
// repo subpath `/relation_blueprint/` to the Cloudflare Pages domain root `/` (commit d2e7d9b);
// leaving this at the old subpath makes `vite preview` 404 every navigation, so no e2e in this
// repo can load the app at all.
const PREVIEW_PORT = 4173;
const BASE_PATH = '/';
const BASE_URL = `http://localhost:${PREVIEW_PORT}${BASE_PATH}`;

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
    // The E2E build uses `--mode e2e` (VITE_E2E=true) so the window.__rb test bridge is present
    // in this preview only; the default production build ships without it (WR-01).
    command: 'npm run build:e2e && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
