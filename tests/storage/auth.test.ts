// driveAuth lifecycle tests (RESEARCH ## Pattern 1, threat T-06-01/02/03).
//
// These prove the security-critical token rules WITHOUT a live Google credential:
//   - after connect(), NOTHING lands in localStorage or IndexedDB (token is memory-only)
//   - getValidToken() returns null inside the 60s expiry skew
//   - revoke() clears the in-memory token and calls GIS revoke
//   - the token client requests drive.file and NO other scope
// The GIS global is a hand-written fake; no popup, no network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTests,
  connect,
  DRIVE_FILE_SCOPE,
  getValidToken,
  isConnected,
  onExpiry,
  revoke,
} from '@/storage/drive/auth';
import type { GisTokenClientConfig, GisTokenResponse } from '@/storage/drive/gis';

// ---- GIS fake ------------------------------------------------------------------------------

interface FakeGis {
  lastConfig: GisTokenClientConfig | null;
  revokedTokens: string[];
  /** What the next requestAccessToken should hand the callback. */
  nextResponse: GisTokenResponse;
  /** When set, drive error_callback instead of callback. */
  nextError: { type?: string; message?: string } | null;
}

function installGisFake(): FakeGis {
  const state: FakeGis = {
    lastConfig: null,
    revokedTokens: [],
    nextResponse: { access_token: 'tok-abc', expires_in: 3599, scope: DRIVE_FILE_SCOPE },
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

// VITE_GOOGLE_CLIENT_ID must be present for connect() to build the client.
vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');

let gis: FakeGis;

beforeEach(() => {
  __resetForTests();
  localStorage.clear();
  gis = installGisFake();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('driveAuth — token lifecycle (in-memory only)', () => {
  it('requests ONLY the drive.file scope and the configured client id', async () => {
    await connect();
    expect(gis.lastConfig?.scope).toBe('https://www.googleapis.com/auth/drive.file');
    // Guard against accidental broad scope / appDataFolder creeping in.
    expect(gis.lastConfig?.scope).not.toMatch(/auth\/drive($|[^.])/);
    expect(gis.lastConfig?.scope).not.toContain('appdata');
    expect(gis.lastConfig?.client_id).toBe('test-client-id.apps.googleusercontent.com');
  });

  it('connect() stores the token in memory and getValidToken() returns it', async () => {
    const value = await connect();
    expect(value).toBe('tok-abc');
    expect(getValidToken()).toBe('tok-abc');
    expect(isConnected()).toBe(true);
  });

  it('NEVER persists the token to localStorage after connect (T-06-01)', async () => {
    await connect();
    // Scan every localStorage entry for the token value — nothing may leak.
    const dump = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('|');
    expect(dump).not.toContain('tok-abc');
    expect(localStorage.length).toBe(0);
  });

  it('NEVER opens an IndexedDB database to persist the token', async () => {
    const openSpy = vi.spyOn(indexedDB, 'open');
    await connect();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('getValidToken() returns null within the 60s expiry skew', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00Z'));
    gis.nextResponse = { access_token: 'tok-short', expires_in: 100, scope: DRIVE_FILE_SCOPE };
    await connect();
    expect(getValidToken()).toBe('tok-short');
    // Advance to 50s before expiry — inside the 60s skew -> treated as stale.
    vi.advanceTimersByTime(50_000);
    expect(getValidToken()).toBeNull();
    expect(isConnected()).toBe(false);
  });

  it('revoke() clears the in-memory token AND calls GIS revoke', async () => {
    await connect();
    expect(getValidToken()).toBe('tok-abc');
    await revoke();
    expect(getValidToken()).toBeNull();
    expect(gis.revokedTokens).toContain('tok-abc');
  });

  it('fires onExpiry listeners when the token is dropped via revoke chain', async () => {
    await connect();
    const seen = vi.fn();
    onExpiry(seen);
    // markExpired (used by the REST 401 path) is surfaced indirectly; revoke does not fire
    // onExpiry, so we simulate a 401 by importing markExpired.
    const { markExpired } = await import('@/storage/drive/auth');
    markExpired();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getValidToken()).toBeNull();
  });

  it('rejects connect() with a clear error when the user cancels the popup', async () => {
    gis.nextError = { type: 'popup_closed', message: 'closed' };
    await expect(connect()).rejects.toThrow(/closed|cancel/i);
    expect(getValidToken()).toBeNull();
  });
});
