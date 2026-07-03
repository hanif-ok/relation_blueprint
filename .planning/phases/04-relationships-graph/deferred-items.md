# Phase 04 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed here per the executor scope boundary).

## Pre-existing E2E failure: `browse-and-create.spec.ts` "sort toggle reorders the list"

- **Discovered during:** 04-02 execution (Task 3 verification).
- **Symptom:** `e2e/browse-and-create.spec.ts:139` fails clicking `sort-recent` — the ProfileSidebar
  (opened automatically after the last `createViaMenu` group create, App `handleSaved` line ~189)
  is docked `position: fixed; right: 0` and intercepts pointer events over the sort toolbar.
- **Confirmed pre-existing:** the identical failure reproduces on the pre-Task-3 base (committed
  Task-2 HEAD, before any 04-02 Relationships-section changes) — it is NOT caused by plan 04-02.
- **Root cause (unrelated to 04-02):** creating an entity via the +New menu auto-opens its profile
  sidebar; the sidebar overlaps the browse-list sort controls, so a subsequent `sort-recent` click
  is blocked. A test-hygiene fix would close the sidebar (or assert against it) before toggling sort,
  or the app could close the sidebar on view switch.
- **Disposition:** DEFERRED — out of scope for 04-02 (relationship authoring). Flag for a follow-up
  quick fix / debug pass.
