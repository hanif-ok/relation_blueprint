---
status: awaiting_human_verify
trigger: "In the people/location browse view, the SORTER and the sticky HEADER (people/location) draw over (render on top of) the new/edit profile modal — the modal is obscured by that chrome. A z-index / stacking-context bug. NOTE: NOT the Konva map — the reporter corrected this; it is the browse-list chrome."
created: 2026-07-02T00:00:00Z
updated: 2026-07-03T00:00:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The profile modals paint UNDER the browse chrome because their `.overlay`/`.panel` are `position: fixed` with `z-index: auto`, while the browse `.header` (z-index:1, holds title + A–Z sorter) and `.menu` (z-index:50) carry positive z-indexes. In a shared stacking context a positive-z element always paints above a z-index:auto element, so the chrome covers the modal."
  confirming_evidence:
    - "EntityForm/PersonForm/PrivacyNotice/ConfirmDialog/FieldManager/PhotoLightbox .module.css: overlay + panel/content are position:fixed with NO z-index (read directly)."
    - "BrowseList.module.css: .header z-index:1 (title + .sortToggle), .menu z-index:50 (read directly)."
    - "App.tsx: BrowseList lives inside <main> while the modals portal to body and ProfileSidebar renders at app root — all share the ROOT stacking context. The bug reproducing PROVES <main> does not isolate them (an isolating context would put the body-portaled modal above chrome)."
    - "Precedent: BackupMenu .menu=1000 / .toast=1100 and editor popovers 60/61 all declare z-index and render above chrome; only the modal family omitted it."
  falsification_test: "If an ancestor of BrowseList established an isolating stacking context (e.g. .main had its own z-index/transform), the body-portaled modal would already paint above chrome and the bug would NOT reproduce. It reproduces → shared root context confirmed."
  fix_rationale: "Introduce a single shared z-index scale in tokens.css and give every modal overlay+panel `var(--z-modal)` (1000, matching the backup precedent) so they clear ALL chrome. Addresses the root cause (missing stacking level on the modal), not a symptom — lowering the chrome would break the chrome's own layering."
  blind_spots: "ProfileSidebar is a docked panel (not a Dialog.Portal) that ALSO opens in list context; it needs a level above chrome but below the dialogs it spawns (Edit/Delete/Lightbox) → a dedicated --z-panel:100 tier. jsdom can't compute real stacking, so the regression guard is a STATIC assertion over the CSS source (tokens ordering + each modal declaring --z-modal)."
next_action: apply z-index scale tokens to tokens.css; set var(--z-modal) on the six modal overlays+panels, var(--z-panel) on ProfileSidebar, migrate existing magic numbers (backup 1000/1100, popovers 60/61, menus 50, map chrome 10, sticky 1) to tokens; add tests/features/zIndexLayering.test.ts; run vitest; commit; update Resolution.

## Symptoms

expected: The new/edit profile modal renders ABOVE (in front of) the people/location browse chrome; the sticky header and the A–Z sorter never obscure it.
actual: When the new/edit profile modal is open over the browse list, the sticky header (people/location title) and the A–Z sorter draw on top of the modal, hiding/obscuring it.
errors: None reported.
reproduction: Open the people (or location) browse list, then trigger the new/edit profile modal; observe the sticky header + sorter painting over the modal.
started: Always present — NOT a regression. Per the reporter, the modal has never rendered above the browse chrome.

## Eliminated

- hypothesis: The Konva map canvas is what draws over the modal.
  evidence: The reporter explicitly corrected this — it is the browse-list SORTER and people/location HEADER, not the map. The map view (MapView.module.css) uses z-index 10 and is a separate surface.
  timestamp: 2026-07-02T00:00:00Z

## Evidence

- timestamp: 2026-07-02T00:00:00Z
  checked: src/features/entity-form/EntityForm.module.css:5-9 and src/features/person-form/PersonForm.module.css:5-9
  found: `.overlay { position: fixed; inset: 0; background: rgba(...) }` and `.panel { position: fixed; ... }` — NEITHER declares a z-index. They render at z-index:auto.
  implication: With no z-index, the modal cannot beat any positioned chrome element that has a positive z-index.

- timestamp: 2026-07-02T00:00:00Z
  checked: src/features/browse/BrowseList.module.css:14-17 (.header) and :225-233 (.menu)
  found: `.header { position: sticky; top: 0; z-index: 1; ... }` (holds the people/location title + count + `.sortToggle` A–Z sorter) and `.menu { ... z-index: 50 }` (row overflow / sort menu).
  implication: These positive z-index chrome elements paint over the z-index:auto modal — exactly the reported symptom.

- timestamp: 2026-07-02T00:00:00Z
  checked: grep createPortal/Portal across src/features
  found: EntityForm.tsx:261 and PersonForm.tsx:102 wrap content in Radix `Dialog.Portal` (renders to document.body). Other modals (FieldManager, PrivacyNotice, ConfirmDialog, PhotoLightbox) do the same; BackupMenu uses Dialog.Portal too.
  implication: Portaling to body does NOT by itself win the stacking fight — Radix sets no z-index, so an explicit z-index is required on the overlay/panel.

