---
phase: 02-custom-fields-full-entity-model
plan: 05
subsystem: ui
tags: [react, radix-dialog, lucide-react, lightbox, drag-and-drop, accessibility, playwright]

# Dependency graph
requires:
  - phase: 02-custom-fields-full-entity-model (plan 02-03)
    provides: entity forms / PhotoUpload gallery grid + ProfileSidebar gallery mount
  - phase: 02-custom-fields-full-entity-model (plan 02-04)
    provides: CustomFieldRows with the custom Photo-field thumbnail
provides:
  - PhotoLightbox component (full-viewport dark-scrim overlay; prev/next + arrow keys; mono index caption; Esc/backdrop/close; focus-trap + host-managed focus-return; loading/decode-error states)
  - Gallery + custom Photo-field thumbnails wired to open the shared lightbox
  - Gallery drag-to-reorder (HTML5 drag, no DnD library) + mandatory keyboard reorder (Space/arrow/Space/Esc + aria-live)
  - First-tile "Thumbnail" badge on the editable gallery
  - e2e/lightbox.spec.ts (criterion 5) + e2e/gallery-reorder.spec.ts (criterion 6)
affects: [phase-03-maps-editor, graph-view, any-future-gallery-surface]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Radix Dialog reused for a non-confirmation modal (lightbox) — focus-trap/Esc for free, host owns focus-return when the trigger is a plain button (not a Dialog.Trigger)"
    - "Lightweight headless reorder: HTML5 drag events + a keyboard handler on a focusable handle; no DnD library added"
    - "Capture-phase window keydown guard + a live ref so a single Esc dismisses only the topmost overlay (lightbox), never the host sidebar underneath it"

key-files:
  created:
    - src/features/profile/PhotoLightbox.tsx
    - src/features/profile/PhotoLightbox.module.css
    - e2e/lightbox.spec.ts
    - e2e/gallery-reorder.spec.ts
  modified:
    - src/features/profile/PhotoGallery.tsx
    - src/features/profile/PhotoGallery.module.css
    - src/features/profile/ProfileSidebar.tsx
    - src/features/profile/ProfileSidebar.module.css
    - src/features/profile/CustomFieldRows.tsx
    - src/features/person-form/PhotoUpload.tsx
    - src/features/person-form/PhotoUpload.module.css

key-decisions:
  - "Lightbox prev/next are DISABLED-with-state at the boundaries (v1 does not wrap) — never a dead no-op (S18)"
  - "Focus-return is managed by the host (ProfileSidebar) via a captured trigger ref + requestAnimationFrame, with Radix's onCloseAutoFocus prevented — so focus lands on the exact originating tile even after paging"
  - "Reorder persists by mutating the gallery: MediaRef[] order and calling the existing onGalleryChange — the order IS the data and rides the existing save → dirty → sync path (no new persistence code)"

patterns-established:
  - "Openable thumbnail = a real <button> tile with the amber focus ring; a missing onOpen handler degrades it to a plain non-interactive thumbnail"
  - "Keyboard reorder contract: Space pick / arrow move / Space drop / Esc cancel, each move announced via an aria-live status region"

requirements-completed: [DATA-01]

# Metrics
duration: 18min
completed: 2026-06-26
status: complete
---

# Phase 2 Plan 05: Photo Lightbox & Gallery Reorder Summary

