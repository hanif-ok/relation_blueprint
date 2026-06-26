---
phase: 02-custom-fields-full-entity-model
verified: 2026-06-26T14:05:00Z
status: human_needed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "CR-01 / DATA-03 / SC-2 / D-05 — coerceOnTypeChange now wired into applyFieldTypeChange which is called by FieldEditor.handleSave on a type change; proven by tests/db/applyFieldTypeChange.test.ts (5 tests, all pass)"
    - "WR-01 — NaN guard in CustomFieldInputs.tsx number-case onChange (Number.isNaN guard at line 115)"
    - "WR-02 — tel: href sanitized to dialable characters in CustomFieldRows.tsx (line 158)"
    - "WR-04 — FieldManager.move stale-closure removed; movedField/movedLabel captured before await (lines 100-101)"
    - "WR-06 — reorderFieldDefs now emits per-field-id ChangeEvents (real FieldDef.id as entityId, not the entityType string)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run the Playwright E2E suite: npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts"
    expected: "All E2E specs pass. These cover SC-2 type-change coercion (now wired), SC-3 browse/list/sort, SC-5 lightbox keyboard nav, SC-6 gallery reorder+persistence, privacy notice dismissal, and delete-vs-remove correctness."
    why_human: "Cannot run Playwright without a running dev server and a browser session."
  - test: "In a running app: (a) define a text field on People, (b) set it to 'hello' on one person and '42' on another, (c) change the field type to Number in FieldManager and save. Inspect the profile for both people."
    expected: "The person with 'hello' shows the number input empty (value quarantined, not lost); the person with '42' shows the number 42. The caution copy was shown before save and the behavior matches the promise."
    why_human: "This is the D-05 runtime coercion verification — confirms the now-wired applyFieldTypeChange path executes correctly in a real browser session."
  - test: "Revert the field type back to Text and inspect the person whose value was quarantined."
    expected: "'hello' is restored to the live field value; the quarantine slot is cleared."
    why_human: "D-05 restore-on-revert invariant — requires inspecting Dexie state via the running app."
  - test: "Tab to the ViewSwitcher, press ArrowDown/Up through the five view items and two tool items. At viewport <=900px, confirm icon-only items have aria-label."
    expected: "Roving focus works; active item has ink left-edge bar; icon-only items are accessible."
    why_human: "Visual styling and keyboard interaction cannot be verified by grep."
---

# Phase 02: Custom Fields & Full Entity Model — Re-Verification Report

**Phase Goal:** A user can model their world fully — defining custom typed fields on any entity and working with all four first-class object types (People, Locations/Maps, Groups, Relationship-links) — and browse people and locations as lists.

**Verified:** 2026-06-26T14:05:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 02-06

---

## Re-Verification Summary

The previous `gaps_found` verdict had one BLOCKER: CR-01 (coerceOnTypeChange had zero production callers). Plan 02-06 was executed and all seven tasks were committed. This re-verification reads the actual source, runs `npx tsc --noEmit` (exit 0) and `npx vitest run` (24 files / 154 tests, all pass), and confirms the blocker is genuinely closed.

