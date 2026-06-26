---
status: complete
phase: 02-custom-fields-full-entity-model
source: [02-VERIFICATION.md]
started: 2026-06-26T07:34:14Z
updated: 2026-06-26T09:45:00Z
---

## Current Test

[testing complete — 5/5 pass; 1 blocker found & fixed (c3d7772); 3 UX follow-ups fixed (cab0af2)]

## Tests

### 1. Playwright E2E suite
expected: All specs pass — `npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts`
result: pass
note: "Ran via gsd-verify-work — 12 passed (1.7m), 6 workers, vite preview build:e2e."

### 2. D-05 type-change coercion (runtime)
expected: In a running app — define a text field on People, set it to "hello" on one person and "42" on another, then change the field type to Number in FieldManager and save. The "hello" person's number input is empty (value quarantined, not lost); the "42" person shows the number 42; the caution copy was shown before save.
result: pass
note: "Initially white-screened (blocker) — crash fixed in c3d7772 (v3 custom-map backfill + (custom ?? {})[def.id] guards). User re-verified after reload: coercion behavior PASSES (text quarantined, number kept, caution shown). Side observation (non-blocking, logged as follow-up F-1): entering text into a Number field silently fails with no inline feedback; 'button works fine'."

### 3. D-05 restore-on-revert (runtime)
expected: After the type change in test 2, revert the field type back to Text. The person whose value was quarantined shows "hello" restored to the live field value; the quarantine slot is cleared.
result: pass
note: "User initially reported 'no quarantine to be seen, just wiped' (the intermediate number state, where the value silently vanishes from view). On completing the revert: 'i set field as text, i fill, i go to number, it disappear, i go to text, it appear again' — restore-on-revert WORKS as designed. No code defect (matches the passing unit test applyFieldTypeChange.test.ts:70). Logged follow-up F-2: there is no visible indicator that a value was set aside (quarantined) vs deleted, so the disappearance reads as data loss until reverted."

### 4. CR-01 multi-hop preserve-both (runtime proof of the 02-07 fix)
expected: Perform two successive quarantining type changes — text→number (quarantines "hello"), enter 5 as the number value, then number→date (quarantines 5). In DevTools the Dexie record's custom map holds BOTH `__quarantine:<id>:text` = "hello" AND `__quarantine:<id>:number` = 5 simultaneously; neither was clobbered.
result: pass
note: "Pass by combined evidence (user's choice). User's DevTools dump proved single-hop quarantine stores correctly (__quarantine:fOO3OE1IEJBusBQfjpjNI:text = 'ewfewfw' preserved alongside live null). The two-simultaneous-quarantine preserve-both guarantee is proven by the passing automated regression applyFieldTypeChange.test.ts:125 (in the green 158-test suite). User opted to accept rather than repeat the DevTools multi-hop dance (F-2 made it confusing)."

### 5. ViewSwitcher roving focus + responsive a11y
expected: Tab to the ViewSwitcher, ArrowDown/Up moves roving focus through the five view items and two tool items; the active item shows the ink left-edge bar; at viewport ≤900px icon-only items expose an aria-label.
result: pass
note: "Roving focus + active ink bar pass (user). aria-label IS present on every item (ViewSwitcher.tsx:129/158/175, unconditional) — PROVEN by tests/nav/viewSwitcher.a11y.test.tsx (getByRole button name resolves for all 7 items). User's 'hover, no accessible name' is a verification-method mismatch: aria-label feeds the a11y tree, not a hover tooltip. Spec requirement (expose aria-label) is met. The genuine gap user surfaced — no visible hover tooltip (title) for sighted mouse users in icon-only mode — split out as follow-up F-3."

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0
resolved: 1
follow_ups: 3
follow_ups_fixed: 3

## Gaps

- truth: "Adding a custom field, then opening a person's profile, renders the profile without crashing"
  status: fixed
  reason: "User reported: adding a new field, causes when clicking on a person to white screen the page"
  severity: blocker
  test: 2
  root_cause: "version(2) Dexie upgrade added tables but never backfilled `custom = {}` onto legacy v1 people/maps records. ProfileSidebar reads the entity raw (db.people.get) and passes entity.custom (undefined for legacy records) to CustomFieldRows, which does custom[def.id]. With 0 field defs the map never runs; adding 1 def makes it dereference undefined → TypeError → white screen. EntityForm.tsx:117 already guards this shape (entity?.custom ? ... : {}); the read path missed it."
  artifacts:
    - path: "src/db/schema.ts"
      issue: "version(2).stores adds tables but has no .upgrade() to backfill custom={} on existing v1 people/maps records (data invariant 'custom always present' is violated for legacy data)"
    - path: "src/features/profile/CustomFieldRows.tsx"
      issue: "line 208 `custom[def.id]` dereferences custom unguarded; throws when entity.custom is undefined (legacy record) and >=1 field def exists"
    - path: "src/features/entity-form/CustomFieldInputs.tsx"
      issue: "line 251 `custom[def.id]` has the same unguarded dereference in the edit form's input map"
  missing:
    - "Add version(3).upgrade() to schema.ts backfilling custom={} (where absent) on people + maps tables"
    - "Guard the read/input boundary: `(custom ?? {})[def.id]` in CustomFieldRows and CustomFieldInputs"
    - "Regression test: render CustomFieldRows with custom=undefined + 1 field def present → must not throw (and omit the empty row)"
  status_after_fix: fixed
  fix_commit: c3d7772
  fix_summary: "version(3).upgrade() backfills custom={} on legacy people/maps; CustomFieldRows + CustomFieldInputs index via (custom ?? {})[def.id]. Verified: 158 unit pass, custom-fields+browse e2e pass, tsc + eslint clean."

