---
status: testing
phase: 02-custom-fields-full-entity-model
source: [02-VERIFICATION.md]
started: 2026-06-26T07:34:14Z
updated: 2026-06-26T07:34:14Z
---

## Current Test

number: 1
name: Run the Playwright E2E suite for phase 02
expected: |
  All E2E specs pass — covering SC-2 type-change coercion (now wired), SC-3 browse/list/sort,
  SC-5 lightbox keyboard nav, SC-6 gallery reorder + persistence, privacy-notice dismissal, and
  delete-vs-remove correctness.
awaiting: user response

## Tests

### 1. Playwright E2E suite
expected: All specs pass — `npx playwright test e2e/custom-fields.spec.ts e2e/browse-and-create.spec.ts e2e/lightbox.spec.ts e2e/gallery-reorder.spec.ts e2e/privacy-notice.spec.ts e2e/delete-vs-remove.spec.ts`
result: [pending]

### 2. D-05 type-change coercion (runtime)
expected: In a running app — define a text field on People, set it to "hello" on one person and "42" on another, then change the field type to Number in FieldManager and save. The "hello" person's number input is empty (value quarantined, not lost); the "42" person shows the number 42; the caution copy was shown before save.
result: [pending]

### 3. D-05 restore-on-revert (runtime)
expected: After the type change in test 2, revert the field type back to Text. The person whose value was quarantined shows "hello" restored to the live field value; the quarantine slot is cleared.
result: [pending]

### 4. CR-01 multi-hop preserve-both (runtime proof of the 02-07 fix)
expected: Perform two successive quarantining type changes — text→number (quarantines "hello"), enter 5 as the number value, then number→date (quarantines 5). In DevTools the Dexie record's custom map holds BOTH `__quarantine:<id>:text` = "hello" AND `__quarantine:<id>:number` = 5 simultaneously; neither was clobbered.
result: [pending]

### 5. ViewSwitcher roving focus + responsive a11y
expected: Tab to the ViewSwitcher, ArrowDown/Up moves roving focus through the five view items and two tool items; the active item shows the ink left-edge bar; at viewport ≤900px icon-only items expose an aria-label.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
