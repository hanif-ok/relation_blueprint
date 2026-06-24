import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages project site is served from /relation_blueprint/.
// `base`, and (in Plan 08) the PWA `start_url`/`scope`, must all use this subpath
// or deployed assets 404 and the service worker controls the wrong scope.
// vite-plugin-pwa is wired in Plan 08, not here.
export default defineConfig({
  base: '/relation_blueprint/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
