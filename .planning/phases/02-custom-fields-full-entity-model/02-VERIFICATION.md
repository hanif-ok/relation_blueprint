---
phase: 02-custom-fields-full-entity-model
verified: 2026-06-26T00:00:00Z
status: gaps_found
score: 5/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "User can define custom typed fields (text, number, date, phone, tags/select, link-to-entity, photo) on any entity type, and those fields render AND validate correctly in profiles — including the D-05 guarantee that a type change keeps values that still fit and sets aside others"
    status: partial
    reason: "The create+render+validate path is fully wired and functional. The type-change coercion sub-behavior (D-05) is implemented in coerceOnTypeChange and unit-tested but has ZERO production callers. FieldEditor.handleSave calls only updateFieldDef(field.id, patch) and never touches entity.custom values. The UI displays the caution text promising the behavior; the behavior does not execute. See criterion 2 / DATA-03 evidence below."
    artifacts:
      - path: "src/features/fields/FieldEditor.tsx"
        issue: "handleSave (lines 76-92) calls updateFieldDef but never iterates the entity table to run coerceOnTypeChange on existing custom values. The caution shown to the user (line 131-134) promises behavior that is absent."
      - path: "src/features/fields/customValue.ts"
        issue: "coerceOnTypeChange (lines 86-130) is exported and unit-tested but has no production caller. grep of src/ confirms it is only defined here and imported in its test."
    missing:
      - "Wire coerceOnTypeChange into FieldEditor.handleSave: when isEdit && field.type !== type, iterate the affected entity table in one rw transaction and write back kept values (or stash quarantined originals). Remove or correct the UI caution if this wiring is deferred."
---

# Phase 02: Custom Fields & Full Entity Model — Verification Report

**Phase Goal:** A user can model their world fully — defining custom typed fields on any entity and working with all four first-class object types (People, Locations/Maps, Groups, Relationship-links) — and browse people and locations as lists.

**Verified:** 2026-06-26
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and use all four first-class object types (People, Locations/Maps, Groups, Relationship-links), each with a thumbnail, photo gallery, and profile | VERIFIED | All four interfaces exist in `types.ts`; Dexie version(2) tables present in `schema.ts`; full repository CRUD (`createGroup`, `createRelationshipLink`, `updateMap`, etc.) present in `repository.ts`; EntityForm wires all four types to their respective create/update fns; ProfileSidebar renders all four types from their respective tables |
| 2 | User can define custom typed fields (text, number, date, phone, tags/select, link-to-entity, photo) on any entity type, and those fields render AND validate correctly in profiles | PARTIAL — BLOCKER | **Create+render+validate path:** fully wired (FieldManager->FieldEditor->createFieldDef; CustomFieldRows reads listFieldDefs; EntityForm calls validateCustomValue before save). **Type-change coercion (D-05):** `coerceOnTypeChange` exists and is unit-tested but has ZERO production callers. `FieldEditor.handleSave` (lines 76-92) calls only `updateFieldDef` and never iterates entity tables to apply coercion. UI shows caution copy promising the behavior; the behavior does not run. |
| 3 | User can browse all people as a list and all locations as a list, alongside direct map navigation | VERIFIED | BrowseList exists with `useLiveQuery(db.<table>.orderBy('name').toArray())` (line 80), `orderBy('updatedAt').reverse()` sort toggle, constant 64px row virtualization, loading shimmer, empty CTA, and "Recently updated" button. ViewSwitcher provides Map + 4 browse views. BrowseRow opens profile with `openedFrom='list'` via App.openFromList wiring. |
| 4 | Default fields stay minimal and a privacy/sensitivity notice is shown at setup | VERIFIED | PrivacyNotice exists with exact required copy ("A note on the people you record." / "Got it" / body). Persisted in Dexie meta table (`db.meta.put({ key: 'privacyNoticeDismissed', value: true })`). Auto-shows when `privacyDismissed === false` and an entity exists or Drive is connected. Nav "About/Privacy" re-opens without rewriting the flag. |
| 5 | User can click a photo in any profile gallery to open it full-size in a lightbox, then dismiss back to the profile | VERIFIED | PhotoLightbox exists built on Radix Dialog; uses ChevronLeft/ChevronRight/X glyphs; prev/next disabled-with-state at boundary (never no-op); arrow-key handler; revokeObjectURL on change/unmount; PhotoGallery tiles are buttons that call `onOpen(i)`; ProfileSidebar hosts lightbox state and wires `openLightbox` to both PhotoGallery and CustomFieldRows Photo thumbnails. |
| 6 | User can reorder or sort the photos in a profile gallery, and the chosen order persists | VERIFIED | PhotoUpload has drag-to-reorder via HTML5 drag events AND keyboard reorder (Space pick / arrow move / Space drop / Esc cancel); aria-live region announces moves; first tile badged "Thumbnail"; `onGalleryChange(reordered)` flows through EntityForm save to updatePerson/updateGroup/etc. persisting gallery: MediaRef[] order. |

