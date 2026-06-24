import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { registerPwa } from '@/app/pwa';

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