**The CR-01 BLOCKER is closed. All 6 success criteria are now VERIFIED at the code/test level.** Status is `human_needed` because SCs 1, 3, 5, 6 involve visual behavior, keyboard interaction, and E2E flows that require a running browser session.

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and use all four first-class object types (People, Locations/Maps, Groups, Relationship-links), each with a thumbnail, photo gallery, and profile | VERIFIED | All four interfaces in `types.ts`; Dexie version(2) tables in `schema.ts`; full repository CRUD in `repository.ts`; EntityForm wires all four types; ProfileSidebar renders all four types. Confirmed intact — no plan-06 changes touched these paths. |
| 2 | User can define custom typed fields (7 types) on any entity type — including the D-05 guarantee that a type change keeps convertible values and quarantines non-convertible originals (not deleted, restorable on revert) | VERIFIED | `applyFieldTypeChange` exported from `repository.ts` (line 547): one `db.transaction('rw', [table, db.fieldDefs], ...)` writes the patched def + coerces every entity value atomically; emits AFTER commit. `FieldEditor.handleSave` branches at line 88-94: `if (typeChanged)` calls `applyFieldTypeChange`, else `updateFieldDef`. `tests/db/applyFieldTypeChange.test.ts`: 5 tests (quarantine, keep-convertible, restore-on-revert, untouched-empty, persistence) — all pass. `coerceOnTypeChange` has real production callers at `repository.ts` lines 509 and 524. |
| 3 | User can browse all people as a list and all locations as a list, alongside direct map navigation | VERIFIED | BrowseList exists with `useLiveQuery(db.<table>.orderBy('name').toArray())`, `orderBy('updatedAt').reverse()` sort toggle, constant 64px row virtualization, loading shimmer, empty CTA, and "Recently updated" button. ViewSwitcher provides Map + 4 browse views. BrowseRow opens profile with `openedFrom='list'` via App.openFromList wiring. Confirmed intact. |
| 4 | Default fields stay minimal and a privacy/sensitivity notice is shown at setup | VERIFIED | PrivacyNotice exists with exact required copy; persisted in Dexie meta table; auto-shows on first entity/Drive connection; Nav "About/Privacy" re-opens. Confirmed intact. |
| 5 | User can click a photo in any profile gallery to open it full-size in a lightbox, then dismiss back to the profile | VERIFIED | PhotoLightbox exists built on Radix Dialog with ChevronLeft/Right/X glyphs, arrow-key handler, revokeObjectURL on change/unmount, boundary guards; PhotoGallery tiles call `onOpen(i)`; ProfileSidebar hosts lightbox state. Confirmed intact. |
| 6 | User can reorder or sort the photos in a profile gallery, and the chosen order persists | VERIFIED | PhotoUpload has drag-to-reorder via HTML5 drag events AND keyboard reorder (Space/arrow/Esc); aria-live region; "Thumbnail" badge; `onGalleryChange(reordered)` flows through EntityForm save to update fns persisting gallery order. Confirmed intact. |

**Score: 6/6 truths — all criteria now verified at the code/test level.**

---

### CR-01 Gap Closure Evidence

The three specific claims from the re-verification request, verified against actual source:

**1. `applyFieldTypeChange` exists in `src/db/repository.ts` and calls `coerceOnTypeChange` inside one rw transaction:**

- Exported at line 547: `export async function applyFieldTypeChange(entityType: DeletableEntityType, fieldId: string, patch: UpdateFieldDefPatch): Promise<FieldDef>`
- Single transaction at line 557: `await db.transaction('rw', [table, db.fieldDefs], async () => { ... })`
- `coerceOnTypeChange` called at lines 509 and 524 (inside `coerceEntityCustom` helper, itself called at line 577)
- Def patch written at line 571; entity values written at lines 582-593 (via `switch(entityType)` routing through correct zod schema parse)
- `updatedAt = Date.now()` and `dirty = true` stamped at line 579 for each touched entity
- Emits fire AFTER commit at lines 599-602 (mirrors `deleteEntity`/`reorderFieldDefs` pattern)
- Quarantine via `quarantineKey(fieldId)` (line 553) using `QUARANTINE_KEY_PREFIX = '__quarantine:'` (line 482); stored under reserved key inside existing `custom` map — ZERO schema change

**2. `FieldEditor.tsx` handleSave invokes `applyFieldTypeChange` on a type change:**

- Import at line 13: `import { applyFieldTypeChange, createFieldDef, updateFieldDef } from '@/db/repository';`
- Import type at line 14: `import type { DeletableEntityType } from '@/db/repository';`
- Branch at lines 87-97: `if (isEdit) { if (typeChanged) { await applyFieldTypeChange(entityType as DeletableEntityType, field!.id, patch); } else { await updateFieldDef(field!.id, patch); } }`
- Caution copy retained at line 141-144 with `data-testid="field-editor-caution"` — now truthful

**3. `tests/db/applyFieldTypeChange.test.ts` proves the wired path:**

