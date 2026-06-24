// ConnectDrive — the connect/reconnect/disconnect controller for the Drive backend. It is the
// ONLY place that calls driveAuth.connect()/revoke(), always from a user gesture (RESEARCH
// ## Pattern 1). It exposes a hook (`useConnectDrive`) returning the resolved sync status and
// the gesture handlers, plus a thin `ConnectDrive` component that renders the StatusPill for
// the top bar. App owns layout: it places the pill in the header and the banner under it.
//
// Connect flow (on the Connect/Reconnect/Retry click — all the actionable pill states):
//   1. driveAuth.connect()  — runs the GIS token client on the gesture, acquires a token.
//   2. ensure the VISIBLE "Relation Blueprint" folder exists via the active provider.
//   3. mark connected; App boots the SyncEngine via onConnected(folderId).
//
// When VITE_GOOGLE_CLIENT_ID is unset (SETUP.md not yet done), clicking the pill surfaces a
// clear "OAuth Client ID not configured — see SETUP.md" error state instead of throwing — the
// rest of the app stays fully usable offline (RESEARCH ## Pitfall 4).

import { useCallback } from 'react';
import { connect as driveConnect, isConfigured, revoke as driveRevoke } from '@/storage/drive/auth';
import { getActiveProvider } from '@/storage/providerFactory';
import { StatusPill } from './StatusPill';
import { useSyncStatus, type SyncStatus } from './useSyncStatus';
import {
  markConnected,
  markDisconnected,
  markError,
  markNeedsReconnect,
} from './syncStatusStore';

/** The visible app-data folder name (SETUP.md / STOR-01). */
export const APP_FOLDER_NAME = 'Relation Blueprint';

export interface UseConnectDriveOptions {
  /** Called after a successful connect with the ensured app-folder id (App boots the SyncEngine). */
  onConnected?: (folderId: string) => void;
  /** Called on disconnect so App can tear down its sync loop. */
  onDisconnected?: () => void;
}

export interface ConnectDriveApi {
  status: SyncStatus;
  /** Run the connect/reconnect/retry flow (must be called from a user gesture). */
  connect: () => void;
  /** Revoke the token and reset the connection state. */
  disconnect: () => void;
}

export function useConnectDrive(options: UseConnectDriveOptions = {}): ConnectDriveApi {
  const { onConnected, onDisconnected } = options;
  const status = useSyncStatus();

  const runConnect = useCallback(async () => {
    if (!isConfigured()) {
      markError('OAuth Client ID not configured — see SETUP.md');
      return;
    }
    try {
      await driveConnect();
      const provider = getActiveProvider();
      const folderId = await provider.ensureFolder(APP_FOLDER_NAME);
      markConnected();
      onConnected?.(folderId);
    } catch {
      // A cancelled popup / failed grant is non-fatal — surface as needs-reconnect, stay usable.
      markNeedsReconnect();
    }
  }, [onConnected]);

  const connect = useCallback(() => {
    void runConnect();
  }, [runConnect]);

  const disconnect = useCallback(() => {
    void (async () => {
      await driveRevoke();
      markDisconnected();
      onDisconnected?.();
    })();
  }, [onDisconnected]);

  return { status, connect, disconnect };
}

export interface ConnectDriveProps {
  status: SyncStatus;
  onAction: () => void;
}

/** The top-bar status pill bound to the connect flow. */
export function ConnectDrive({ status, onAction }: ConnectDriveProps) {
  return <StatusPill phase={status.phase} lastSyncedAt={status.lastSyncedAt} onAction={onAction} />;
}
