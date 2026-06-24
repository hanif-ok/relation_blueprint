---
phase: 01-storage-spine-first-person-on-a-map
reviewed: 2026-06-25T00:00:00Z
depth: standard
files_reviewed: 73
files_reviewed_list:
  - .github/workflows/deploy.yml
  - e2e/drive-connect.spec.ts
  - e2e/map-create.spec.ts
  - e2e/marker.spec.ts
  - e2e/profile.spec.ts
  - e2e/pwa-install.spec.ts
  - src/app/App.module.css
  - src/app/App.tsx
  - src/app/pwa.ts
  - src/app/tokens.css
  - src/app/tokens.ts
  - src/db/media.ts
  - src/db/repository.ts
  - src/db/schema.ts
  - src/db/testBridge.ts
  - src/domain/schemas.ts
  - src/domain/types.ts
  - src/features/backup/BackupMenu.module.css
  - src/features/backup/BackupMenu.tsx
  - src/features/backup/base64.ts
  - src/features/backup/exportDb.ts
  - src/features/backup/importDb.ts
  - src/features/common/ConfirmDialog.tsx
  - src/features/connect/ConnectDrive.tsx
  - src/features/connect/ReconnectBanner.module.css
  - src/features/connect/ReconnectBanner.tsx
  - src/features/connect/StatusPill.module.css
  - src/features/connect/StatusPill.tsx
  - src/features/connect/syncStatusStore.ts
  - src/features/connect/useSyncStatus.ts
  - src/features/person-form/PersonForm.tsx
  - src/features/person-form/PhotoUpload.module.css
  - src/features/person-form/PhotoUpload.tsx
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/MapView.tsx
  - src/features/person-map/useMapImage.ts
  - src/features/profile/PhotoGallery.module.css
  - src/features/profile/PhotoGallery.tsx
  - src/features/profile/ProfileSidebar.tsx
  - src/features/pwa/InstallPrompt.tsx
  - src/features/pwa/UpdateToast.tsx
  - src/features/pwa/usePersistentStorage.ts
  - src/main.tsx
  - src/media/mediaManager.ts
  - src/media/thumbnails.ts
  - src/storage/StorageProvider.ts
  - src/storage/drive/DriveProvider.ts
  - src/storage/drive/auth.ts
  - src/storage/drive/driveRest.ts
  - src/storage/drive/gis.d.ts
  - src/storage/memory/InMemoryProvider.ts
  - src/storage/providerFactory.ts
  - src/sync/manifest.ts
  - src/sync/serializer.ts
  - src/sync/syncEngine.ts
  - src/sync/writeStatus.ts
  - src/vite-env.d.ts
  - tests/_fakes/InMemoryProvider.test.ts
  - tests/_fakes/faultInjectingProvider.ts
  - tests/_fixtures/generateDbFixture.ts
  - tests/backup/export.test.ts
  - tests/backup/roundtrip.test.ts
  - tests/db/repository.crud.test.ts
  - tests/db/repository.offline.test.ts
  - tests/domain/person.test.ts
  - tests/media/mediaManager.test.ts
  - tests/media/thumbnails.test.ts
  - tests/pwa/persistence.test.ts
  - tests/setup.ts
  - tests/storage/auth.test.ts
  - tests/storage/driveProvider.contract.test.ts
  - tests/sync/_memoryPort.ts
  - tests/sync/atomicity.test.ts
  - tests/sync/reconcile.test.ts
  - tests/sync/serializer.test.ts
findings:
  critical: 2
  warning: 7
  info: 5
  total: 14
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 73
**Status:** issues_found

## Summary

The storage spine is well-structured and the atomic-commit design (immutable shards + single
manifest overwrite) is genuinely sound — the failure-injection property test (`atomicity.test.ts`)
proves the durable DB cannot be corrupted by an interrupted commit, and that property holds up
under reading. The provider seam, zod validation at every untrusted boundary, in-memory-only
token handling, and the export/restore round-trip are all carefully done.

However, adversarial tracing surfaced two correctness defects that can silently lose user data —
both are *outside* the narrow window the atomicity test exercises, because the test uses a frozen
in-memory snapshot and never mutates the repository concurrently with a commit. The most serious
(`CR-01`) is a dirty-flag clearing race in the production Dexie port that drops edits made during
an in-flight push. `CR-02` is a media-GC gap that, combined with content-addressed dedupe, can
make a newly-needed blob un-restorable after it was previously deleted. The remaining findings are
robustness and quality issues.

## Critical Issues

### CR-01: `markSynced` clears the dirty flag on records edited *during* an in-flight push — silent edit loss

