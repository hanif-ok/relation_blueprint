/**
 * In-flight-write signal — the seam the PWA update flow reads to decide whether it is
 * safe to activate a waiting service worker (RESEARCH ## Pattern 4 / Pitfall 7).
 *
 * Plan 08 (PWA shell) runs in wave 3 ahead of Plan 05 (the atomic sync engine), so the
 * sync engine does not exist yet. This module is the stable accessor that Plan 05's
 * `syncEngine` MUST drive: while a Drive push/manifest-swap is in progress it should call
 * `beginWrite()` / `endWrite()` (or set the count) so that `isWriteInFlight()` returns
 * `true`. A blind `updateSW(true)` mid-write could swap assets under an in-flight sync and
 * drop queued writes — `UpdateToast` gates the reload on `isWriteInFlight()`.
 *
 * Until Plan 05 wires this, `isWriteInFlight()` always returns `false`, which is the
 * correct conservative default for the skeleton: there is no sync engine, therefore no
 * write can be in flight, therefore an update may proceed immediately.
 */

let inFlightCount = 0;

/** Mark that a cloud write (shard upload / manifest swap) has started. */
export function beginWrite(): void {
  inFlightCount += 1;
}

/** Mark that a cloud write has finished (success or failure). */
export function endWrite(): void {
  inFlightCount = Math.max(0, inFlightCount - 1);
}

/** True while at least one cloud write is in progress. The SW update guard reads this. */
export function isWriteInFlight(): boolean {
  return inFlightCount > 0;
}

/** Test/diagnostic helper: reset the counter to a known state. */
export function __resetWriteStatus(): void {
  inFlightCount = 0;
}
