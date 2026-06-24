---
phase: 01-storage-spine-first-person-on-a-map
plan: 03
subsystem: ui
tags: [react, konva, react-konva, dexie, dexie-react-hooks, radix-dialog, design-tokens, playwright, webcrypto]

# Dependency graph
requires:
  - phase: 01-01
    provides: Vite 7 + React 19.2 + TS strict scaffold; react-konva 19.2.x + konva 10.3 installed
  - phase: 01-02
    provides: domain types/schemas (Person/MapDoc/Marker/MediaRef), Dexie schema, offline-first repository (createPerson/updatePerson/deletePerson/createMap/upsertMarker/getMedia) with dirty-marking + marker cascade
provides:
  - Shared design-token system (tokens.css :root + tokens.ts constants) — single source of truth for canvas + DOM
  - MapView — dark Konva Stage (image-bg layer + marker layer) with empty-state image upload (25 MB cap + JPG/PNG/WebP allowlist)
  - AvatarMarker — signature round photo-avatar marker (clipFunc crop, paper/amber rings, pin-stem, initials fallback) with drag-persist via upsertMarker
  - useMapImage/useBlobImage — media-blob to HTMLImageElement decode hooks for Konva
  - db/media.ts — content-addressed (SHA-256) media store helper over putMedia
  - PersonForm — create/edit form with the six DATA-02 fields (Radix Dialog, name-required validation)
  - ProfileSidebar — right-docked dossier (all DATA-02 read-only, gallery mount point, Edit/Delete, aria-live AT bridge)
  - ConfirmDialog — reusable Radix destructive-confirmation dialog
  - PhotoGallery mount-point stub (real grid is Plan 04)
  - db/testBridge.ts — window.__rb exposing repository + Konva for E2E seeding
  - Three Playwright E2E specs (map-create, marker, profile)
affects: [01-04, 01-05, 01-06, 01-07, photo-gallery, drive-sync, profile, map-editor]

# Tech tracking
tech-stack:
  added: ["@radix-ui/react-dialog (Dialog/focus-trap)", "@fontsource Fraunces/Inter/JetBrains-Mono (self-hosted)", "lucide-react icons"]
  patterns:
    - "Shared tokens.ts constants imported by Konva so canvas and CSS custom properties never drift (UI-SPEC A5)"
    - "useLiveQuery typed with explicit <T> + async querier to avoid never[]/PromiseExtended inference traps"
    - "Content-addressed media via crypto.subtle SHA-256 -> MediaRef -> putMedia (idempotent, deduped)"
    - "Konva marker named by person id (name=marker-{personId}) as the canvas->AT/E2E selection bridge"
    - "window.__rb test bridge seeds the SAME repository the UI uses, proving wiring end-to-end against the production bundle"

key-files:
  created:
    - src/app/tokens.css
    - src/app/tokens.ts
    - src/db/media.ts
    - src/db/testBridge.ts
    - src/features/person-map/MapView.tsx
    - src/features/person-map/AvatarMarker.tsx
    - src/features/person-map/useMapImage.ts
    - src/features/person-form/PersonForm.tsx
    - src/features/profile/ProfileSidebar.tsx
    - src/features/profile/PhotoGallery.tsx
    - src/features/common/ConfirmDialog.tsx
    - e2e/map-create.spec.ts
    - e2e/marker.spec.ts
    - e2e/profile.spec.ts
  modified:
    - src/app/App.tsx
    - src/app/App.module.css
    - src/main.tsx

key-decisions:
  - "Self-hosted @fontsource Fraunces 600 used for display (variable Fraunces not installed); 600 substitutes for the UI-SPEC's 560 weight"
  - "On person CREATE the new person is auto-placed as a marker at the map center so the create->place->profile thread is unbroken (resolves UI-SPEC A12's place-vs-create ordering)"
  - "Added a small content-addressed media helper (db/media.ts, SHA-256) and a window.__rb test bridge — both unspecified infra the plan implied but did not enumerate"
  - "Konva selection driven in E2E via Group.fire('click'/'dragend') instead of pixel mouse drags — deterministic across devicePixelRatio/Stage transforms"

patterns-established:
  - "Design tokens: one tokens.ts + tokens.css pair; Konva reads the TS constants, DOM reads the CSS vars"
  - "Feature folders under src/features/{person-map,person-form,profile,common} with co-located CSS modules"
  - "All user text rendered as React children — no dangerouslySetInnerHTML anywhere (T-03-01)"

requirements-completed: [DATA-02, DATA-04, PROF-01, MAP-01, MAP-04]

# Metrics
duration: 15min
completed: 2026-06-24
status: complete
---

