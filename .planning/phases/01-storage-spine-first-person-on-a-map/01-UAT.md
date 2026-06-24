---
status: complete
phase: 01-storage-spine-first-person-on-a-map
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md]
mode: mvp
user_story: "As a single curator of a private people-and-places dataset, I want to connect my own Google Drive, create a person, place them on an image-map, open their profile, and export then restore my whole database, so that I own my entire database in my own cloud with no server and can trust the storage spine before I put real data in it."
started: 2026-06-24T23:02:02Z
updated: 2026-06-24T23:31:16Z
---

## Current Test

[testing complete]

## Tests

<!-- ===== SECTION 1: USER-FLOW WALK-THROUGH (run first, in order) ===== -->

### 1. Open the app (cold start)
expected: Start the app fresh (npm run dev, or build + preview). It loads to the map screen with NO console errors; you see the empty-map state (upload-a-map affordance) and a Drive status pill in the top bar.
result: pass

### 2. Connect your Google Drive — drive.file-only consent + visible folder (STOR-01, T-01-01)
expected: Click the status pill / Connect Drive and sign in. The OAuth consent screen lists ONLY "files this app creates" (drive.file) — NEVER "See and manage all of your Google Drive files". After granting, the pill becomes "Drive – Synced" and a visible "Relation Blueprint" folder appears at drive.google.com.
result: issue
reported: "sync failed, please retry message on chip"
severity: major
clarification: "User later determined the error is triggered by EMPTY STATE — connecting / first-syncing before any person/map exists shows 'sync failed, please retry' on the chip. Connect, drive.file consent, and folder creation all work; sync succeeds once data exists (Test 7 passed). Defect is in the empty / first-sync (bootstrap) push path, not auth. Downgraded blocker → major: spine works once data exists, but a clean first-connect on an empty DB shows a scary error that undermines trust in the storage spine."

### 3. Upload a map image (MAP-01)
expected: From the empty state, upload an image (JPG/PNG/WebP, ≤25 MB). It renders as the dark map background filling the canvas. (A >25 MB or wrong-type file shows a clear, non-blocking error instead.)
result: pass

### 4. Create a person (DATA-02, PROF-01, MAP-04)
expected: Click "+ Person", enter a name (required) plus any other profile fields, optionally add an avatar photo, and submit. The person appears on the map as a round photo/initials avatar marker.
result: pass
note: "User: 'they arent resizable'. Out of scope for Phase 1 — markers are spec'd as fixed 48px avatars (drag-to-place + persist); no Transformer/resize in UI-SPEC or MAP-01/MAP-04. Captured as a future enhancement, NOT a phase gap."

### 5. Place the person & confirm it persists (MAP-04, STOR-03)
expected: Drag the avatar marker to a spot on the map, then reload the page. The marker reappears in the same spot — its position was saved locally (no server needed).
result: pass

### 6. Open the person's profile (PROF-01, PROF-02)
expected: Click the marker. A profile panel docks on the right showing the person's name and all the fields you entered (and the photo / gallery if you added one).
result: pass
note: "User: 'the photos arent expandable'. Out of scope for Phase 1 — PROF-02 specs a lazy-loaded thumbnail tile grid only; no click-to-expand/lightbox/full-res view in UI-SPEC. Captured as a future enhancement, NOT a phase gap."

### 7. Your data lands in your Drive (STOR-02, STOR-04)
expected: Open the "Relation Blueprint" folder at drive.google.com. It contains the database files — a manifest plus people/maps/markers shard files (and a media folder if you added a photo) — reflecting the person and map you just created.
result: pass
note: "Folder 'Relation Blueprint' is created on connect. It was initially EMPTY because the first sync ran while the DB was in empty state (root of the Test 2 error). After creating the person/map and re-syncing, the manifest + shard files appear — data lands in Drive once data exists."

### 8. Export your whole database (EXPT-01)
expected: Open the ⋯ overflow menu → Export. A file named relation-blueprint-backup-YYYY-MM-DD.json downloads to your computer.
result: pass

### 9. Restore your whole database (EXPT-02)
expected: Open ⋯ → Restore, select the backup file you just exported, and confirm the destructive restore. The app reloads your data and your person, map, and photo are all intact (unchanged).
result: pass

<!-- ===== SECTION 2: TECHNICAL CHECKS (only after Section 1 passes) ===== -->

