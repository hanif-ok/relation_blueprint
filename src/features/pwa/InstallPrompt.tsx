import { useCallback, useEffect, useState } from 'react';

/**
 * S6 — PWA install affordance (UI-SPEC S6).
 *
 * Captures the `beforeinstallprompt` event (fired by Chromium browsers when the app is
 * installable), prevents the mini-infobar, and stashes the event so the app can trigger the
 * native install prompt from a user action. Renders:
 *   - a dismissible bottom toast ("Install Relation Blueprint" / body / "Install" / "Not now")
 *   - a persistent overflow "Install app" item via the `useInstallPrompt` hook, which the
 *     top-bar overflow menu (S1) consumes.
 *
 * `navigator.storage.persist()` is requested separately (usePersistentStorage) after a
 * meaningful user action — NOT here on mount.
 */

// UI-SPEC color tokens (paper / amber / ink). Inlined until the shared token system (Plan 03).
const PAPER = '#F4F1EA';
const AMBER = '#C8742B';
const INK = '#26211A';
const INK_MUTED = '#6B6358';
const HAIRLINE = '#D8D2C4';

/** The non-standard event Chromium fires when the app is installable. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallPromptState = {
  /** True while the app is installable and not yet installed/dismissed-permanently. */
  canInstall: boolean;
  /** Trigger the native install prompt. No-op when not installable. */
  promptInstall: () => Promise<void>;
};

/**
 * Hook owning the `beforeinstallprompt` lifecycle. Both the toast and the overflow
 * "Install app" item read from this so they stay in sync.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Suppress the default mini-infobar so we can present our own affordance.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      // Once installed the prompt is spent; hide all affordances.
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<void> => {
    if (!deferred) return;
    await deferred.prompt();
    // The deferred event can only be used once; clear it regardless of outcome.
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
  }, [deferred]);

  return { canInstall: deferred !== null, promptInstall };
}

export function InstallPrompt() {
  const { canInstall, promptInstall } = useInstallPrompt();
  // "Not now" dismisses the toast for this session; the overflow "Install app" item remains.
  const [toastDismissed, setToastDismissed] = useState(false);

  const handleInstall = useCallback(() => {
    void promptInstall();
    setToastDismissed(true);
  }, [promptInstall]);

  if (!canInstall || toastDismissed) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Relation Blueprint"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        minWidth: 280,
        maxWidth: 420,
        padding: '16px 20px',
        background: PAPER,
        color: INK,
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 10,
        // elevation-2 (UI-SPEC) — lifted over the dark canvas.
        boxShadow: '0 8px 24px rgba(27,34,48,.18)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
        Install Relation Blueprint
      </div>
      <div style={{ fontSize: 14, color: INK_MUTED, marginBottom: 12 }}>
        Add it to your device to open it offline, like a native app.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setToastDismissed(true)}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: `1px solid ${HAIRLINE}`,
            background: 'transparent',
            color: INK,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleInstall}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: 'none',
            background: AMBER,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