# Phase 01 Plan 03: Walking Skeleton (Person on a Map) Summary

**End-to-end local-first thread on Dexie: upload an image to make a dark Konva map, create a Person (DATA-02), render them as the signature round avatar marker, drag-to-persist, and open a focus-managed profile sidebar to edit/delete (with marker cascade) — no network.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-24T14:18:58Z
- **Completed:** 2026-06-24T14:34:00Z
- **Tasks:** 2
- **Files modified:** 22 (19 created, 3 modified)

## Accomplishments
- Shared design-token system (`tokens.css` + `tokens.ts`) so the Konva canvas and DOM chrome read one source of truth — no color drift on the signature marker.
- Dark Konva `MapView` with image-background + marker layers, an empty-state upload affordance (25 MB cap + JPG/PNG/WebP allowlist + the exact error copy), and minimal drag-pan/wheel-zoom.
- The signature `AvatarMarker`: 48px circular-clipped avatar (`clipFunc`), paper ring default / amber ring + pin-stem when selected, initials fallback; `onDragEnd` persists x/y through `repository.upsertMarker` (proven to survive a page reload).
- `PersonForm` (six DATA-02 fields, name-required validation), right-docked `ProfileSidebar` (all fields read-only, gallery mount point, aria-live "Selected {Name}" AT bridge, focus moved into the panel), and a reusable destructive `ConfirmDialog` — delete cascades the marker.
- Full quality gate green: `tsc --noEmit`, 29 unit tests, 9 Playwright E2E specs (incl. the 3 new), and the production PWA build.

## Task Commits

1. **Task 1: Shared tokens + Konva map view + signature avatar marker** - `7bc4798` (feat)
2. **Task 2: Person form + profile sidebar + destructive delete** - `814ec9c` (feat)

**Plan metadata:** _see final docs commit_

## Files Created/Modified
- `src/app/tokens.css` / `src/app/tokens.ts` - Palette/spacing/radii tokens; TS constants for Konva, CSS vars for DOM.
- `src/db/media.ts` - SHA-256 content-addressing helper; hashes a Blob and persists it via `putMedia`.
- `src/db/testBridge.ts` - Exposes repository + Konva on `window.__rb` for E2E seeding against the real DB.
- `src/features/person-map/MapView.tsx` / `.module.css` - Konva Stage, image-bg + marker layers, empty-state upload.
- `src/features/person-map/AvatarMarker.tsx` - The round marker Group (clipFunc crop, rings, pin-stem, initials); drag-persist.
- `src/features/person-map/useMapImage.ts` - `useMapImage`/`useBlobImage` decode hooks (object-URL lifecycle owned).
- `src/features/person-form/PersonForm.tsx` / `.module.css` - Create/edit form, six DATA-02 fields, Radix Dialog, name validation.
- `src/features/profile/ProfileSidebar.tsx` / `.module.css` - Right-docked profile; read-only fields; Edit/Delete; AT bridge.
- `src/features/profile/PhotoGallery.tsx` / `.module.css` - Plan 03 gallery mount point ("No photos yet."); real grid is Plan 04.
- `src/features/common/ConfirmDialog.tsx` / `.module.css` - Reusable destructive dialog (focus on Cancel).
- `src/app/App.tsx` / `.module.css` - Top bar (wordmark + amber `+ Person` gated by map + overflow placeholder); mounts MapView, ProfileSidebar, PersonForm.
- `src/main.tsx` - Self-hosted font + `tokens.css` imports; installs the test bridge.
- `e2e/map-create.spec.ts`, `e2e/marker.spec.ts`, `e2e/profile.spec.ts` - The three walking-skeleton E2E flows.