**File:** `src/sync/syncEngine.ts:131-184` (commit) and `src/sync/syncEngine.ts:282-297` (`markSynced`)
**Issue:**
`commit()` snapshots the entity set once at the start (`getEntities()`, line 136), serializes and
uploads that snapshot, then after the manifest commit calls `repo.markSynced()` (line 173). The
production `markSynced` clears `dirty` on **every record that is currently dirty** at the moment it
runs:

```ts
await db.people.filter((p) => p.dirty).modify({ dirty: false });
```

A push is asynchronous and debounced (`useSyncEngine` debounces 800ms then awaits network I/O).
If the user edits a person *after* the `getEntities()` snapshot but *before* `markSynced()` runs,
`updatePerson` sets that record `dirty = true` with new content that was **never uploaded** in this
commit's shard. `markSynced` then clears its dirty flag, so the next `getDirtyTypes()` no longer
reports it. The edit is now absent from the cloud and will never be pushed — last-write *loss*,
not last-write-wins. Because the cloud is the only durable copy (v1), an eviction or device change
after this loses the edit permanently.

The atomicity/reconcile tests do not catch this: `_memoryPort.markSynced` clears the same frozen
`set` that was serialized, and no test mutates the repo mid-commit.

**Fix:** Only clear the dirty flag on records whose content was actually serialized in this commit.
Capture the per-record identity+`updatedAt` of the snapshot and clear dirty only where it still
matches (an intervening edit bumps `updatedAt`, so it stays dirty):

```ts
// in commit(): pass the snapshot the shards were built from
await this.repo.markSynced(entities);

// Dexie port:
async markSynced(synced: EntitySet): Promise<void> {
  await db.transaction('rw', db.people, db.maps, db.markers, db.meta, async () => {
    for (const p of synced.people) {
      const cur = await db.people.get(p.id);
      if (cur && cur.dirty && cur.updatedAt === p.updatedAt) {
        await db.people.update(p.id, { dirty: false });
      }
    }
    // ...same for maps, markers...
  });
}
```

(Apply the same `updatedAt`-guarded clear to maps and markers.)

### CR-02: Content-addressed media is never GC'd, but a re-added blob can be permanently unrecoverable after delete

**File:** `src/sync/syncEngine.ts:267-297` (`getNewMedia` / `markSynced` synced-hash watermark); `src/db/repository.ts:84-91` (`deletePerson`)
**Issue:**
`getNewMedia` skips any hash already in the `syncedMediaHashes` watermark (line 276). The watermark
is only ever **added to** (union in `markSynced`, line 290-295) and never pruned. Consider:

1. A photo with hash `H` is stored, pushed → `H` recorded in `syncedMediaHashes`, `media/H` exists in Drive.
2. The user removes that photo / deletes the person. Nothing deletes the local `media` row or the
   cloud `media/H` today (no media GC exists), so this case is currently latent — **but** it becomes
   live the moment any media cleanup is added, and the local `media` row *can* already be cleared by
   a `Restore backup` (`importDb` does `db.media.clear()` then `bulkPut` only the bundle's media).
3. After a restore that reintroduces an entity referencing `H` whose blob is present locally, but
   `syncedMediaHashes` (in `meta`) was **also** wiped/кept inconsistently: `meta` is NOT cleared by
   `importDb` (it clears people/maps/markers/media only). So `syncedMediaHashes` still claims `H` is
   synced while the cloud may or may not have it — `getNewMedia` will skip re-uploading `H`, leaving
   the cloud shard referencing a `media/H` that no device will ever re-push.

The root defect: the "already synced" decision trusts a local watermark that can diverge from actual
cloud contents (a failed/partial media upload, a restore, a provider switch in Phase 6). Because the
commit uploads shards and media **non-atomically** (media in step 2, shard pointers in step 4), a
media upload that throws after the watermark logic — or simply a watermark that says "synced" when
the blob isn't actually in the cloud — yields a manifest pointing at entities whose `media/<hash>`
does not exist, which is unrecoverable corruption of the photo set.

**Fix:** Do not trust a write-only local watermark as proof of cloud state. Either (a) derive
"needs upload" from the actual cloud `media/` listing (`provider.list(mediaFolder)`) intersected
against referenced hashes, or (b) make the watermark transactional with media presence and reset/
revalidate it on `importDb` and on provider switch. At minimum, `importDb` must clear or
reconcile the `syncedMediaHashes` meta row so a restore can re-push media:

```ts
// importDb STEP 2 transaction — include db.meta and drop the stale media watermark
await db.transaction('rw', db.people, db.maps, db.markers, db.media, db.meta, async () => {
  // ...clear + bulkPut...
  await db.meta.delete('syncedMediaHashes');
});
```

## Warnings

### WR-01: `installTestBridge()` ships in the production bundle and exposes mutable DB write APIs on `window.__rb`

**File:** `src/main.tsx:15,18`; `src/db/testBridge.ts:66-89`
**Issue:** `main.tsx` calls `installTestBridge()` unconditionally, attaching `createPerson`,
`updatePerson`, `deletePerson`, `createMap`, `storeMedia`, and the full `db` handle to
`window.__rb` in every production build. The header comment claims it exposes "only data helpers
(no network, no secrets)", but it hands any script on the page (including a future XSS or a
malicious bookmarklet) full read/write/delete over the user's entire local database. This widens
the blast radius of any DOM-injection bug well beyond what the CSP/escaping defenses (T-03-01)
assume, and it is dead weight in the shipped bundle.
**Fix:** Gate the bridge on a build-time flag so it is tree-shaken out of production:

