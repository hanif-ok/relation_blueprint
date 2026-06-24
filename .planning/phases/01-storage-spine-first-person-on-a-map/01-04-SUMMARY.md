---
phase: 01
plan: 04
subsystem: media
tags: [media, thumbnails, content-addressing, photo-gallery, profile, person-form]
dependency_graph:
  requires: ["01-02", "01-03"]
  provides:
    - "src/media/mediaManager.ts: hashBlob / buildMediaRef / storeMedia / resolveMediaUrl"
    - "src/media/thumbnails.ts: makeThumbnail / capGalleryImage"
    - "PhotoUpload control (avatar + multi-photo gallery) in the person form"
    - "Lazy PhotoGallery grid in the profile sidebar"
  affects: ["01-05"]
tech_stack:
  added: []
  patterns:
    - "Content-addressed media: SHA-256 hex of the PROCESSED bytes is the media key + cloud filename"
    - "Client-side resize via createImageBitmap + OffscreenCanvas + convertToBlob(image/webp)"
    - "Object-URL lifecycle owned by a useMediaUrl hook; revoked on unmount / hash change"
key_files:
  created:
    - src/media/mediaManager.ts
    - src/media/thumbnails.ts
    - src/features/person-form/PhotoUpload.tsx
    - src/features/person-form/PhotoUpload.module.css
    - tests/media/thumbnails.test.ts
    - tests/media/mediaManager.test.ts
  modified:
    - src/features/profile/PhotoGallery.tsx
    - src/features/profile/PhotoGallery.module.css
    - src/features/person-form/PersonForm.tsx
    - e2e/profile.spec.ts
decisions:
  - "Hashing happens AFTER resize/re-encode, so stored bytes and the content hash always match (storeMedia caps/thumbnails first, then hashBlob)"
  - "SHA-256 hex (crypto.subtle) is the content-address algorithm — the contract Plan 05 uses for media/<hash> Drive filenames"
  - "storeMedia(kind): 'avatar' -> 96px square webp thumb; 'gallery' -> longest-edge cap (1600) webp; 'raw' -> store as-is (used by tests + map backgrounds)"
  - "decodeDimensions degrades to undefined dims when createImageBitmap is absent (node) — dims are an optimisation, never a correctness gate"
  - "Marker + profile-header avatar keep resolving via getMedia (useMapImage) — same content-addressed blob store as resolveMediaUrl; no duplicate decode path introduced"
metrics:
  duration_min: 12
  tasks: 2
  files: 10
  completed: 2026-06-24
status: complete
---

# Phase 1 Plan 4: Media Slice (Thumbnails + Content-Addressed Photos) Summary

Client-side thumbnailing (round 96px avatar + capped gallery image via OffscreenCanvas→WebP) feeding a SHA-256 content-addressed blob store that dedupes re-uploads, surfaced as a multi-photo upload control in the person form and a lazy, leak-free photo gallery in the profile sidebar.

## What Was Built

**Task 1 — `src/media/thumbnails.ts` + `src/media/mediaManager.ts` (TDD, commit `bfef33a`)**
- `makeThumbnail(file, size=96)`: centre-crops the source to its largest inscribed square, scales to `size`, encodes WebP @0.8 via `OffscreenCanvas.convertToBlob`.
- `capGalleryImage(file, maxEdge=1600)`: downscales only when the longest edge exceeds the cap (never upscales), preserves aspect, re-encodes WebP.
- `hashBlob` (SHA-256 hex), `buildMediaRef` (hash + mime + best-effort dims), `storeMedia` (resize per `kind`, hash the processed bytes, dedupe via `repository.getMedia` before `repository.putMedia`), `resolveMediaUrl` (object URL, or `null` for an unknown hash).
- 12 unit tests: hash determinism, dedupe to exactly one `media` row, distinct rows for distinct bytes, gallery routing through the resizer before hashing, square WebP dimensions, aspect-preserving cap, no-upscale, `resolveMediaUrl` null path.

