---
phase: 02-custom-fields-full-entity-model
verified: 2026-06-26T14:35:00Z
status: human_needed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "CR-01 BLOCKER (from 02-REVIEW.md): multi-hop quarantine-overwrite data loss — quarantineKey(fieldId, sourceType) now produces a source-type-keyed reserved key so successive quarantines from different source types write distinct keys and cannot clobber each other. The single unconditional slot overwrite (next[qKey] = result.quarantined) is gone; replaced by next[quarantineKey(fieldId, fromType)]. Closed by commits 171bce5 + b0379f2."
    - "WR-01 (review warning): restore branch now resolves from quarantineKey(fieldId, toType) — a verbatim assignment, no coerceOnTypeChange fitness call — removing the in-flight from->to pair ambiguity. Closed by 171bce5."
    - "WR-02 (review warning): CustomFieldRows.tsx tags case now guards with (Array.isArray(value) ? value : []).map(...) before calling .map, preventing a crash on a non-array value. Closed by 5ef3a42."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run the Playwright E2E suite: npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts"
    expected: "All E2E specs pass. These cover SC-2 type-change coercion (wired), SC-3 browse/list/sort, SC-5 lightbox keyboard nav, SC-6 gallery reorder+persistence, privacy notice dismissal, and delete-vs-remove correctness."
    why_human: "Cannot run Playwright without a running dev server and a browser session."
  - test: "In a running app: (a) define a text field on People, (b) set it to 'hello' on one person and '42' on another, (c) change the field type to Number in FieldManager and save. Inspect both profiles."
    expected: "The 'hello' person shows the number input empty (value quarantined, not lost); the '42' person shows the number 42. The caution copy was shown before save and the behavior matches the promise."
    why_human: "D-05 runtime coercion verification — confirms applyFieldTypeChange executes correctly in a real browser session against a real Dexie database."
  - test: "After the type-change above, revert the field type back to Text and inspect the person whose value was quarantined."
    expected: "'hello' is restored to the live field value; the quarantine slot is cleared."
    why_human: "D-05 restore-on-revert invariant — requires inspecting Dexie state via the running app."
  - test: "Perform two successive quarantining type changes: text->number (quarantines 'hello'), then enter 5 as the number value, then change number->date (quarantines 5 under the number key). Inspect the Dexie record in DevTools."
    expected: "custom map holds __quarantine:<id>:text = 'hello' AND __quarantine:<id>:number = 5 simultaneously. Neither was clobbered."
    why_human: "Multi-hop CR-01 fix runtime proof — confirms preserve-both behavior in a real browser/Dexie session (exercised by the regression test but good to confirm live)."
  - test: "Tab to the ViewSwitcher, press ArrowDown/Up through the five view items and two tool items. At viewport <=900px, confirm icon-only items have aria-label. Confirm the active item has an ink left-edge bar."
    expected: "Roving focus works; active item styled correctly; icon-only items are accessible."
    why_human: "Visual styling and keyboard interaction cannot be verified by grep."
---

# Phase 02: Custom Fields & Full Entity Model — Re-Verification Report (after 02-07)

**Phase Goal:** A user can model their world fully — defining custom typed fields on any entity and working with all four first-class object types (People, Locations/Maps, Groups, Relationship-links) — and browse people and locations as lists.

**Verified:** 2026-06-26T14:35:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plans 02-06 and 02-07

---

## Re-Verification Summary

The previous `human_needed` verdict (after 02-06) had a new BLOCKER surfaced by 02-REVIEW.md: a multi-hop quarantine-overwrite data-loss bug where the single reserved slot `__quarantine:<fieldId>` was overwritten by a second quarantining type change, silently destroying the first quarantined original. Plan 02-07 was executed (3 commits: 171bce5, b0379f2, 5ef3a42) and all three issues from the code review are now closed.

**This re-verification reads the actual source files and runs the compiler and test suite. It does NOT trust SUMMARY.md claims.**

**The CR-01 data-loss BLOCKER from 02-REVIEW.md is closed. All 6 success criteria remain VERIFIED at the code/test level.** Status stays `human_needed` because SCs 1, 3, 5, 6 involve visual behavior, keyboard interaction, and E2E flows that require a running browser session.

---

## 02-07-Specific Fix Verification

### Claim 1: quarantineKey(fieldId, sourceType) produces a source-type-keyed reserved key

**Source:** `src/db/repository.ts` lines 493-495

```ts
export function quarantineKey(fieldId: string, sourceType: FieldType): string {
  return `${QUARANTINE_KEY_PREFIX}${fieldId}:${sourceType}`;
}
```

VERIFIED. The function signature now takes two arguments `(fieldId, sourceType)` and produces `__quarantine:<fieldId>:<sourceType>`. The key prefix `__quarantine:` is preserved, so the Phase-5 prefix-skip contract is unchanged.

