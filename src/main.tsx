import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (offline-first; no Google Fonts CDN). Fraunces = display/entity name,
// Inter = UI/body, JetBrains Mono = data/IDs/timestamps. (UI-SPEC A4)
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource-variable/jetbrains-mono/index.css';
// Design tokens (:root custom properties) — the single source of truth for the palette,
// loaded before any component styling.
import '@/app/tokens.css';
import { App } from '@/app/App';
import { registerPwa } from '@/app/pwa';
import { installTestBridge } from '@/db/testBridge';

// Expose the repository + db on window.__rb so E2E specs seed the real Dexie database.
// Gated behind a build-time flag so the bridge (which hands full read/write/delete over the
// user's local DB to any script on the page) is tree-shaken out of production bundles and only
// present in the dedicated E2E preview build (`vite build --mode e2e`, sets VITE_E2E=true) — WR-01.
if (import.meta.env.VITE_E2E === 'true') {
  installTestBridge();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the prompt-mode service worker after the app mounts. A new SW waits and the
// UpdateToast (S7) drives activation only on the user's Reload click when no write is in
// flight (RESEARCH ## Pattern 4 / Pitfall 7).
registerPwa();
