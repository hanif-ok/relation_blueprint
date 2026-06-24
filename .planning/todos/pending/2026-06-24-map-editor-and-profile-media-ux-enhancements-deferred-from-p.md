---
created: 2026-06-24T23:46:25.861Z
title: Map-editor & profile-media UX enhancements (deferred from Phase 1 UAT)
area: ui
files:
  - src/features/person-map/AvatarMarker.tsx
  - src/features/person-map/MapView.tsx
  - src/features/profile/PhotoGallery.tsx
---

## Problem

Four user-observable UX enhancements surfaced during Phase 1 (`/gsd:verify-work 1`)
UAT. All FOUR are out of scope for Phase 1 (the storage-spine + first-person-on-a-map
walking skeleton) — none were promised by the Phase 1 requirements or UI-SPEC, so they
were recorded as notes, NOT phase gaps. Capturing here so they aren't lost. They fall
into two natural future buckets.

**Bucket A — Map-editor object manipulation (Konva Transformer):**
1. **Resizable person markers** (UAT Test 4). Markers are currently fixed 48px
   circular avatars (`AvatarMarker.tsx`) with drag-to-place + persist only. No
   resize/rotate handles. User expected to be able to resize them.
2. **Image + marker transform handles** (UAT Test 13). The map background image is a
   fixed background; the canvas supports drag-pan + wheel-zoom (`MapView.tsx`) but
   there are no per-object Transformer handles to resize/rotate the image or markers.
   User asked "is that a phase thing?" — confirmed yes, deferred.

**Bucket B — Profile-media viewing / ordering:**
3. **Photo expand / lightbox** (UAT Test 6). The profile gallery (`PhotoGallery.tsx`)
   is a lazy thumbnail tile grid (PROF-02). Tiles are not clickable-to-expand; there
   is no full-res/lightbox viewer. User expected photos to be expandable.
4. **Gallery sort / reorder** (UAT Tests 11 & 14). The gallery renders
   `person.gallery` in stored (append) order with no sort or drag-reorder control.
   User observed "the media is unsorted."

Context: CLAUDE.md lists the Konva **Transformer** (resize/rotate) and layered map
editing as stack capabilities intended for a later dedicated **map-editor** phase, not
the storage spine. Buckets A and B map to two different future phases (map-editor vs
profile/media management).

## Solution

TBD — defer to the relevant future phases. Suggested split when ready:
- **Map-editor phase:** add a Konva `Transformer` for selected markers and the map
  image (resize/rotate handles + persisted scale), alongside the existing
  drag-pan/wheel-zoom. (Bucket A: items 1, 2)
- **Profile/media phase:** add a click-to-expand lightbox for gallery photos and a
  gallery sort/reorder control (by date/name or manual drag-order persisted on
  `person.gallery`). (Bucket B: items 3, 4)

Consider promoting to the ROADMAP backlog (`/gsd:capture --backlog`) or splitting into
per-bucket items via `/gsd:capture --list` when these phases are scheduled.