### Claim 2: The unconditional single-slot overwrite is GONE; coerceEntityCustom stores under FROM-type key and restores from TO-type key

**Source:** `src/db/repository.ts` lines 520-551

The old pattern `next[qKey] = result.quarantined` (unconditional overwrite, single slot per field) is completely absent — grep for `next[qKey]` returns zero matches in the entire file.

The replacement (lines 534-538):
```ts
} else {
  next[quarantineKey(fieldId, fromType)] = result.quarantined;
  next[fieldId] = null;
  changed = true;
}
```

Stores the non-convertible original under its SOURCE type's reserved key. Two successive quarantines from different source types (e.g. `fromType='text'` and later `fromType='number'`) write `__quarantine:<id>:text` and `__quarantine:<id>:number` respectively — distinct keys that cannot collide.

The restore branch (lines 541-549):
```ts
const restoreKey = quarantineKey(fieldId, toType);
const quarantined = next[restoreKey];
if (quarantined !== undefined && quarantined !== null) {
  next[fieldId] = quarantined;
  delete next[restoreKey];
  changed = true;
}
```

Resolves by the TO-type key. A value keyed by `toType` was set aside when the field last WAS `toType`, so it fits `toType` by construction — no `coerceOnTypeChange` fitness call needed (closes WR-02 / restore-ambiguity WARNING from the review).

VERIFIED. Both the STORE path and the RESTORE path implement the correct source-type-keyed design.

### Claim 3: Multi-hop regression test exists and passes

**Source:** `tests/db/applyFieldTypeChange.test.ts` lines 125-192

Test name: `'preserves BOTH originals across two successive quarantines and restores each on revert'`

The test executes the exact data-loss scenario from the code review:
1. `text -> number`: `'hello'` quarantined under `quarantineKey(def.id, 'text')`. VERIFIED at step1 assertion.
2. Curator enters `5` as live number value.
3. `number -> date`: `5` quarantined under `quarantineKey(def.id, 'number')`. Critical assertion at step3: `expect(step3?.custom[textKey]).toBe('hello')` — proves the text original was NOT clobbered.
4. `date -> number` revert: `5` restored from the number key; text key untouched.
5. `number -> text` revert: `'hello'` restored from the text key; text key cleared.

**Test run result:** `npx vitest run tests/db/applyFieldTypeChange.test.ts` — exit code 0, **6 tests pass** (previous verification reported 5; the multi-hop test is the 6th, added by 02-07 commit b0379f2).

### Claim 4: Review WARNING closures

**WR-01 (restore-ambiguity WARNING):** Closed by the restore-path redesign above. Restore resolves from `quarantineKey(fieldId, toType)` directly — no in-flight `from->to` fitness judgment.

**WR-02 (unguarded tags cast):** `src/features/profile/CustomFieldRows.tsx` line 178:
```tsx
{(Array.isArray(value) ? (value as string[]) : []).map((tag) => (
```
`Array.isArray` guard is present. A non-array value renders no chips instead of throwing. VERIFIED.

### Claim 5: No schema/serializer/backup change

**Source:** Commit 171bce5 diff stat — only `src/db/repository.ts` was modified (1 file, 34 insertions, 16 deletions). Commit b0379f2 — only `tests/db/applyFieldTypeChange.test.ts`. Commit 5ef3a42 — only `src/features/profile/CustomFieldRows.tsx` (1 insertion, 1 deletion).

No changes to `src/db/schema.ts`, `src/db/serializer.ts`, `src/domain/schemas.ts`, or any backup/export file. Quarantine still rides inside the existing `custom` map under reserved keys — zero schema change. VERIFIED.

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and use all four first-class object types (People, Locations/Maps, Groups, Relationship-links), each with a thumbnail, photo gallery, and profile | VERIFIED | All four interfaces in `types.ts`; Dexie version(2) tables in `schema.ts`; full CRUD in `repository.ts` (createPerson/Map/Group/RelationshipLink + update + deleteEntity); EntityForm wires all four; ProfileSidebar renders all four. Unchanged by 02-07. |
| 2 | User can define custom typed fields (7 types) on any entity type — including D-05: type change keeps convertible values, quarantines non-convertible originals (not deleted, restorable on revert), and multi-hop quarantines preserve all originals | VERIFIED | `quarantineKey(fieldId, sourceType)` → `__quarantine:<id>:<sourceType>`; `coerceEntityCustom` stores under FROM-type key, restores from TO-type key; unconditional single-slot overwrite is gone; `applyFieldTypeChange` wires this in one rw transaction; `FieldEditor.handleSave` branches on `typeChanged` to call `applyFieldTypeChange`; 6 tests (including multi-hop regression) all pass. |
| 3 | User can browse all people as a list and all locations as a list, alongside direct map navigation | VERIFIED | BrowseList with `useLiveQuery`, sort toggle, row virtualization, loading shimmer, empty CTA; ViewSwitcher provides Map + 4 browse views; BrowseRow opens profile via App.openFromList. Unchanged by 02-07. |
| 4 | Default fields stay minimal and a privacy/sensitivity notice is shown at setup | VERIFIED | PrivacyNotice exists with required copy; persisted in Dexie meta; auto-shows on first entity/Drive connection; Nav "About/Privacy" re-opens. Unchanged by 02-07. |
| 5 | User can click a photo in any profile gallery to open it full-size in a lightbox, then dismiss back to the profile | VERIFIED | PhotoLightbox built on Radix Dialog with ChevronLeft/Right/X glyphs, arrow-key handler, revokeObjectURL on unmount, boundary guards; PhotoGallery tiles call onOpen(i); ProfileSidebar hosts lightbox state. Unchanged by 02-07. |
| 6 | User can reorder or sort the photos in a profile gallery, and the chosen order persists | VERIFIED | PhotoUpload has drag-to-reorder via HTML5 drag events AND keyboard reorder (Space/arrow/Esc); aria-live region; "Thumbnail" badge; onGalleryChange(reordered) flows through EntityForm save to update functions. Unchanged by 02-07. |