### 10. Token-expiry Reconnect, non-blocking (>1h session)
expected: Leave the app connected past ~60 min (or otherwise let the access token expire). The pill switches to "Drive – Reconnect" WITHOUT blocking the app (you can still create/edit). Clicking Reconnect re-acquires a token and resumes sync with no queued writes lost. (Slow to test live — skip/blocked is fine.)
result: pass

### 11. Works offline, syncs on reconnect (STOR-06)
expected: Go offline (DevTools "Offline", or disconnect network). The app keeps working — you can create/edit a person against the local cache. Go back online; pending changes sync to Drive and the pill returns to "Synced".
result: pass
note: "User: 'on refresh, drive gets unconnected'. Expected given the GIS token model — the access token is in-memory only and intentionally NOT persisted (token-never-persisted invariant; auth.test.ts), so a reload drops the live token. UX papercut: the app does not attempt a SILENT re-acquire on load, so the user must click Reconnect after each refresh. Logged as a minor enhancement gap (fix = GIS prompt:'' silent re-acquire on load; MUST NOT persist the token)."

### 12. Corrupt/foreign backup is rejected safely (T-07-01)
expected: Open ⋯ → Restore and pick a NON-backup file (a random .json or text file). The app shows a clear "invalid backup" error and your existing data is left completely untouched — nothing is wiped.
result: pass

### 13. Automated safety suite (auto-verified evidence)
expected: The phase ships automated proofs you can't easily reproduce by hand — atomic manifest-swap under fault injection (no partial commit ever, STOR-05), token-never-persisted to localStorage/IndexedDB, and the export→wipe→import round-trip byte-equality. Reported green at 81 unit + 13 E2E. Confirm you accept this evidence (or reply "rerun" and I'll run the suite live).
result: pass
note: "User accepted automated evidence. Also asked whether image + person being unresizable is a phase thing — YES, intentional. Phase 1 map scope = image background (MAP-01) + place/persist marker (MAP-04) + drag-pan/wheel-zoom. Per-object resize/rotate/transform (Konva Transformer), layers, and richer map editing are deferred to a later map-editor phase. Out-of-scope enhancement, NOT a phase gap (same bucket as T4 marker-resize, T6 photo-expand)."

<!-- ===== SECTION 3: COVERAGE CHECK (outcome clause) ===== -->

### 14. Outcome — you own your whole DB in your own cloud, no server, spine trusted
expected: Stepping back: your entire dataset lives in YOUR Google Drive (visible folder, your account), the app ran with no backend, and you proved you can export AND restore before any real data goes in. Does the storage spine feel trustworthy enough to start adding real people?
result: pass
note: "User: 'the media is unsorted'. Out of scope for Phase 1 — PROF-02 specs displaying the gallery; ordering/sort/reorder controls are not a Phase 1 deliverable. Gallery renders person.gallery in stored (append) order. Captured as a future enhancement (profile/media phase), NOT a phase gap."

## Summary

total: 14
passed: 13
issues: 1
pending: 0
skipped: 0
blocked: 0
notes: 5   # passing tests with out-of-scope/minor observations: T4 (marker resize), T6 (photo expand), T11 (silent reconnect), T13 (image+marker transform), T14 (media sort)

## Gaps

- truth: "Connecting Google Drive before adding data reaches a clean synced state — an empty / first sync must not error. The 'Relation Blueprint' folder is created on connect and populated once data exists."
  status: failed
  reason: "User reported: 'sync failed, please retry message on chip'. Later clarified: the error is triggered by EMPTY STATE — the first sync before any person/map exists fails with 'sync failed, please retry'. Connect / drive.file consent / folder-creation all work; sync succeeds once data exists (Test 7 passed). Likely defect in the empty / first-sync bootstrap push path (Plan 01-05 SyncEngine.bootstrap/push or DriveProvider handling of empty/zero-entity shards), NOT auth."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "After a page refresh, Drive stays connected without a manual reconnect — the app silently re-acquires a token on load (no popup) when a Google session exists."
  status: failed
  reason: "User reported during an otherwise-passing offline test: 'on refresh, drive gets unconnected'. By design the GIS access token is in-memory only and never persisted (token-never-persisted invariant), so reload drops it. The app currently requires a manual Reconnect click after every refresh instead of attempting a silent re-acquire (GIS prompt:''). UX papercut, not a security defect. Fix = silent re-acquisition on load; MUST NOT persist the token."
  severity: minor
  test: 11
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