## Decisions Made
- **Fraunces 600 for display** — the variable Fraunces is not installed; `@fontsource/fraunces/600.css` (fixed) substitutes for the UI-SPEC's 560 weight. Cheap to swap to the variable font later.
- **Auto-place on create** — a newly created person is placed as a marker at the map center, resolving the UI-SPEC A12 ordering (a person needs somewhere to go this phase) without a separate placement gesture.
- **E2E selection via Konva events** — `Group.fire('click'/'dragend')` is deterministic across devicePixelRatio/Stage transforms, unlike pixel-coordinate mouse drags on a `<canvas>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added content-addressed media helper (`src/db/media.ts`)**
- **Found during:** Task 1 (MapView upload / AvatarMarker photo)
- **Issue:** `repository.createMap`/`Person.photo` consume a `MediaRef{hash,mime}`, but the repository only exposes `putMedia(ref, blob)` — there was no helper to compute the content hash from an uploaded Blob, so map/photo upload could not be wired.
- **Fix:** Added `storeMedia(blob, dims?)` using `crypto.subtle.digest('SHA-256')` to build the `MediaRef` then `putMedia`. Idempotent + deduped by design.
- **Files modified:** src/db/media.ts
- **Verification:** map-create.spec uploads an image; map persists with a valid background ref; build green.
- **Committed in:** 7bc4798

**2. [Rule 3 - Blocking] Added `window.__rb` test bridge (`src/db/testBridge.ts`)**
- **Found during:** Task 1 (E2E specs)
- **Issue:** The plan's E2E specs (marker, profile) require seeding a map/person/marker, but the Konva canvas is not a DOM tree and the production bundle exposes no seam to the repository.
- **Fix:** Added a thin bridge exposing the repository + the live Konva instance on `window.__rb`/`window.Konva`, installed at startup in `main.tsx`. Inert when no test driver is present; data-only (no network/secrets).
- **Files modified:** src/db/testBridge.ts, src/main.tsx
- **Verification:** All 3 new E2E specs seed and assert against the same Dexie DB the UI reads.
- **Committed in:** 7bc4798

**3. [Rule 3 - Blocking] Mounted MapView in App during Task 1 (App.tsx listed under Task 2)**
- **Found during:** Task 1 (map-create/marker verification)
- **Issue:** Task 1's E2E gate requires the map surface to render, but `App.tsx` (a Task 2 file) still rendered an empty `<main>`. Tests failed with the component unmounted.
- **Fix:** Added a minimal MapView mount + selection state to `App.tsx` in Task 1; Task 2 then layered the top bar, `+ Person`, form, and sidebar onto it.
- **Files modified:** src/app/App.tsx, src/app/App.module.css
- **Verification:** Task 1 E2E green; Task 2 fully wired App; both committed.
- **Committed in:** 7bc4798 (Task 1 mount), 814ec9c (Task 2 wiring)

**4. [Rule 2 - Missing Critical] Created PhotoGallery stub so the sidebar import resolves**
- **Found during:** Task 2 (ProfileSidebar)
- **Issue:** The plan instructs the sidebar to import `PhotoGallery` from `src/features/profile/PhotoGallery` (built in Plan 04). Importing a non-existent module breaks `tsc`/build.
- **Fix:** Created a minimal `PhotoGallery` that renders the contract empty-state ("No photos yet."). Explicitly scoped as a Plan 04 mount point; no gallery grid built.
- **Files modified:** src/features/profile/PhotoGallery.tsx, src/features/profile/PhotoGallery.module.css
- **Verification:** tsc + build green; sidebar renders the empty-state line.
- **Committed in:** 814ec9c

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing-critical)
**Impact on plan:** All four were necessary infra the plan implied but did not enumerate (a hashing helper, an E2E seam, an early App mount, and a forward-declared import stub). No scope creep — the PhotoGallery grid, Drive/sync, and pan/zoom polish remain in their later plans.

## Issues Encountered
- **`useLiveQuery` type inference** — the 3-arg default-result overload inferred `never[]` / leaked `PromiseExtended` through the conditional querier. Resolved by typing the default (`[] as Marker[]`) and using an explicit `useLiveQuery<Person | undefined>` with an `async` querier.
- **Marker name mismatch in the drag test** — the marker Group is named by *person* id, not marker id; the first drag test matched on marker id and timed out. Fixed by returning both ids from the seed helper and matching on person id.

## Known Stubs
- `src/features/profile/PhotoGallery.tsx` — intentional Plan 04 mount point. Renders "No photos yet." (or a count line); the lazy-loaded tile grid is Plan 04's scope. Does not block this plan's goal (single-avatar display is wired via `Person.photo`).

## Threat Flags
None — no security surface beyond the plan's threat model was introduced. T-03-01 (XSS) mitigated (no `dangerouslySetInnerHTML`), T-03-02 (oversized image) mitigated (25 MB cap + format allowlist + non-blocking error copy), T-03-03 (accidental delete) mitigated (ConfirmDialog with the "restore a backup" copy).

## User Setup Required
None - no external service configuration required (this plan is fully local; Drive auth is deferred to Plan 06).

## Next Phase Readiness
- The walking-skeleton thread is live end-to-end on local storage — the spine the rest of the phase widens.
- Plan 04 can replace the `PhotoGallery` stub with the real lazy-loaded grid (the `person.gallery` MediaRefs and `getMedia` are already available).
- Plan 05 sync can subscribe to the repository's change events; every write here already stamps `dirty`/`updatedAt`.

## Self-Check: PASSED

All 14 created files verified on disk; both task commits (`7bc4798`, `814ec9c`) verified in git history.

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24*
