---
status: complete
phase: 05-field-scoped-search
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
mode: mvp
started: 2026-08-06T01:10:28Z
updated: 2026-08-06T01:14:00Z
note: "Phase marked MVP mode but the ROADMAP goal is not in strict As-a/I-want/so-that user-story format; verifying via deliverable-based UAT ordered as a user flow (open search -> fuzzy find -> scope -> evidence -> live), matching the Phase 04 precedent. Run /gsd mvp-phase 05 first if strict MVP framing is desired."
---

## Current Test

[testing complete]

## Tests

### 1. Open the Search view (pre-query state)
expected: Clicking the Search icon in the left rail opens a Search view with a "Search people…" input and a pre-query prompt ("Search people" / "Search people by name, tags, or any field — then narrow it with the checkboxes"). No results shown until you type.
result: pass

### 2. Fuzzy search finds people by name
expected: Type part of a person's name (e.g. "smi"). Matching people appear as rows (round avatar/initials + name); non-matching people do not. Typing a single-character typo of a real name (e.g. "smyth" for "Smith") still surfaces that person — fuzzy tolerance. Queries shorter than 2 characters return nothing.
result: pass

### 3. Open a result → profile + Show on map
expected: Click a result row → the person's ProfileSidebar opens with their full profile. Each row also has a "Show on map" action that navigates to the person on their map.
result: pass
note: "User confirmed pass. Wording observation (not a defect): the Show-on-map action reads as 'appears on' plus the map's name."

### 4. Field-scope panel (built-ins + custom, all on by default)
expected: A scope panel of checkboxes is visible — the five built-ins (Name, Phone, Description, Tags, Notes) plus a live checkbox for every custom People field you've defined. All boxes are checked by default. Adding/renaming a custom People field updates the panel with no reload.
result: pass

### 5. Signature scoping — "smith" matches a name AND a blacksmith, unchecking Job drops the blacksmith
expected: |
  Setup: have a person named "Smith" and another person whose custom "Job"
  field value contains "blacksmith" (any custom text field whose value contains
  your query as a substring works). With all fields checked, search "smith":
  BOTH the person named Smith (name match) and the blacksmith (Job match) appear.
  Uncheck the "Job" field → the blacksmith drops out of results while the Smith
  name match remains. (Substring/infix matching + field scoping — the signature.)
result: pass

### 6. Matched-field snippet evidence
expected: For a non-name match (the blacksmith found via Job), the result row shows an evidence snippet on its secondary line like "Job: black[smith]" with the matched term "smith" visibly highlighted (amber mark). A name-only match instead shows the normal fallback line (tags, else "updated Nd ago") — no snippet.
result: pass

### 7. Scope choice persists across reload
expected: With "Job" (or any field) unchecked, reload the app and return to Search. The unchecked choice is remembered — that field is still off. (Scope selection persists locally.)
result: pass

### 8. All-fields-off guard ("Nothing to search")
expected: Uncheck every field in the scope panel. The view shows a distinct guard state — heading "Nothing to search" and "Every field is turned off. Turn at least one field on to search." — NOT a "No people match" zero-result message.
result: pass

### 9. Live incremental freshness (no reload)
expected: With the Search view open and a query showing results, create a new person (or edit an existing one) that matches the query. The new/edited person appears in (or updates within) the results with no page reload.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