- timestamp: 2026-07-02T00:00:00Z
  checked: src/features/backup/BackupMenu.module.css:31,67
  found: The Backup dialog overlay/panel set `z-index: 1000` / `1100` and render correctly above chrome.
  implication: Establishes the intended "modal above chrome" layer (~1000). The profile forms just omitted it — the fix should bring them in line (ideally via a shared z-index token).

## Resolution

root_cause: |
  The profile modals (EntityForm, PersonForm) — and their whole Radix Dialog.Portal
  family (PrivacyNotice, ConfirmDialog, FieldManager, PhotoLightbox) — set their
  `.overlay`/`.panel`(`.content`) to `position: fixed` with NO `z-index` (so `z-index:
  auto`). In the people/location BROWSE view the sticky `.header` (`z-index: 1`, holds
  the title + A–Z `.sortToggle`) and the overflow `.menu` (`z-index: 50`) carry positive
  z-indexes. All of them share the ROOT stacking context (App.tsx: BrowseList sits in
  <main>, the modals portal to document.body, ProfileSidebar renders at app root; the bug
  reproducing proves <main> is not an isolating context). CSS stacking rule: a positioned
  element with a positive z-index always paints above a positioned `z-index: auto`
  sibling — so the header + sorter painted OVER the modal. ProfileSidebar (a docked panel,
  not a Dialog) shared the same omission and is likewise covered when opened from the list.
  Not a regression — the modals never declared a z-index. (Slug "map-canvas-over-..." is a
  stale misnomer; it is the browse chrome, not the Konva map.)
fix: |
  Introduced a single shared z-index scale in src/app/tokens.css (--z-sticky:1,
  --z-chrome:10, --z-menu:50, --z-popover:60, --z-popover-content:61, --z-panel:100,
  --z-modal:1000, --z-toast:1100) and routed EVERY z-index in the app through it (no more
  scattered magic numbers). Gave all six Dialog.Portal modal overlays + panels/contents
  `z-index: var(--z-modal)` so they clear all chrome; gave ProfileSidebar
  `z-index: var(--z-panel)` (above chrome, below the dialogs it spawns). Migrated the
  existing magic numbers value-for-value (backup 1000/1100 → --z-modal/--z-toast, editor
  popovers 60/61 → --z-popover/--z-popover-content, menus 50 → --z-menu, map chrome 10 →
  --z-chrome, browse header 1 → --z-sticky) — zero behavior change for those; the only
  behavioral delta is the modals + sidebar gaining their stacking level. z-index is
  DOM-only, so the scale lives solely in tokens.css (tokens.ts is Konva-canvas-only — no
  drift). Precedent followed: the backup dropdown already used 1000 and rendered correctly.
verification: |
  - Mechanism verified by reading App.tsx composition + all CSS: modal overlays were
    z-index:auto while browse .header(1)/.menu(50) were positive-z in the shared root
    context → chrome paints over modal. Fix raises modals to 1000, above all chrome.
  - Regression guard added: tests/features/zIndexLayering.test.ts (9 tests) asserts the
    tokens.css scale is ordered (modal > every chrome/panel layer; toast > modal) and that
    each of the six modal overlays+panels declares var(--z-modal). Proven to have teeth:
    temporarily deleting one modal's z-index turned it RED (1 failed), restored to green.
  - `tsc --noEmit` exit 0. Full `vitest run` green: 46 files / 271 tests (incl. the 9 new).
  - Awaiting human confirmation that the modal now visually renders above the header +
    sorter in the running browse view.
files_changed:
  - src/app/tokens.css (added the shared z-index scale)
  - src/features/entity-form/EntityForm.module.css (overlay+panel → --z-modal)
  - src/features/person-form/PersonForm.module.css (overlay+panel → --z-modal)
  - src/features/onboarding/PrivacyNotice.module.css (overlay+content → --z-modal)
  - src/features/common/ConfirmDialog.module.css (overlay+content → --z-modal)
  - src/features/fields/FieldManager.module.css (overlay+panel → --z-modal)
  - src/features/profile/PhotoLightbox.module.css (overlay+content → --z-modal)
  - src/features/profile/ProfileSidebar.module.css (panel → --z-panel)
  - src/features/backup/BackupMenu.module.css (1000/1100 → --z-modal/--z-toast)
  - src/features/browse/BrowseList.module.css (header→--z-sticky, menu→--z-menu)
  - src/features/nav/NewEntityMenu.module.css (menu → --z-menu)
  - src/features/person-map/MapView.module.css (toolbar+bgHint → --z-chrome)
  - src/features/person-map/editor/LayersPanel.module.css (panel → --z-chrome)
  - src/features/person-map/editor/MapSwitcher.module.css (menu → --z-menu)
  - src/features/person-map/editor/PersonPicker.module.css (overlay/content → --z-popover/--z-popover-content)
  - src/features/person-map/editor/PortalTargetPicker.module.css (overlay/content → --z-popover/--z-popover-content)
  - src/features/person-map/editor/StylePopover.module.css (overlay/content → --z-popover/--z-popover-content)
  - tests/features/zIndexLayering.test.ts (new regression guard)