```ts
if (import.meta.env.VITE_E2E === 'true') installTestBridge();
```

Build the E2E preview with `VITE_E2E=true`; ship production without it.

### WR-02: `deletePerson` orphans the person's media blobs (local and cloud) forever

**File:** `src/db/repository.ts:84-91`
**Issue:** `deletePerson` cascades to markers but never touches `db.media`. The person's `photo`
and `gallery` blobs remain in IndexedDB and (after the next push) in Drive indefinitely. Given the
explicit "degrade gracefully from dozens to thousands" scale constraint and the Drive free-tier
quota, unbounded media accumulation is a real growth bug, not just untidiness. (Deleting them
naively is also wrong because content-addressed blobs may be shared — see CR-02; a correct fix
needs refcounting.)
**Fix:** Track media references (or run a mark-and-sweep against all entity `MediaRef`s) and delete
a blob only when no remaining entity references its hash. Defer the cloud-side sweep to the sync
engine so it stays atomic with a manifest commit.

### WR-03: `manifest.backups` array is written but never populated, diverging from the actual backup files

**File:** `src/sync/syncEngine.ts:163` (`backups: current.backups`); `src/sync/manifest.ts:39-65`
**Issue:** The manifest carries a `backups: string[]` field (typed as backup file ids, "newest
last"), but `commit()` always copies `current.backups` forward and nothing ever appends to it.
The real backups are discovered by *listing* the `backups/` folder in `rollBackups`. So the
manifest field is permanently `[]` while real backups exist — a contract the schema advertises but
the code never honors. A future recovery path that trusts `manifest.backups` to find a fallback
will find nothing.
**Fix:** Either populate `next.backups` with the backup file id/name produced in
`writeManifestWithBackup` (and trim it in lockstep with `rollBackups`), or remove the field from
the manifest type/schema and rely solely on the folder listing. Do not keep a dead, misleading
field in the trusted index.

### WR-04: `createFile` omits `mimeType` from Drive metadata; Drive may guess the wrong type for shards/media

**File:** `src/storage/drive/driveRest.ts:104,108-116`
**Issue:** The multipart metadata part is `{ name, parents }` only — `mimeType` is never set on the
file resource. The `Content-Type` header on the *media* part is honored for storage bytes, but
Drive sets the file's `mimeType` by sniffing/guessing when metadata omits it. A `.json` shard or a
`media/<hash>` blob (whose name has no extension) can be assigned an unexpected `mimeType`, which
then surfaces through `stat`/`list` (`DriveProvider.toEntry` reads `mimeType`) and could affect
future filtering or content-disposition. The contract test does not catch this because its fake
defaults `mimeType` to `application/octet-stream`.
**Fix:** Include the content type in the metadata part:

```ts
const metadata = JSON.stringify({ name, parents: [parentId], mimeType: contentType });
```

### WR-05: `connect()` swallows the distinction between "user cancelled" and "real error", always showing Reconnect

**File:** `src/features/connect/ConnectDrive.tsx:55-64`
**Issue:** `runConnect` wraps the entire connect+ensureFolder flow in one `catch` that always calls
`markNeedsReconnect()`. But failures here include genuine errors that are *not* auth-expiry: a
Drive `ensureFolder` REST 500, a network failure, or a non-`TokenExpiredError` thrown by
`driveConnect`. All of them render as "Reconnect required", which is misleading and, for a
persistent server error, sends the user into a Reconnect loop that re-pops consent without
addressing the actual fault. The `error` pill state exists (`markError`) but is unreachable from
this path.
**Fix:** Inspect the error: route `TokenExpiredError`/popup-cancel to `markNeedsReconnect()`, and
route other errors to `markError(err.message)` so the UI distinguishes "click to reconnect" from
"something went wrong".

### WR-06: `MapView` accepts a corrupt/oversized image type only by `file.type`, which is trivially wrong and can bypass the size cap path

**File:** `src/features/person-map/MapView.tsx:80-93`
**Issue:** Upload validation gates on `file.type` (the browser-reported MIME) and `file.size`. A
file with a spoofed/empty `type` that *is* a valid huge image, or a `.png`-typed file that is
actually a 200MB payload, passes type validation; the size check is the only real guard and it is
fine — but `decodeDimensions` then decodes the full image in the main thread before any further
guard. More importantly, the same upload path in `PhotoUpload`/`storeMedia` (`mediaManager`) caps
gallery images, but the **map background** goes through `db/media.ts:storeMedia` (the *other*
`storeMedia`), which does **no resize/cap at all** — a 25MB background is stored raw, defeating the
quota-friendly intent that `thumbnails.capGalleryImage` exists for. The two same-named `storeMedia`
functions (`src/db/media.ts` vs `src/media/mediaManager.ts`) with different behavior is itself a
trap.
**Fix:** Route the map background through the capping pipeline (or a dedicated map-cap), and rename
one of the two `storeMedia` exports so the no-resize raw path can't be selected by accident.

### WR-07: `rollBackups` deletes backups *after* deleting orphan shards but before they are unreferenced safety nets — and a delete failure is swallowed by the `finally` only for `endWrite`

**File:** `src/sync/syncEngine.ts:172-183`
**Issue:** Post-commit, step 5 runs `markSynced` → `setShardMeta` (×N) → `rollBackups` → delete
orphans, all *outside* any transaction and each `await`ed sequentially. If `rollBackups` or an
orphan `delete` throws (e.g. a 401 right after the commit), the function throws out of `commit`,
`push` rejects, and `useSyncEngine.runPush` marks an error — even though the commit *succeeded*.
The user sees a sync *failure* for a sync that actually committed, and `markSynced` may or may not
have run depending on where it threw, leaving dirty flags inconsistent with the cloud. The comment
on line 170 says "Failures below are recoverable" but the code does not actually make them
non-fatal.
**Fix:** Wrap the post-commit cleanup (markSynced is required; GC/rollBackups are best-effort) so
that GC/backup-trim failures are caught and logged without failing the push, and ensure
`markSynced` completes (it is the part that must succeed) before best-effort cleanup:

```ts
await this.repo.markSynced(entities);
for (const type of dirtyTypes) await this.repo.setShardMeta(type, now);
try {
  await rollBackups(this.provider, this.folderId, BACKUP_KEEP);
  for (const id of orphans) await this.provider.delete(id);
} catch (e) {
  console.warn('post-commit GC failed (commit already durable)', e);
}
```

## Info

### IN-01: `expires_in` fallback magic number `3599` duplicated

**File:** `src/storage/drive/auth.ts:108`
**Issue:** `const expiresIn = typeof resp.expires_in === 'number' ? resp.expires_in : 3599;` hard-codes
3599 here and again in test fakes. A named constant (`DEFAULT_TOKEN_TTL_S`) documents intent.
**Fix:** Extract `const DEFAULT_TOKEN_TTL_S = 3599;` and reference it.

### IN-02: `PhotoUpload.handleGallery` uses a comma-operator side effect inside `filter` for dedupe

**File:** `src/features/person-form/PhotoUpload.tsx:99`
**Issue:** `refs.filter((r) => !seen.has(r.hash) && (seen.add(r.hash), true))` mutates `seen` inside
a `filter` predicate via a comma operator. It works but is a known readability trap (ESLint
`no-sequences` flags it).
**Fix:** Use an explicit loop or build the addition set first, then filter.

### IN-03: `decodeDimensions` in `MapView` duplicates dimension logic that `mediaManager` already owns

**File:** `src/features/person-map/MapView.tsx:34-49` vs `src/media/mediaManager.ts:45-57`
**Issue:** Two separate intrinsic-dimension decoders exist (`new Image()` here, `createImageBitmap`
there). Divergent decode paths can disagree on EXIF-rotated images.
**Fix:** Consolidate on one decode utility.

### IN-04: `useSyncStatus` registers a process-global `onExpiry` listener per hook instance

**File:** `src/features/connect/useSyncStatus.ts:59-63`
**Issue:** Every component using `useSyncStatus` adds its own `onExpiry` subscription that all call
the same global `markNeedsReconnect()`. Harmless (idempotent set merge) but if the hook is used in
multiple mounted components the expiry transition fires the store update N times.
**Fix:** Subscribe once at app root, or dedupe; minor.

### IN-05: `SyncQueueRecord` table is defined but unused

**File:** `src/db/schema.ts:33-38,57`
**Issue:** The `syncQueue` table (and its interface) is declared and indexed but nothing in the
reviewed code reads or writes it — the sync engine drives off `dirty` flags + shard watermarks
instead. Dead schema surface that suggests an abandoned design.
**Fix:** Remove it, or add a comment marking it as a reserved Phase-2 seam (consistent with how
`-000` shard suffixes are documented as reserved).

---

_Reviewed: 2026-06-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
