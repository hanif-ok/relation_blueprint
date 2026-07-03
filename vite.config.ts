import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages project site is served from /relation_blueprint/.
// `base`, and the PWA `start_url`/`scope`, MUST all use this subpath or deployed assets
// 404 and the service worker controls the wrong scope (RESEARCH ## Pattern 4 / Pitfall 7).
const BASE = '/relation_blueprint/';

// Manifest theme/background mirror the UI-SPEC color tokens:
//   background = warm paper #F4F1EA (the chrome the splash sits on)
//   theme      = amber #C8742B (the single reserved accent)
// The full token system (tokens.ts/tokens.css) is owned by Plan 03; these two hexes are
// duplicated here only because the web manifest needs literal values at build time.
const PAPER = '#F4F1EA';
const AMBER = '#C8742B';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // 'prompt' — a new SW WAITS; we never blindly skipWaiting() under a running page
      // (RESEARCH ## Pattern 4 / Pitfall 7). The app surfaces an update toast and only
      // activates on the user's Reload click when no write is in flight.
      registerType: 'prompt',
      // The injected service worker is registered by our own src/app/pwa.ts via the
      // virtual:pwa-register module, so disable the plugin's auto-injected registration.
      injectRegister: false,
      // GitHub Pages base — the SW scope is derived from this subpath.
      base: BASE,
      scope: BASE,
      includeAssets: ['favicon.ico', 'manifest-icons/*.png'],
      manifest: {
        name: 'Relation Blueprint',
        short_name: 'Relation Blueprint',
        description:
          'A serverless, offline-capable PWA for people-tracking and relationship mapping. You own your entire database in your own Google Drive or Mega.nz.',
        // start_url + scope MUST be the repo subpath (RESEARCH ## Pattern 4).
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: PAPER,
        theme_color: AMBER,
        icons: [
          {
            src: 'manifest-icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'manifest-icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'manifest-icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the static app shell so the app opens and works offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // SPA navigation fallback within our scope.
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          {
            // Runtime-cache media GETs (avatar photos / map images served as same-origin
            // assets). Drive REST calls are NOT cached here — they carry auth and are
            // handled by the local-first sync layer, not the SW.
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'rb-media',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Keep the dev SW off by default; PWA behaviour is verified against the built bundle
      // (vite preview) where the base path and precache manifest are real.
      devOptions: {
        enabled: false,
      },
    }),
  ],
  // Google Identity Services' OAuth token popup needs THIS app to keep its opener↔popup link.
  // accounts.google.com sends a Cross-Origin-Opener-Policy header; unless the app is served with
  // `same-origin-allow-popups`, the browser severs the popup so GIS can't poll window.closed and
  // the flow dies with "Failed to open popup window" (see .planning/debug/resolved/
  // oauth-prompt-every-refresh.md). The header must come from whatever SERVES the app: set here
  // for `vite dev` (server) and `vite preview` (preview).
  // ⚠ GitHub Pages cannot send custom response headers, so the PRODUCTION deploy must provide this
  // COOP header another way (a headers-capable host such as Cloudflare Pages / Netlify `_headers`,
  // or enabling FedCM) — otherwise Drive OAuth breaks in production exactly as it did in dev.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
