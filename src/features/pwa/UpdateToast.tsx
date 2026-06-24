import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribePwa, type UpdateSW } from '@/app/pwa';
import { isWriteInFlight } from '@/sync/writeStatus';

/**
 * S7 — Update-available toast (UI-SPEC S7).
 *
 * Copy: "A new version is ready." / "Reload to update." / actions "Reload" / "Later".
 *
 * "Reload" activates the WAITING service worker — but ONLY when no Drive write is in
 * flight (RESEARCH ## Pattern 4 / Pitfall 7). If a sync is mid-flight, the toast shows
 * "Finishing sync…" and polls the in-flight signal, then proceeds. It NEVER silently
 * swaps assets under an in-flight write.
 */

// UI-SPEC color tokens (paper chrome / amber accent / ink). Inlined here because the
// shared token system (Plan 03) is not yet present; values mirror the UI-SPEC color table.
const PAPER = '#F4F1EA';
const AMBER = '#C8742B';
const INK = '#26211A';
const INK_MUTED = '#6B6358';
const HAIRLINE = '#D8D2C4';

const POLL_MS = 250;

export function UpdateToast() {
  const [visible, setVisible] = useState(false);
  const [finishingSync, setFinishingSync] = useState(false);
  const updateSWRef = useRef<UpdateSW | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePwa({
      onNeedRefresh(updateSW) {
        updateSWRef.current = updateSW;
        setVisible(true);
      },
      // Offline-ready is surfaced by a separate quiet toast; ignored here.
      onOfflineReady() {},
    });
    return () => {
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const activate = useCallback(() => {
    const updateSW = updateSWRef.current;
    if (!updateSW) return;
    // Reload (true) activates the waiting SW and refreshes to the new version.
    void updateSW(true);
  }, []);

  const handleReload = useCallback(() => {
    // Guard: never activate a new SW while a write is in flight — that could swap assets
    // mid-sync and drop queued writes (RESEARCH Pitfall 7).
    if (!isWriteInFlight()) {
      activate();
      return;
    }
    // A sync is mid-flight: show "Finishing sync…" and wait for it to drain, then proceed.
    setFinishingSync(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (!isWriteInFlight()) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setFinishingSync(false);
        activate();
      }
    }, POLL_MS);
  }, [activate]);

  const handleLater = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setFinishingSync(false);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
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
        A new version is ready.
      </div>
      <div style={{ fontSize: 14, color: INK_MUTED, marginBottom: 12 }}>
        {finishingSync ? 'Finishing sync…' : 'Reload to update.'}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleLater}
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
          Later
        </button>
        <button
          type="button"
          onClick={handleReload}
          disabled={finishingSync}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: 'none',
            background: AMBER,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: finishingSync ? 'progress' : 'pointer',
            opacity: finishingSync ? 0.7 : 1,
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
