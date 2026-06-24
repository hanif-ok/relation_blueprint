import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentStorage } from '@/features/pwa/usePersistentStorage';

/**
 * STOR-06 — persistent-storage request after a user action (RESEARCH Pitfall 5).
 *
 * Asserts the hook:
 *   - calls navigator.storage.persist() when its action runs (not on mount),
 *   - surfaces granted=true with no warning when persistence is granted,
 *   - surfaces granted=false + the eviction warning when persistence is denied,
 *   - degrades gracefully when the Storage API is unavailable,
 *   - handles a QuotaExceededError without throwing.
 */

const EVICTION_WARNING =
  'Your device may clear offline data when storage is low. Export backups regularly.';

function stubStorage(persistImpl: () => Promise<boolean>, estimateUsage = 1024, estimateQuota = 1_000_000) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      persist: vi.fn(persistImpl),
      estimate: vi.fn(async () => ({ usage: estimateUsage, quota: estimateQuota })),
    },
  });
  return navigator.storage.persist as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  // Remove the stubbed storage between tests so each starts clean.
  Reflect.deleteProperty(navigator, 'storage');
  vi.restoreAllMocks();
});

describe('usePersistentStorage', () => {
  it('does not call persist() on mount — only on the action', () => {
    const persist = stubStorage(async () => true);
    renderHook(() => usePersistentStorage());
    expect(persist).not.toHaveBeenCalled();
  });

  it('calls persist() on the user action and surfaces granted=true with no warning', async () => {
    const persist = stubStorage(async () => true);
    const { result } = renderHook(() => usePersistentStorage());

    expect(result.current.granted).toBeNull();

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.requestPersistence();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(returned).toBe(true);
    expect(result.current.granted).toBe(true);
    expect(result.current.warning).toBeNull();
    expect(result.current.estimate).toEqual({ usage: 1024, quota: 1_000_000 });
  });

  it('surfaces the eviction warning when persistence is denied', async () => {
    const persist = stubStorage(async () => false);
    const { result } = renderHook(() => usePersistentStorage());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.requestPersistence();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(returned).toBe(false);
    expect(result.current.granted).toBe(false);
    expect(result.current.warning).toBe(EVICTION_WARNING);
  });

  it('degrades gracefully when the Storage API is unavailable', async () => {
    // No navigator.storage defined at all.
    Reflect.deleteProperty(navigator, 'storage');
    const { result } = renderHook(() => usePersistentStorage());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.requestPersistence();
    });

    expect(returned).toBe(false);
    expect(result.current.granted).toBe(false);
    expect(result.current.warning).toBe(EVICTION_WARNING);
  });

  it('handles QuotaExceededError without throwing', async () => {
    const quotaError = new DOMException('quota', 'QuotaExceededError');
    const persist = stubStorage(async () => {
      throw quotaError;
    });
    const { result } = renderHook(() => usePersistentStorage());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.requestPersistence();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(returned).toBe(false);
    expect(result.current.granted).toBe(false);
    expect(result.current.warning).toBe(EVICTION_WARNING);
  });
});