**Score: 5/6 truths — criterion 2 is PARTIAL due to the type-change coercion gap (SC-2 core path WORKS; D-05 sub-behavior absent).**

---

### Deferred Items

None identified — no gaps are addressed in a later milestone phase.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/types.ts` | Group, RelationshipLink, FieldDef, FieldType, CustomValues, EntityType | VERIFIED | All present at correct lines; EntityType union includes 'groups' and 'relationship-links' |
| `src/domain/schemas.ts` | GroupSchema, RelationshipLinkSchema, FieldDefSchema, CustomValuesSchema, satisfies locks | VERIFIED | All present; PersonSchema and MapDocSchema include custom: CustomValuesSchema |
| `src/db/schema.ts` | version(2).stores adding groups, relationshipLinks, fieldDefs | VERIFIED | Lines 71-75: version(2) adds all three tables with correct index strings |
| `src/db/repository.ts` | createGroup/updateGroup, createRelationshipLink/updateRelationshipLink, updateMap, createFieldDef/updateFieldDef/reorderFieldDefs/softDeleteFieldDef/listFieldDefs, deleteMarker, deleteEntity | VERIFIED | All present; softDeleteFieldDef delegates to updateFieldDef with deleted:true (NOT a row delete); deleteMarker is marker-only with no cascade; deleteEntity is generalized with all-types GC sweep |
| `src/features/fields/FieldManager.tsx` | Per-type field manager with listFieldDefs, reorderFieldDefs, keyboard reorder + aria-live, soft-delete via neutral confirm | VERIFIED | aria-live region at line 218; keyboard reorder via ArrowUp/Down on grip handle; Remove uses ConfirmDialog (neutral, not brick) calling softDeleteFieldDef |
| `src/features/fields/FieldEditor.tsx` | All 7 field types, Required toggle, Tags options, link-to-entity targetType, type-change caution, soft-delete confirm | VERIFIED (except coercion wiring — see gap) | All 7 types in FIELD_TYPES; Required toggle; Tags options editor; link-to-entity targetType select; caution shown at typeChanged; Save calls createFieldDef/updateFieldDef |
| `src/features/fields/customValue.ts` | validateCustomValue, coerceOnTypeChange | VERIFIED (module exists and is correct) | Both exported and unit-tested; coerceOnTypeChange has zero production callers — the gap |
| `src/features/entity-form/CustomFieldInputs.tsx` | Typed inputs for all 7 types, keyed by def.id, calls validateCustomValue | VERIFIED | Keys draft by `def.id` (line 247); validateCustomValue called in EntityForm.handleSave (lines 177-187); all 7 types rendered |
| `src/features/profile/CustomFieldRows.tsx` | Read rendering by type, "(removed)" for missing link target, tel: link for phone, empty rows omitted | VERIFIED | "(removed)" at line 91-96; tel: link at line 157; isEmpty guard at line 205 omits empty rows |
| `src/features/browse/BrowseList.tsx` | Virtualized list, orderBy('name') and orderBy('updatedAt'), sort toggle, loading/empty/error states | VERIFIED | useLiveQuery with both orderings; constant 64px ROW_HEIGHT windowing; shimmer loading; empty state with CTA |
| `src/features/browse/BrowseRow.tsx` | 64px row, thumbnail/initials/glyph, Show-on-map disabled-with-tooltip for non-spatial, opens profile in list context | VERIFIED | Show-on-map disabled={!spatial} (line 116) with aria-label fallback via showOnMapDisabledReason; row click calls onOpen() which wires to openFromList in App |
| `src/features/onboarding/PrivacyNotice.tsx` | One-time dismissible dialog, exact title/body/dismiss copy, persisted flag | VERIFIED | Exact PRIVACY_TITLE and PRIVACY_BODY constants; "Got it" dismiss; App wires dismissal to db.meta.put |
| `src/features/profile/PhotoLightbox.tsx` | Radix Dialog, ChevronLeft/Right/X, arrow keys, revokeObjectURL, disabled at boundary | VERIFIED | All three glyphs imported and used; useFullRes revokes URL on change/unmount (lines 65-68); atFirst/atLast guards |
| `src/features/person-form/PhotoUpload.tsx` | Drag+keyboard reorder, aria-live, Thumbnail badge, onGalleryChange | VERIFIED | GripVertical handle; Space/arrow/Esc keyboard reorder; aria-live region at line 312; "Thumbnail" badge at line 133 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FieldManager.tsx` | `repository.ts` | `createFieldDef`, `reorderFieldDefs`, `softDeleteFieldDef` | WIRED | Imports and calls all three at lines 17, 100, 240 |
| `CustomFieldRows.tsx` | `repository.ts` | `listFieldDefs(entityType)` | WIRED | Line 198: useLiveQuery(() => listFieldDefs(entityType)) |
| `CustomFieldInputs.tsx` | `customValue.ts` | `validateCustomValue` | WIRED (via EntityForm) | EntityForm.handleSave calls validateCustomValue per def (lines 177-187); errors passed to CustomFieldInputs via `errors` prop |
| `BrowseList.tsx` | `db/schema.ts` | `useLiveQuery(db.<table>.orderBy(...))` | WIRED | Line 80-81: both orderings via useLiveQuery |
| `BrowseRow.tsx` | `ProfileSidebar.tsx` | Row click -> App.openFromList -> setProfile with openedFrom='list' | WIRED | App line 163: openFromList sets openedFrom='list'; BrowseList passes onOpen to BrowseRow |
| `EntityForm.tsx` | `repository.ts` | `createGroup`, `createRelationshipLink`, `createMap`, `createPerson` (and update variants) | WIRED | Lines 17-26: all four create and update fns imported and called in handleSave per entityType |
| `PhotoGallery.tsx` | `PhotoLightbox.tsx` | Tile click opens lightbox at that index | WIRED | ProfileSidebar lines 304-308: PhotoGallery onOpen wired to openLightbox; PhotoLightbox mounted with lightbox state |
| `PhotoUpload.tsx` | `repository.ts` | `onGalleryChange` -> EntityForm save -> update fn persists gallery: MediaRef[] order | WIRED | EntityForm lines 231-233: gallery included in save payload |
| `FieldEditor.tsx` (type-change) | `customValue.ts` (`coerceOnTypeChange`) | NOT WIRED — see gap | NOT WIRED | `coerceOnTypeChange` is imported nowhere in src/ (grep confirms); FieldEditor.handleSave at lines 76-92 calls updateFieldDef only |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `BrowseList.tsx` | `rows` (BrowseEntity[]) | `useLiveQuery(db.<table>.orderBy(...).toArray())` | Yes — live Dexie query | FLOWING |
| `CustomFieldRows.tsx` | `defs` (FieldDef[]) | `useLiveQuery(() => listFieldDefs(entityType))` | Yes — live Dexie query | FLOWING |
| `CustomFieldInputs.tsx` | `defs` (FieldDef[]) | `useLiveQuery(() => listFieldDefs(entityType))` | Yes — live Dexie query | FLOWING |
| `ProfileSidebar.tsx` | `entity` (AnyEntity) | `useLiveQuery` reading per-type Dexie table by id | Yes — live Dexie query | FLOWING |
| `PhotoLightbox.tsx` | `load.url` | `resolveMediaUrl(hash)` creating object URL from `db.media` blob | Yes — real blob | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: No runnable entry points can be tested without a browser/Playwright session. Custom-field E2E specs exist (`e2e/custom-fields.spec.ts`, `e2e/browse-and-create.spec.ts`, `e2e/lightbox.spec.ts`, `e2e/gallery-reorder.spec.ts`, `e2e/privacy-notice.spec.ts`, `e2e/delete-vs-remove.spec.ts`). Cannot execute without a running server — routes to human verification below.