- truth: "Reverting a custom field's type back restores the quarantined original value (D-05 re-addable)"
  status: not_a_defect
  reason: "User reported: no quarantine to be seen, just wiped — then on completing the revert: 'i go to text, it appear again'. Restore works as designed; initial report was the intermediate (quarantined, hidden) state."
  severity: blocker
  resolution: "No code change. Restore-on-revert confirmed working by the user AND by the passing unit test applyFieldTypeChange.test.ts:70. UX concern (no visible quarantine indicator) split out as follow-up F-2."
  test: 3
  investigation: "Static analysis says this path is CORRECT and is unit-tested: coerceEntityCustom (repository.ts:510) restores from quarantineKey(id, toType) on revert; tests/db/applyFieldTypeChange.test.ts:70 asserts text->number->text restores 'hello', and the multi-hop test passes. CustomValuesSchema is z.record (quarantine keys survive .parse). FieldEditor.handleSave calls applyFieldTypeChange when typeChanged (FieldEditor.tsx:88-94). EntityForm save passes custom=state.custom (full spread incl quarantine keys, EntityForm.tsx:117/192/204); updatePerson preserves via {...existing,...patch}. No serializer/cleanup strips __quarantine keys (only referenced in repository.ts). => The idealized flow works; the user's wipe must come from a runtime-specific sequence or state. Awaiting DevTools evidence of the actual custom map + exact click sequence to distinguish: (a) restore not firing vs (b) quarantine key never stored/stripped vs (c) UI refresh."
  artifacts: []
  missing: []

## Follow-ups (non-blocking)

- id: F-1
  reported: "using text on number is silent fail, button works fine"
  observed_during: test 2
  severity: minor
  interpretation: "A custom Number field input (CustomFieldInputs.tsx <input type=number>) silently rejects non-numeric text — no inline 'Enter a number.' message is surfaced (validateCustomValue only flags required-empty on save; type=number drops invalid text to empty before it can be validated). Save/buttons otherwise work. Pending user confirmation of the exact spot."
  status: fixed
  fix_commit: cab0af2
  fix_summary: "Muted 'Numbers only' hint under Number fields (aria-describedby-linked). Chosen approach: keep native type=number + helper text. Test: tests/entity-form/customFieldHints.test.tsx."

- id: F-3
  reported: "hover, no accesible name, all else pass"
  observed_during: test 5
  severity: minor
  interpretation: "ViewSwitcher icon-only items (narrow viewport) have aria-label (accessible name present — proven by tests/nav/viewSwitcher.a11y.test.tsx) but NO `title` attribute, so hovering shows no tooltip. Sighted mouse users can't discover an icon's meaning by hover. Easy fix: add title={item.label} (and Fields/About) to each nav button — complements the existing aria-label. Not a spec failure (spec required aria-label, which is met); discoverability enhancement."
  status: fixed
  fix_commit: cab0af2
  fix_summary: "Added title attribute to every ViewSwitcher item (views + Fields + About/Privacy). Test: extended tests/nav/viewSwitcher.a11y.test.tsx."

- id: F-2
  reported: "no quarantine to be seen, just wiped"
  observed_during: test 3
  severity: minor
  interpretation: "When a type change quarantines a value, the value silently vanishes from the form/profile with NO visible indicator that it was set aside (recoverable) rather than deleted. The FieldEditor caution ('others are set aside, not deleted') shows at change time, but afterward there is no per-value 'set aside' affordance — so the disappearance reads as data loss until the user happens to revert the type. Consider a subtle indicator or a way to view/restore quarantined values. Behavior is correct (D-05); this is reassurance/discoverability only."
  evidence: "User DevTools dump of person tOpY1U1UXg0IqOUQK3L_A after text->number — custom = {\"fOO3OE1IEJBusBQfjpjNI\": null, \"__quarantine:fOO3OE1IEJBusBQfjpjNI:text\": \"ewfewfw\"}. The original 'ewfewfw' IS preserved under the quarantine key; the live value is null (blank). User read this as 'no quarantine, blank' — direct proof the data is safe but the quarantine is invisible in the UI. Confirms F-2; refutes any data-loss defect."
  impact: "User mistook correct behavior for data loss twice during UAT — discoverability fix worth prioritizing."
  status: fixed
  fix_commit: cab0af2
  fix_summary: "New SetAsideNote component surfaces a muted recover note under each field with a quarantined value (form + profile), naming the value and the type to switch back to. Reader quarantinedEntriesFor(custom, fieldId) added to repository.ts. Profile keeps the row when only a set-aside value exists. Tests: quarantinedEntries, setAsideNote, customFieldHints."