- File exists at `tests/db/applyFieldTypeChange.test.ts`
- Imports `applyFieldTypeChange` and `quarantineKey` from `@/db/repository` (lines 13-18)
- 5 test cases covering: quarantine non-convertible (text→number "hello"), keep convertible ("42"→42), restore-on-revert (D-05 re-addable), untouched-empty (no spurious stamp), def-and-value atomicity
- `npx vitest run tests/db/applyFieldTypeChange.test.ts` — exit 0, 5/5 pass

---

### Warning Fixes Verified (WR-01/02/04/06)

| Warning | File | Evidence |
|---------|------|----------|
| WR-01 NaN guard | `src/features/entity-form/CustomFieldInputs.tsx` line 115 | `onChange(raw === '' \|\| Number.isNaN(n) ? null : n)` — partial numeric input stores null, not NaN |
| WR-02 tel: sanitization | `src/features/profile/CustomFieldRows.tsx` lines 156-160 | `const dialable = String(value).replace(/[^\d+*#,;]/g, '');` then `href={\`tel:${dialable}\`}` — no dangerouslySetInnerHTML (comment-only occurrence, zero JSX usage) |
| WR-04 stale-closure | `src/features/fields/FieldManager.tsx` lines 100-101 | `const movedField = list[index]; const movedLabel = movedField.label;` captured before await |
| WR-06 ChangeEvent contract | `src/db/repository.ts` lines 622-626 | `reorderFieldDefs` collects `reorderedIds` inside the transaction, then emits one event per real `FieldDef.id` — `entityId: entityType` string is gone (confirmed by grep returning no match) |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/repository.ts` | `applyFieldTypeChange`, `quarantineKey`, `QUARANTINE_KEY_PREFIX`, fixed `reorderFieldDefs` | VERIFIED | All four present and correct; `coerceOnTypeChange` is a real production caller (lines 509, 524) |
| `src/features/fields/FieldEditor.tsx` | handleSave branches to `applyFieldTypeChange` on type change | VERIFIED | Lines 87-97: branch on `typeChanged`; caution retained at line 141-144 |
| `tests/db/applyFieldTypeChange.test.ts` | Wired-path test: keep/quarantine/restore/persist | VERIFIED | 5 tests, all pass; imports `applyFieldTypeChange` + `quarantineKey` from `@/db/repository` |
| `src/features/entity-form/CustomFieldInputs.tsx` | NaN guard in number onChange | VERIFIED | `Number.isNaN` guard at line 115 |
| `src/features/profile/CustomFieldRows.tsx` | tel: href sanitized | VERIFIED | `dialable` var + `.replace(/[^\d+*#,;]/g, '')` at line 158 |
| `src/features/fields/FieldManager.tsx` | move() stale-closure removed | VERIFIED | `movedField`/`movedLabel` captured before await at lines 100-101 |
| All prior phase artifacts (SC-1, SC-3-6) | Unchanged and intact | VERIFIED | Confirmed by re-reading key files; no plan-06 changes touched SC-1/3/4/5/6 paths |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FieldEditor.tsx` | `repository.ts (applyFieldTypeChange)` | `handleSave` calls `applyFieldTypeChange` when `isEdit && typeChanged` | WIRED | Lines 13-14 import; line 94 call |
| `repository.ts (applyFieldTypeChange)` | `customValue.ts (coerceOnTypeChange)` | per-entity coercion inside one rw transaction via `coerceEntityCustom` helper | WIRED | `coerceOnTypeChange` imported at line 19; called at lines 509, 524 inside `coerceEntityCustom`; `coerceEntityCustom` called at line 577 inside `applyFieldTypeChange` |
| `tests/db/applyFieldTypeChange.test.ts` | `repository.ts` | imports `applyFieldTypeChange`, `quarantineKey`, `createPerson`, `getPerson`, `createFieldDef` | WIRED | Lines 13-18 imports; test bodies call `applyFieldTypeChange` directly through real Dexie |
| All prior wiring (SC-1/3/4/5/6) | (see previous VERIFICATION) | Unchanged | WIRED | No plan-06 modifications touched these paths |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `applyFieldTypeChange` wired path: quarantine/keep/restore/persist | `npx vitest run tests/db/applyFieldTypeChange.test.ts` | exit 0, 5/5 tests pass | PASS |
| Full test suite regression | `npx vitest run` | exit 0, 24 files / 154 tests pass | PASS |
| TypeScript compile | `npx tsc --noEmit` | exit 0 (no output) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DATA-01 | 02-01, 02-03 | User can create four first-class object types | SATISFIED | All four types in repository + EntityForm + browse lists; entity creation flows end-to-end |
| DATA-03 | 02-01, 02-04, 02-06 | User can define custom typed fields (7 types) on any entity type, with D-05 type-change coercion | SATISFIED | Create/render/validate + type-change coercion now fully wired via `applyFieldTypeChange`; proven by 5-test spec |
| BRWS-01 | 02-03 | User can browse all people as a list | SATISFIED | BrowseList people view with useLiveQuery, sort, virtualization, row→profile |
| BRWS-02 | 02-03 | User can browse all locations as a list alongside map navigation | SATISFIED | BrowseList maps view; ViewSwitcher provides Map + Locations; Show-on-map in BrowseRow |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX debt markers in any plan-06 modified file | — | — |

Prior WARNING anti-patterns from the initial verification (WR-01/02/04/06) are all closed — see "Warning Fixes Verified" section above. The initial BLOCKER anti-pattern (CR-01: caution copy advertising unwired behavior) is closed by the `applyFieldTypeChange` wiring.

---

### Human Verification Required

#### 1. E2E suite

**Test:** Run `npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts`
**Expected:** All pass. These specs cover SC-2 type-change coercion (now wired), SC-3 browse/list/sort, SC-5 lightbox keyboard nav, SC-6 gallery reorder+persistence, privacy notice dismissal, and delete-vs-remove correctness.
**Why human:** Cannot run Playwright without a running dev server and browser session.

#### 2. D-05 coercion runtime check (SC-2 — now wired, confirm correct behavior in the app)

**Test:** In a running app: (a) define a text field on People, (b) set it to "hello" on one person and "42" on another, (c) change the field type to Number in FieldManager. Inspect the profile for both people.
**Expected:** "hello" person shows the number input empty (value quarantined, not lost); "42" person shows the number 42. The D-05 caution copy was shown before save and the behavior matches the promise.
**Why human:** Confirms the wired `applyFieldTypeChange` path executes correctly in a real browser session against a real Dexie database.

#### 3. D-05 restore-on-revert runtime check

**Test:** After the type-change above, revert the field type back to Text. Inspect the person whose value was quarantined ("hello").
**Expected:** "hello" is restored to the live field value; the quarantine slot is cleared.
**Why human:** D-05 restore-on-revert invariant requires confirming via the running app / Dexie state.

#### 4. Nav roving focus and active-item styling

**Test:** Tab to the ViewSwitcher, press ArrowDown/Up through the five view items and two tool items. At viewport width ≤900px, confirm icon-only items have aria-label. Confirm the active item has an ink left-edge bar (not amber).
**Expected:** Roving focus works; active item styled correctly; icon-only items are accessible.
**Why human:** Visual styling and keyboard interaction cannot be verified by grep.

---

### Deferred Items

None. No items deferred to later milestone phases.

---

### Gaps Summary

No gaps remain. The single BLOCKER gap (CR-01 / DATA-03 / SC-2 / D-05) from the initial verification is genuinely closed:

- `coerceOnTypeChange` now has two production callers in `src/db/repository.ts` (lines 509, 524) — both inside `coerceEntityCustom`, which is called from `applyFieldTypeChange`.
- `FieldEditor.handleSave` branches on `typeChanged` and calls `applyFieldTypeChange` (not just `updateFieldDef`) when the type changes.
- The wired path is proven by `tests/db/applyFieldTypeChange.test.ts` (5 tests covering keep, quarantine, restore-on-revert, untouched-empty, and def/value atomicity).
- `npx tsc --noEmit` exits 0; `npx vitest run` exits 0 (24 files / 154 tests).

Status is `human_needed` because SCs 1, 3, 5, 6 involve visual behavior and keyboard interaction requiring a browser session, and the D-05 runtime behavior merits a live smoke-test to confirm the wiring executes as expected.

---

_Verified: 2026-06-26T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — gap-closure plan 02-06_
