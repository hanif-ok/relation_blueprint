// Silent on-load Drive re-acquire (GAP 2 — drive-reconnect-on-refresh).
//
// Proves the new `restore()` path that re-establishes the Drive session across reloads WITHOUT a
// popup and WITHOUT persisting the token. Three behaviours, mirroring the diagnosis:
//   - SUCCESS: a silent GIS grant drives the store to connected (markConnected, error null) with
//     no user gesture, and calls onConnected with the ensured folder id.
//   - QUIET FAILURE: no active grant -> the store stays at the benign not-connected default
//     (error===null, needsReconnect===false, connected===false). No scary error/reconnect pill.
//   - SECURITY (token-never-persisted on the silent path, T-01-10-01): after a successful silent
//     restore NOTHING token-bearing lands in localStorage and indexedDB.open is never called —
//     re-confirming the auth.test.ts invariant (T-06-01) on the new on-load code path.
//
// The GIS global is a hand-written fake (same shape as tests/storage/auth.test.ts); the active
// StorageProvider is mocked to an InMemoryProvider so ensureFolder resolves without live Drive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GisTokenClientConfig, GisTokenResponse } from '@/storage/drive/gis';
import { InMemoryProvider } from '@/storage/memory/InMemoryProvider';

// ---- active-provider seam: restore() calls getActiveProvider().ensureFolder() ---------------
// Mock the factory so the silent-restore success path resolves a real folder id from an
// InMemoryProvider instead of hitting the live DriveProvider (which would require a network/token).
const memProvider = new InMemoryProvider();
vi.mock('@/storage/providerFactory', () => ({
  getActiveProvider: () => memProvider,
}));

// ---- GIS fake (mirrors tests/storage/auth.test.ts) -----------------------------------------

interface FakeGis {
  lastConfig: GisTokenClientConfig | null;
  revokedTokens: string[];
  /** What the next requestAccessToken hands the callback on a successful silent grant. */
  nextResponse: GisTokenResponse;
  /** When set, requestAccessToken drives error_callback instead (no active grant). */
  nextError: { type?: string; message?: string } | null;
}

function installGisFake(): FakeGis {
  const state: FakeGis = {
    lastConfig: null,
    revokedTokens: [],
    nextResponse: { access_token: 'tok-silent', expires_in: 3599 },
    nextError: null,
  };
  (globalThis as unknown as { window: Window }).window = globalThis as unknown as Window;
  (globalThis as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient(config: GisTokenClientConfig) {
          state.lastConfig = config;
          return {
            requestAccessToken() {
              if (state.nextError) config.error_callback?.(state.nextError);
              else config.callback(state.nextResponse);
            },
          };
        },
        revoke(token: string, done?: () => void) {
          state.revokedTokens.push(token);
          done?.();
        },
      },
    },
  };
  return state;
}

// isConfigured() must be true so restore() does not early-return.
vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');

let gis: FakeGis;

beforeEach(async () => {
  const { __resetForTests: resetAuth } = await import('@/storage/drive/auth');
  const { __resetForTests: resetStatus } = await import('@/features/connect/syncStatusStore');
  resetAuth();
  resetStatus();
  localStorage.clear();
  gis = installGisFake();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useConnectDrive.restore() — silent on-load re-acquire (GAP 2)', () => {
  it('SUCCESS: silently reconnects without a gesture (connected, error null) and calls onConnected', async () => {
    const { useConnectDrive } = await import('@/features/connect/ConnectDrive');
    const { getSnapshot } = await import('@/features/connect/syncStatusStore');
    gis.nextResponse = { access_token: 'tok-silent', expires_in: 3599 };
    const onConnected = vi.fn();

    const { result } = renderHook(() => useConnectDrive({ onConnected }));
    await act(async () => {
      result.current.restore();
    });

    const snap = getSnapshot();
    expect(snap.connected).toBe(true);
    expect(snap.error).toBeNull();
    expect(snap.needsReconnect).toBe(false);
    // The silent grant requested prompt:'none' (hidden-iframe re-grant; no consent popup).
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(typeof onConnected.mock.calls[0][0]).toBe('string');
  });

  it('QUIET FAILURE: no active grant leaves not-connected with NO error/reconnect pill', async () => {
    const { useConnectDrive } = await import('@/features/connect/ConnectDrive');
    const { getSnapshot } = await import('@/features/connect/syncStatusStore');
    // No active grant -> GIS drives error_callback; restore() must swallow it silently.
    gis.nextError = { type: 'no_session', message: 'no active session' };
    const onConnected = vi.fn();

    const { result } = renderHook(() => useConnectDrive({ onConnected }));
    await act(async () => {
      result.current.restore();
    });

    const snap = getSnapshot();
    expect(snap.connected).toBe(false);
    expect(snap.error).toBeNull();
    expect(snap.needsReconnect).toBe(false);
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('SECURITY: a successful silent restore persists NOTHING (no localStorage, indexedDB.open not called) — T-01-10-01', async () => {
    const { useConnectDrive } = await import('@/features/connect/ConnectDrive');
    const openSpy = vi.spyOn(indexedDB, 'open');
    gis.nextResponse = { access_token: 'tok-silent', expires_in: 3599 };

    const { result } = renderHook(() => useConnectDrive({ onConnected: vi.fn() }));
    await act(async () => {
      result.current.restore();
    });

    // The token must never be persisted on the silent on-load path.
    expect(openSpy).not.toHaveBeenCalled();
    const dump = Object.keys(localStorage)
      .map((k) => `${k}=${localStorage.getItem(k)}`)
      .join('|');
    expect(dump).not.toContain('tok-silent');
    expect(localStorage.length).toBe(0);
    openSpy.mockRestore();
  });
});
