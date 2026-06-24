# Test Fixtures

Placeholder directory for shared test fixtures. **Nothing lives here yet** — this
directory exists so later plans have a stable home for their fixtures.

## Added in Plan 07 (export/restore round-trip)

- `sample-*.png` — small sample image blobs used to verify that photos survive the
  export → wipe IndexedDB → import round-trip **byte-for-byte** (Pitfall 6 / EXPT-02).
- `generateDbFixture.ts` — generates a deterministic in-memory database (N people +
  maps + markers + photo blobs) for property-style round-trip and atomicity tests.

## Not created here

The `InMemoryProvider` (the fake `StorageProvider`) and the `faultInjectingProvider`
(which throws at Pattern-2 step boundaries for the STOR-05 atomicity test) are **not**
placed in this directory. They are created beside the code they exercise:

- `InMemoryProvider` → Plan 02, with the `StorageProvider` interface it locks.
- `faultInjectingProvider` → Plan 05, with the sync engine it stress-tests.
