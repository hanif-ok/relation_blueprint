// StatusPill (UI-SPEC S9) — the compact Drive connection/sync indicator in the top bar.
//
// Renders a dot + label per the semantic-states table. Actionable states (Not-connected,
// Reconnect, Error) are buttons that fire `onAction`; informational states (Synced/Syncing/
// Offline) are still focusable and carry a mono "synced 2m ago" tooltip. The dot colors come
// straight from the UI-SPEC ## Color semantic table.

import type { SyncPhase } from './syncStatusStore';
import styles from './StatusPill.module.css';

interface PillSpec {
  label: string;
  /** Whether clicking the pill triggers the connect/reconnect/retry flow. */
  actionable: boolean;
}

// UI-SPEC ## Color semantic sync states table — label text is verbatim.
const SPEC: Record<SyncPhase, PillSpec> = {
  synced: { label: 'Drive · Synced', actionable: false },
  syncing: { label: 'Drive · Syncing…', actionable: false },
  offline: { label: 'Offline · changes saved locally', actionable: false },
  reconnect: { label: 'Drive · Reconnect', actionable: true },
  error: { label: 'Sync failed · Retry', actionable: true },
  'not-connected': { label: 'Connect Drive', actionable: true },
};

function relativeTime(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return `synced ${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `synced ${mins}m ago`;
  return `synced ${Math.round(mins / 60)}h ago`;
}

export interface StatusPillProps {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  /** Fired when an actionable pill is clicked (connect / reconnect / retry). */
  onAction: () => void;
}

export function StatusPill({ phase, lastSyncedAt, onAction }: StatusPillProps) {
  const spec = SPEC[phase];
  const tooltip = lastSyncedAt && !spec.actionable ? relativeTime(lastSyncedAt) : undefined;

  const content = (
    <>
      <span className={`${styles.dot} ${styles[phase]}`} aria-hidden="true" />
      <span className={styles.label}>{spec.label}</span>
    </>
  );

  if (spec.actionable) {
    return (
      <button
        type="button"
        className={`${styles.pill} ${styles.actionable}`}
        data-testid="status-pill"
        data-phase={phase}
        onClick={onAction}
        title={tooltip}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={styles.pill}
      data-testid="status-pill"
      data-phase={phase}
      tabIndex={0}
      role="status"
      title={tooltip}
    >
      {content}
    </span>
  );
}