**Task 2 — Upload + gallery UI (commit `a13027c`)**
- `PhotoUpload.tsx` (+module CSS): avatar upload (`kind:'avatar'`) sets `Person.photo`; "Add photos" multi-select (`kind:'gallery'`) appends hash-deduped refs to `Person.gallery`; processing shimmer while a thumbnail generates; form stays submittable (photo optional).
- `PhotoGallery.tsx` rewritten from the Plan 03 stub into a real lazy tile grid (paper-shade `radius-md` tiles, gap sm) resolving each `MediaRef` via `resolveMediaUrl`, shimmering while loading, with the `"No photos yet."` empty state.
- `PersonForm` `FormState`/`handleSave` now carry `gallery`; the inline photo block is replaced by `<PhotoUpload>`.
- `e2e/profile.spec.ts` extended: empty-gallery copy in the profile, and a gallery upload (real decodable PNG) rendering a tile in the profile gallery.

## Interface / Contract Notes for Downstream Plans

- **Plan 05 (sync engine):** the media cloud filename is `media/<hash>` where `<hash>` is the **SHA-256 hex of the stored (already-resized) blob bytes** produced by `hashBlob`. Because `storeMedia` hashes after resize, the bytes the sync engine uploads are exactly the bytes that hash to that name — content addressing is end-to-end idempotent and safe to skip re-uploading unchanged photos.
- `storeMedia` is idempotent: identical source bytes → identical `MediaRef` → one `media` row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] React lint: ref-prop name + ref-during-render in PhotoUpload**
- **Found during:** Task 2 (eslint on new files)
- **Issue:** A child prop named `ref` is reserved by React, and `galleryRef.current = gallery` mutated a ref during render (react-hooks/refs).
- **Fix:** Renamed the prop to `photo`; removed the ref entirely and read the `gallery` prop directly in the async append handler.
- **Files modified:** src/features/person-form/PhotoUpload.tsx
- **Commit:** a13027c

**2. [Rule 3 - Blocking] React lint: synchronous setState in effect (useMediaUrl)**
- **Found during:** Task 2
- **Issue:** Clearing the URL with a synchronous `setUrl(null)` in the effect body tripped `react-hooks/set-state-in-effect`.
- **Fix:** Resolve-or-clear is now done through a single async `Promise.resolve(...)` chain so the effect never calls setState synchronously.
- **Files modified:** src/features/person-form/PhotoUpload.tsx
- **Commit:** a13027c

**3. [Rule 1 - Test fixture bug] E2E gallery upload needed a decodable PNG**
- **Found during:** Task 2 (first profile E2E run failed: "The source image could not be decoded.")
- **Issue:** The existing `PNG_BASE64` (2x2) is tolerated by `<img>`/the seed-map path (no decode) but is **rejected by `createImageBitmap`** in headless Chromium, so the real thumbnail path could not run. This is a fixture limitation, not a code defect — `capGalleryImage` correctly surfaced the decode failure.
- **Fix:** Added a valid 8x8 RGB PNG fixture (`PNG_DECODABLE_BASE64`) for the gallery-upload test; left the 2x2 PNG for the no-decode seed-map path.
- **Files modified:** e2e/profile.spec.ts
- **Commit:** a13027c

## Out-of-Scope / Deferred (NOT fixed)

- **Pre-existing `react-hooks/set-state-in-effect` lint in `PersonForm`'s reset effect.** This flagged identically at HEAD before this plan (`setState(initialState(person))` in the open/reset effect) and is unrelated to the media slice. The project's green gate is `tsc --noEmit && vite build` + Vitest + Playwright (all green); repo-wide `eslint` has 260+ pre-existing problems and is not part of CI. Left untouched per the executor scope boundary. Logged to `deferred-items.md`.

## Verification

- `npx vitest run tests/media/thumbnails.test.ts tests/media/mediaManager.test.ts` → 12 passed
- `npx vitest run` (full) → 58 passed (10 files)
- `npx tsc --noEmit` → clean
- `npx playwright test e2e/profile.spec.ts` (fresh production build via managed webServer) → 5 passed

## Acceptance Criteria

- [x] Photos thumbnailed client-side and stored as content-addressed media blobs (PROF-03)
- [x] Profile shows a thumbnail + multi-photo gallery; empty state reads "No photos yet." (PROF-02)
- [x] Identical image bytes dedupe to one media record
- [x] `media` table key remains `hash` only; no base64 in entity writes; object URLs revoked on unmount

## Self-Check: PASSED

All 6 created source/test files exist on disk; both task commits (`bfef33a`, `a13027c`) are present in git history.