**Score: 6/6 truths — all criteria verified at the code/test level.**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/repository.ts` | `quarantineKey(fieldId, sourceType)` 2-arg form; STORE uses FROM-type key; RESTORE uses TO-type key; single-slot overwrite gone | VERIFIED | Lines 493-495 (function), 535 (STORE), 543-548 (RESTORE); `next[qKey]` pattern has zero occurrences in the file |
| `tests/db/applyFieldTypeChange.test.ts` | Multi-hop regression test: two successive quarantines preserve BOTH originals; each restores on revert | VERIFIED | Test at lines 125-192; 6 tests total; exit code 0 confirmed by direct run |
| `src/features/profile/CustomFieldRows.tsx` | `Array.isArray` guard before `.map` on tags value | VERIFIED | Line 178: `(Array.isArray(value) ? (value as string[]) : []).map(...)` |
| All prior phase artifacts (SC-1, SC-3-6) | Unchanged and intact | VERIFIED | 02-07 touched only 3 files (repository.ts, applyFieldTypeChange.test.ts, CustomFieldRows.tsx); no SC-1/3/4/5/6 paths modified |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FieldEditor.tsx` | `repository.ts (applyFieldTypeChange)` | `handleSave` branches on `typeChanged` | WIRED | Unchanged from previous verification; import at line 13, call at line 94 |
| `repository.ts (coerceEntityCustom)` | `customValue.ts (coerceOnTypeChange)` | Called inside one rw transaction | WIRED | Unchanged; `coerceOnTypeChange` called at lines 524 (coerce) inside `coerceEntityCustom`; `coerceEntityCustom` called from `applyFieldTypeChange` |
| `coerceEntityCustom` STORE branch | `quarantineKey(fieldId, fromType)` | `next[quarantineKey(fieldId, fromType)] = result.quarantined` | WIRED | Line 535; source-type-keyed; preserves earlier originals under distinct keys |
| `coerceEntityCustom` RESTORE branch | `quarantineKey(fieldId, toType)` | `const restoreKey = quarantineKey(fieldId, toType)` | WIRED | Lines 543-548; verbatim restore, no fitness call |
| `tests/db/applyFieldTypeChange.test.ts` | `repository.ts` | imports `applyFieldTypeChange`, `quarantineKey`, crud functions | WIRED | Lines 13-19; test bodies drive real Dexie via fake-indexeddb |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| quarantineKey 2-arg form compiles | `npx tsc --noEmit` | exit 0 (no output) | PASS |
| Multi-hop regression + single-cycle tests | `npx vitest run tests/db/applyFieldTypeChange.test.ts` | exit 0, **6 tests pass** | PASS |
| Full test suite regression | `npx vitest run --no-file-parallelism` | exit 0, 24 files / **155 tests pass** | PASS |

Note: 02-07 added 1 test (the multi-hop regression). Previous verification reported 154 total; current is 155. This increase is the expected evidence of the new test.

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DATA-01 | 02-01, 02-03 | User can create four first-class object types | SATISFIED | All four entity types in repository + EntityForm + browse lists |
| DATA-03 | 02-01, 02-04, 02-06, 02-07 | User can define custom typed fields with D-05 type-change coercion (preserve-all, multi-hop) | SATISFIED | `applyFieldTypeChange` wired; `quarantineKey(fieldId, sourceType)` multi-hop fix; 6 tests all pass |
| BRWS-01 | 02-03 | User can browse all people as a list | SATISFIED | BrowseList people view; useLiveQuery; sort; virtualization; row→profile |
| BRWS-02 | 02-03 | User can browse all locations as a list alongside map navigation | SATISFIED | BrowseList maps view; ViewSwitcher provides Map + Locations; Show-on-map in BrowseRow |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX debt markers in any 02-07-modified file | — | — |

