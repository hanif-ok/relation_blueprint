---
phase: 02-custom-fields-full-entity-model
plan: 03
type: execute
wave: 3
status: complete
requirements: [DATA-01, BRWS-01, BRWS-02]
closed_out_by: orchestrator
---

# Plan 02-03 Summary — Multi-surface dossier + four entity types + browse + privacy notice

> **Close-out note:** The executor agent completed and committed all three task
> commits in its worktree, then was stopped by the user immediately before writing
> this SUMMARY. Per the GSD safe-resume close-out path, the orchestrator merged the
> three commits to `master`, re-verified them (build + full unit suite green), and
> authored this SUMMARY. No implementation work was performed by the orchestrator.

## Objective

Turn the single-surface map shell into a multi-surface dossier and deliver the four
first-class entity types + browse lists end-to-end: a left-nav view switcher (D-13),
a `+ New` create menu + generalized entity form (DATA-01), virtualized browse lists
whose rows open the profile in list context (BRWS-01/02, D-14), a Name A-Z /
Recently-updated sort toggle (D-17), and the one-time privacy notice (criterion 4, D-19).

## What shipped (by task)

**Task 1 — view switcher + `+ New` menu + generalized entity form (commit `b9b66ab`)**
- `src/features/nav/ViewSwitcher.tsx` — paper-shade left rail with Views (Map / People /
  Locations / Groups / Relationship-links) + Tools (Fields / About-Privacy); roving
  arrow-key focus, `aria-current="page"` on the active item, ink left-bar active styling
  (never amber, per U1), live mono count pills via `useLiveQuery(() => db.<table>.count())`,
  collapsed icon-only `aria-label` fallbacks.
- `src/features/nav/NewEntityMenu.tsx` — Radix `DropdownMenu` amber `+ New ▾` offering all
  four types.
- `src/features/entity-form/EntityForm.tsx` — generalized create/edit form covering
  `people | maps | groups | relationship-links` spine fields, amber-on-create /
  neutral-on-edit, calling the matching repository fn (`createPerson/createMap/createGroup/
  createRelationshipLink` + update variants). Custom-field inputs deliberately deferred to
  plan 02-04 (placeholder extension point left in place).
- `src/app/App.tsx` — `activeView` state swaps the main surface between `MapView` and the
  per-type `BrowseList`; top-bar `+ Person` replaced by `NewEntityMenu`; Person
  create→auto-place→profile thread preserved.

**Task 2 — virtualized browse lists ×4 (commit `fc4c63f`)**
- `src/features/browse/BrowseList.tsx` — per-type virtualized list (constant 64px rows,
  degrades toward thousands; U3), sticky header with count + segmented Name A-Z /
  Recently-updated sort toggle (`orderBy('name')` ↔ `orderBy('updatedAt').reverse()`, D-17),
  loading-shimmer / empty / error / offline states, single amber "Create the first {type}"
  empty CTA.
- `src/features/browse/BrowseRow.tsx` — 64px row: thumb/initials/glyph + name + secondary
  line + neutral "Show on map ↗" (disabled-with-tooltip for non-spatial Groups /
  Relationship-links) + `⋯` overflow (Edit / Delete {entity}); whole row `role="button"`
  opens the profile in **list context**.
- `src/features/browse/useEntityThumb.ts` — lazy per-row thumbnail via `resolveMediaUrl`,
  object-URL revoked on hash-change/unmount (mirrors `PhotoGallery`; T-03-04).
- `src/features/browse/browseTypes.ts` — shared per-type browse metadata (helper extracted
  during implementation; minor additive deviation from the declared file list).
- List-context profile open (`openedFrom: 'list'`) wired in `App.tsx` (the row delegates the
  open; App sets `openedFrom`), completing the 02-02 delete-vs-remove contract (list profile
  shows the brick "Delete {entity}").
- `e2e/browse-and-create.spec.ts` — create one of each type, assert it appears in its list,
  list-context profile open, sort toggle, empty-state CTA.

**Task 3 — one-time privacy/sensitivity notice (commit `83702f8`)**
- `src/features/onboarding/PrivacyNotice.tsx` — Radix Dialog with the exact UI-SPEC copy
  ("A note on the people you record." + body + neutral "Got it" dismiss), focus-trapped,
  Esc-dismiss, focus-return.
- Dismissal persisted to the Dexie `meta` table (round-trips with the DB); auto-shows once at
  first run (first provider connect OR first entity creation) when the flag is absent, and is
  re-viewable any time from the nav About/Privacy item without rewriting the flag.
- `e2e/privacy-notice.spec.ts` — auto-show once, dismiss, no re-show on reload, nav re-open.

## Key files

Created: `src/features/nav/ViewSwitcher.tsx` (+ `.module.css`), `NewEntityMenu.tsx`
(+ `.module.css`), `src/features/browse/BrowseList.tsx` (+ `.module.css`), `BrowseRow.tsx`,
`useEntityThumb.ts`, `browseTypes.ts`, `src/features/entity-form/EntityForm.tsx`
(+ `.module.css`), `src/features/onboarding/PrivacyNotice.tsx` (+ `.module.css`),
`e2e/browse-and-create.spec.ts`, `e2e/privacy-notice.spec.ts`.
Modified: `src/app/App.tsx` (+ `.module.css`), `src/features/profile/ProfileSidebar.tsx`, and
several existing E2E specs updated for the new shell.
Total: 23 files, +2690 / −137.

## Verification / gates

- `npm run build` (`tsc --noEmit && vite build`) — exit 0 on `master` after merge.
- `npm test` (`vitest run`) — **22 files / 125 tests passed**, exit 0 (sequential re-run;
  see deviation 1).
- Acceptance greps confirmed: `aria-current` + count pills in ViewSwitcher;
  `createGroup`/`createRelationshipLink` in EntityForm; `ViewSwitcher`+`NewEntityMenu` mounted
  in App; `orderBy('name')` + `orderBy('updatedAt')` in BrowseList; "Show on map" in BrowseRow;
  "Got it" + exact privacy title in PrivacyNotice; meta-table privacy-key persistence.
- Prohibitions honored: no `dangerouslySetInnerHTML` in `src/features/browse/**` (only
  security comments documenting its deliberate absence — T-03-01 mitigated); no router added
  (view switching is local state); no custom-field inputs (deferred to 02-04); no search box.

## Deviations

1. **Post-merge test gate (environmental, resolved).** The first post-merge `vitest run` on
   `master` exited 1 with 8 "Failed to start forks worker / Timeout waiting for worker"
   errors — vitest fork-worker **startup timeouts** under heavy machine load (48 stray node
   processes), not assertion failures (every file that started passed). A single-worker
   sequential re-run (`--no-file-parallelism`) returned a clean 22/22 files, 125/125 tests,
   exit 0. No code change required.
2. **Additive helper file.** `src/features/browse/browseTypes.ts` was introduced (shared
   per-type browse metadata) beyond the declared `files_modified` list — mechanical, in-scope.

## Self-Check: PASSED

DATA-01 (create all four types), BRWS-01 + BRWS-02 (browse People/Locations as lists, rows
open the profile), and criterion 4 (one-time privacy notice) are delivered, type-check clean,
build clean, and unit-suite green.