Unit spot-check: `tests/fields/customValue.test.ts` exists and covers validateCustomValue and coerceOnTypeChange. Vitest run not performed in this pass; test existence confirmed by grep.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DATA-01 | 02-01, 02-03 | User can create four first-class object types | SATISFIED | All four types in repository + EntityForm + browse lists; entity creation flows end-to-end |
| DATA-03 | 02-01, 02-04 | User can define custom typed fields (7 types) on any entity type | PARTIAL — BLOCKER | Create/render/validate path fully wired; type-change coercion (D-05) unwired; see gap |
| BRWS-01 | 02-03 | User can browse all people as a list | SATISFIED | BrowseList people view with useLiveQuery, sort, virtualization, row→profile |
| BRWS-02 | 02-03 | User can browse all locations as a list alongside map navigation | SATISFIED | BrowseList maps view; ViewSwitcher provides Map + Locations; Show-on-map in BrowseRow |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/features/fields/FieldEditor.tsx` | 131-134 | UI shows caution copy promising D-05 coercion behavior that does not run | BLOCKER | User is deceived: after a type change all entities retain old-shaped values silently; rendering a `number` input against a leftover string is a functional failure |
| `src/features/entity-form/CustomFieldInputs.tsx` | 112 | `onChange(raw === '' ? null : Number(raw))` — Number(raw) can produce NaN for partial numeric input (e.g. trailing 'e', '-'), which serializes to null via JSON.stringify silently | WARNING | Lossy NaN->null round-trip through sync/export; validateCustomValue would catch it on save but the NaN can reach Dexie |
| `src/features/profile/CustomFieldRows.tsx` | 157 | `href={\`tel:${String(value)}\`}` — unvalidated phone string interpolated into tel: href | WARNING | Any string is accepted as phone (type-only check); URL control characters could craft a non-phone URI; not XSS but an unsanitized URL pattern |
| `src/db/repository.ts` | 485 | `emit({ entityType: 'fieldDefs', entityId: entityType, op: 'update' })` in reorderFieldDefs — entityType string passed as entityId | WARNING | Violates ChangeEvent contract (entityId should be a record id); latent bug for any future per-id subscriber |
| `src/features/fields/FieldManager.tsx` | 94-102 | `move()` reads stale closure `list` for both the reorder ids and the announcement after awaiting reorderFieldDefs | WARNING | On rapid successive keypresses, stale `list` can produce incorrect final order |

No `TBD`, `FIXME`, or `XXX` debt markers found in phase-modified files.

---

### Human Verification Required

These items require a running browser session to verify:

#### 1. E2E suite green

**Test:** Run `npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts`
**Expected:** All pass. The specs exercise SC-2 through SC-6 end-to-end including (removed) handling, sort toggle, lightbox keyboard nav, gallery persistence, and the delete-vs-remove correctness fix.
**Why human:** Cannot run Playwright without a browser; server must be running.

#### 2. Custom field type-change gap — decision required

**Test:** In a running app, (a) define a text field on People, (b) fill it with "hello" on one person, (c) change the field type to Number in the field manager. Observe whether "hello" is set aside or silently left as a stale string under the number input.
**Expected per spec:** The caution copy says "others are set aside, not deleted." The stored value should be quarantined and not rendered in the number input; the person's `custom[fieldId]` should be in a quarantine store or absent.
**Expected actual (verified by code):** The stale string "hello" remains in `entity.custom[fieldId]`. The number input in the form binds `value={typeof value === 'number' ? value : ''}` (CustomFieldInputs line 108) so it silently shows empty, but the bad value is still stored. The profile `CustomValueView` for 'number' calls `String(value)` showing "hello" as text.
**Why human:** This is the CR-01 gap. A developer must decide: fix `FieldEditor.handleSave` to wire coercion, OR explicitly defer and remove the caution copy.

#### 3. Nav roving focus and active-item styling

**Test:** Tab to the ViewSwitcher, press ArrowDown/Up through the five view items and two tool items. Confirm: (a) focus moves correctly, (b) the active item has an ink left-edge bar and is NOT amber, (c) collapsed-to-icon-only view (at ≤900px) items still have aria-label.
**Expected:** Roving focus works; active item is ink/paper only; icon-only items are labelled.
**Why human:** Visual styling and keyboard interaction cannot be verified by grep.

---

### Gaps Summary

**One blocker gap prevents this phase from being marked passed.**

**CR-01: Type-change coercion unwired (DATA-03 / SC-2 / D-05)**

`coerceOnTypeChange` in `src/features/fields/customValue.ts` (lines 86-130) is correctly implemented and covered by unit tests, but it has no production caller anywhere in `src/`. When a user edits a field definition's type in `FieldEditor` and clicks "Save field", `handleSave` (lines 76-92) calls only `updateFieldDef(field!.id, patch)` — it never iterates the affected entity table to apply coercion.

The caution message displayed to the user ("Changing the type keeps values that still fit; others are set aside, not deleted.") is false advertising for a behavior that does not run.

**Consequences confirmed by reading the code:**
- `CustomFieldInputs` number input shows empty for a leftover string value (it guards `typeof value === 'number'`), but the string is still stored in Dexie under `custom[fieldId]`.
- `CustomFieldRows` number view calls `String(value)` — after a text->number change it will render "hello" as a number row.
- `validateCustomValue` will flag "hello" as invalid on the user's next save of that entity.
- The D-05 "set aside, not deleted / re-addable" quarantine mechanism does not exist at runtime.

**Path to closure:** Wire coercion into `FieldEditor.handleSave` per the CR-01 fix sketch in `02-REVIEW.md` (iterate the entity table in one rw transaction, apply `coerceOnTypeChange`, persist `kept` or stash `quarantined`). Alternatively, explicitly defer this sub-behavior, remove the caution copy from the UI, and document the decision — in which case D-05 type-change coercion should be a named gap in a future phase plan.

**The create + render + validate path for custom fields (defining a new field, filling values, and seeing them render in profiles) is fully wired and functional.** The gap is specifically the type-change value-retention sub-behavior.

---

**Note on Code Review Finding CR-02 (avatar URL leak):** The review flags `useBlobImage` as not revoking its URL. Reading `src/features/person-map/useMapImage.ts` (lines 12-37) shows the effect cleanup at line 31 explicitly calls `URL.revokeObjectURL(url)`. The URL is revoked on cleanup / blob change. CR-02 is a false positive — the lifecycle is correct.

---

_Verified: 2026-06-26_
_Verifier: Claude (gsd-verifier)_