All code-review BLOCKERs and WARNINGs from 02-REVIEW.md are closed:
- CR-01 (quarantine-overwrite data loss): closed by source-type-keyed quarantineKey and the multi-hop regression test
- WR-01 (restore-path ambiguity): closed by verbatim restore-from-TO-type-key design
- WR-02 (unguarded tags cast): closed by Array.isArray guard in CustomFieldRows.tsx
- IN-01 (reference-identity comment): the reference-identity contract for the dirty-flag check is now pinned with a comment in coerceEntityCustom (line 526-529)

---

### Human Verification Required

#### 1. E2E suite

**Test:** Run `npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts`
**Expected:** All pass. These specs cover SC-2 type-change coercion (wired), SC-3 browse/list/sort, SC-5 lightbox keyboard nav, SC-6 gallery reorder+persistence, privacy notice dismissal, and delete-vs-remove correctness.
**Why human:** Cannot run Playwright without a running dev server and browser session.

#### 2. D-05 coercion runtime check (SC-2 — confirm wiring executes correctly in a real browser)

**Test:** In a running app: (a) define a text field on People, (b) set it to "hello" on one person and "42" on another, (c) change the field type to Number in FieldManager. Inspect both profiles.
**Expected:** "hello" person shows the number input empty (value quarantined, not lost); "42" person shows the number 42. The D-05 caution copy was shown before save and the behavior matches the promise.
**Why human:** Confirms applyFieldTypeChange executes correctly in a real browser session against a real Dexie database.

#### 3. D-05 restore-on-revert runtime check

**Test:** After the type-change above, revert the field type back to Text and inspect the person whose value was quarantined ("hello").
**Expected:** "hello" is restored to the live field value; the quarantine slot is cleared.
**Why human:** D-05 restore-on-revert invariant — requires confirming via the running app.

#### 4. Multi-hop preserve-both live check (NEW — CR-01 runtime confirmation)

**Test:** Perform two successive quarantining type changes: define a text field, set it to "hello", change to number (quarantines "hello"), then manually enter 5 as the number, then change to date (quarantines 5). Open DevTools → Application → IndexedDB → people table and inspect the custom map for the test person.
**Expected:** The custom map holds both `__quarantine:<id>:text = "hello"` AND `__quarantine:<id>:number = 5` simultaneously. Revert to number restores 5; revert to text restores "hello".
**Why human:** Multi-hop CR-01 fix runtime proof — the regression test covers this at the unit level, but a live browser session confirms the full stack (Dexie write, DevTools inspection, UI behavior on revert).

#### 5. Nav roving focus and active-item styling

**Test:** Tab to the ViewSwitcher, press ArrowDown/Up through the five view items and two tool items. At viewport width ≤900px, confirm icon-only items have aria-label. Confirm the active item has an ink left-edge bar (not amber).
**Expected:** Roving focus works; active item styled correctly; icon-only items are accessible.
**Why human:** Visual styling and keyboard interaction cannot be verified by grep.

---

### Gaps Summary

No gaps remain. The code-review BLOCKER (CR-01: multi-hop quarantine-overwrite data loss) is genuinely closed:

- `quarantineKey` now takes `(fieldId, sourceType)` and produces `__quarantine:<id>:<sourceType>`.
- `coerceEntityCustom` stores a non-convertible original under `quarantineKey(fieldId, fromType)` — distinct per source type.
- The unconditional single-slot overwrite (`next[qKey] = result.quarantined`) is gone (confirmed: zero grep matches for `next[qKey]`).
- Restore resolves from `quarantineKey(fieldId, toType)` verbatim — no fitness ambiguity.
- `tests/db/applyFieldTypeChange.test.ts` now has 6 tests (was 5): the 6th is the multi-hop regression that directly exercises the BLOCKER scenario and asserts both originals survive.
- `npx vitest run tests/db/applyFieldTypeChange.test.ts` exits 0, 6/6 pass.
- `npx vitest run --no-file-parallelism` exits 0, 24 files / 155 tests pass (1 net new test from 02-07).
- `npx tsc --noEmit` exits 0.
- Zero schema/serializer/backup change (3 files touched: repository.ts, applyFieldTypeChange.test.ts, CustomFieldRows.tsx).

Status remains `human_needed` because SCs 1, 3, 5, 6 involve visual behavior and keyboard interaction requiring a browser session, and the D-05 runtime behavior merits a live smoke-test to confirm the full stack.

---

_Verified: 2026-06-26T14:35:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — gap-closure plans 02-06 and 02-07 (closes CR-01 data-loss BLOCKER from 02-REVIEW.md)_