**Full-viewport keyboard-operable photo lightbox (Radix Dialog, slate #1B2230 scrim, prev/next + mono index) opened from any gallery or custom Photo thumbnail, plus drag-and-keyboard gallery reorder persisting the `gallery: MediaRef[]` order with a first-tile "Thumbnail" badge — completing the deferred Phase-1 UAT media criteria 5 & 6.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-26
- **Completed:** 2026-06-26
- **Tasks:** 2
- **Files modified:** 11 (4 created, 7 modified)

## Accomplishments
- `PhotoLightbox` — a Radix-Dialog dark-scrim overlay with `ChevronLeft`/`ChevronRight`/`X` glyph controls, a mono `{n} / {total}` caption, arrow-key + on-screen navigation (disabled-with-state at boundaries), single-photo (close-only) mode, loading shimmer + decode-error states, and `prefers-reduced-motion` respect. One full-res object URL at a time, revoked on change/unmount (no leak).
- Wired the profile gallery tiles AND the custom Photo-field thumbnail to open the same lightbox; the sidebar hosts the open/index state and returns focus to the originating thumbnail on dismiss.
- Gallery drag-to-reorder via native HTML5 drag events (no DnD library), plus the mandatory keyboard reorder (Space/arrow/Space/Esc) with `aria-live` move announcements; reorder persists through the existing save path.
- First gallery tile badged "Thumbnail" (single-photo galleries show no reorder affordance).
- Two new E2E specs proving criterion 5 (open → navigate → Esc + focus return; single-photo hides prev/next) and criterion 6 (keyboard reorder persists across reload + Thumbnail badge).

## Task Commits

Each task was committed atomically:

1. **Task 1: Photo lightbox** - `84d6cf1` (feat)
2. **Task 2: Gallery drag + keyboard reorder** - `810e050` (feat)

## Files Created/Modified
- `src/features/profile/PhotoLightbox.tsx` - The lightbox overlay (Radix Dialog, scrim, controls, caption, states).
- `src/features/profile/PhotoLightbox.module.css` - Scrim (slate #1B2230 @ 92%), paper glyph buttons, mono caption, reduced-motion shimmer.
- `src/features/profile/PhotoGallery.tsx` - Tiles become openable buttons that raise an index to the host; degrade to plain thumbnails without a handler.
- `src/features/profile/PhotoGallery.module.css` - `.tileButton` interactive variant with amber focus ring.
- `src/features/profile/ProfileSidebar.tsx` - Lightbox host state + `openLightbox`/`closeLightbox` (trigger capture + focus return); Esc guard so the sidebar doesn't steal the lightbox's Escape.
- `src/features/profile/ProfileSidebar.module.css` - `.customPhotoButton` openable custom-Photo variant.
- `src/features/profile/CustomFieldRows.tsx` - `onOpenPhoto` threaded so a custom Photo value opens the shared (single-photo) lightbox.
- `src/features/person-form/PhotoUpload.tsx` - Drag + keyboard reorder, `GripVertical` handle, `aria-live` region, first-tile Thumbnail badge.
- `src/features/person-form/PhotoUpload.module.css` - Handle, badge, drag-lift/grabbed states, sr-only live region.
- `e2e/lightbox.spec.ts` - Criterion 5 flows.
- `e2e/gallery-reorder.spec.ts` - Criterion 6 flow.

## Decisions Made
- Lightbox boundaries DISABLE prev/next rather than wrap (v1 choice; the spec permits either as long as it is never a dead no-op).
- Host-managed focus-return (captured trigger ref + `requestAnimationFrame`) with Radix `onCloseAutoFocus` prevented — necessary because the trigger is a plain button, not a `Dialog.Trigger`, and because focus must return to the *originating* tile even after the user paged to a different index.
- Reorder reuses the existing `onGalleryChange` → save path; no new persistence code, honoring "the order IS the data" (D-21).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Single Escape closed both the lightbox and the host sidebar**
- **Found during:** Task 1 (lightbox wiring)
- **Issue:** The ProfileSidebar registers a `window` keydown listener that closes the sidebar on Escape. With the lightbox open, one Escape dismissed the lightbox (Radix) AND the sidebar, so the test landed on a closed profile.
- **Fix:** Guarded the sidebar's Esc handler against an open lightbox using a live ref (`lightboxOpenRef`) read at keypress time, and moved the listener to the capture phase so it evaluates the guard before Radix's dismiss layer nulls the state.
- **Files modified:** src/features/profile/ProfileSidebar.tsx
- **Verification:** e2e/lightbox.spec.ts — Esc now returns to the still-open profile.
- **Committed in:** 84d6cf1 (Task 1 commit)

**2. [Rule 1 - Bug] Focus did not return to the originating thumbnail after dismiss**
- **Found during:** Task 1 (lightbox wiring)
- **Issue:** Radix restores focus to its captured previously-focused element, but the trigger is a plain button (not a `Dialog.Trigger`); after paging indices, focus return was unreliable (tile ended "inactive").
- **Fix:** The host captures the active trigger element on open and restores focus to it on close via `requestAnimationFrame`; `onCloseAutoFocus` is prevented on the Dialog so Radix doesn't fight the host.
- **Files modified:** src/features/profile/ProfileSidebar.tsx, src/features/profile/PhotoLightbox.tsx
- **Verification:** e2e/lightbox.spec.ts — `tiles.nth(1)` is focused after Esc.
- **Committed in:** 84d6cf1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes are correctness requirements for the S18 keyboard/focus contract (Esc isolation + focus-return). No scope creep — they are exactly the "focus is trapped while open and returns to the originating thumbnail" must-have.

## Issues Encountered
- None beyond the two auto-fixed focus/Esc bugs above, which were caught and resolved by the lightbox E2E spec.

## Known Stubs
None — every surface is wired to real data (the entity `gallery` array and `resolveMediaUrl`). No placeholder or empty-data paths introduced.

## Threat Surface
No new surface beyond the plan's `<threat_model>`. The decode-error state (T-03-02), single full-res object URL revoked on change/unmount (T-03-07), and caption rendered as React children (T-03-01) are all implemented as specified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase-2 success criteria 5 & 6 are satisfied; the gallery surfaces are now fully interactive (expand + reorder), both keyboard-accessible.
- `tsc --noEmit` clean; new specs green; all 11 prior E2E (profile, custom-fields, browse-and-create) still green — no regressions in the shared profile/gallery components.

---
*Phase: 02-custom-fields-full-entity-model*
*Completed: 2026-06-26*
