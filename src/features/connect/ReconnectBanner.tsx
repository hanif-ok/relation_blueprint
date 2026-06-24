// ReconnectBanner (UI-SPEC S8) — the non-destructive "reconnect to Drive" banner.
//
// Appears directly under the top bar on token expiry / 401 (driveAuth.onExpiry sets
// needsReconnect in the store). It NEVER blocks the app: the map, profiles, and `+ Person`
// stay fully usable offline; writes queue to Dexie. The "Reconnect" button re-runs the GIS
// token request ON THE USER'S CLICK — the required user gesture (RESEARCH ## Pattern 1 /
// ## Pitfall 4: never auto-pop consent mid-write). Dismissible; it reappears on the next
// failed sync because the underlying needsReconnect flag is still set.

import { useState } from 'react';
import styles from './ReconnectBanner.module.css';

export interface ReconnectBannerProps {
  /** True when the token has expired / a 401 occurred and a reconnect is pending. */
  visible: boolean;
  /** Re-run the GIS token request. MUST be invoked from this button's onClick (user gesture). */
  onReconnect: () => void;
}

export function ReconnectBanner({ visible, onReconnect }: ReconnectBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Reset the local dismissal whenever the banner is re-shown by a fresh expiry.
  if (!visible && dismissed) setDismissed(false);
  if (!visible || dismissed) return null;

  return (
    <div className={styles.banner} role="status" data-testid="reconnect-banner">
      <span className={styles.message}>
        Drive needs to reconnect to sync your changes. Your work is saved locally.
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.reconnect}
          data-testid="reconnect-button"
          onClick={onReconnect}
        >
          Reconnect
        </button>
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
