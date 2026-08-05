---
phase: 05-field-scoped-search
reviewed: 2026-08-05T10:57:30Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - e2e/search-incremental.spec.ts
  - e2e/search-scope.spec.ts
  - e2e/search.spec.ts
  - src/app/App.tsx
  - src/features/nav/ViewSwitcher.tsx
  - src/features/search/ScopePanel.tsx
  - src/features/search/SearchResultRow.tsx
  - src/features/search/SearchView.module.css
  - src/features/search/SearchView.tsx
  - src/features/search/searchIndex.ts
  - src/features/search/snippet.ts
  - src/features/search/useScopeSelection.ts
  - src/features/search/useSearchIndex.ts
  - tests/features/searchIncremental.test.ts
  - tests/features/searchIndex.test.ts
  - tests/features/searchScope.test.ts
  - tests/features/snippet.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-08-05T10:57:30Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed the field-scoped People search slice: the MiniSearch index service (`searchIndex.ts`),
the incremental-freshness hook (`useSearchIndex.ts`), the subtractive scope-selection store
(`useScopeSelection.ts`), the UI surfaces (`SearchView.tsx`, `ScopePanel.tsx`, `SearchResultRow.tsx`),
the XSS-safe snippet helper (`snippet.ts`), the nav wiring (`ViewSwitcher.tsx`, `App.tsx`), and the
associated unit + e2e suites.

Overall the code is careful and well-tested. The security boundary the phase advertises (T-05-01)
holds: every snippet fragment — including the highlight — is a genuine React child, never an HTML
string, and I confirmed there is no `dangerouslySetInnerHTML` or `innerHTML` anywhere in scope. No
secrets, no injection, no unsafe deserialization. I found **no BLOCKER-class defects**.

The defects that remain are correctness-under-concurrency gaps in the incremental index maintenance
and one scope/index field-set mismatch (photo custom fields). I verified empirically that the photo
mismatch does **not** crash MiniSearch (searching an unknown field alongside valid fields returns
results normally and does not throw), which is why it is a WARNING rather than a BLOCKER. Details
below.

## Warnings

### WR-01: Photo custom fields render a scope checkbox that does nothing and breaks the all-fields-off guard

**File:** `src/features/search/ScopePanel.tsx:55,74-82`, `src/features/search/useScopeSelection.ts:37-42`, `src/features/search/searchIndex.ts:208`
**Issue:**
The scope candidate set and the indexed field set disagree on `photo` fields.

- `buildIndex` excludes photo fields from the index: `customDefs.filter((def) => !def.deleted && def.type !== 'photo')` (`searchIndex.ts:208`).
- `ScopePanel` renders a checkbox for **every** non-deleted custom def — `listFieldDefs('people')` does not filter by type (`repository.ts:844-846`), so a `photo` custom field gets a checkbox (`ScopePanel.tsx:74-82`).
- `resolveActiveFields` includes every non-deleted def id as a candidate — again without the `photo` exclusion (`useScopeSelection.ts:37-42`).

Two user-visible consequences:
1. A `photo` custom field's checkbox is a **dead control** — toggling it changes `activeFields`, but that field is never in the index, so search behavior is unaffected.
2. It **defeats the all-fields-off guard (D-11/B9)**. If a DB has a photo custom field and the user unchecks all five built-ins plus every text field but leaves the photo box checked, `activeFields` is non-empty (`[fld_photo]`), so `allFieldsOff` is `false`. The user then sees the generic "No people match" zero-match panel instead of the intended distinct "Nothing to search" guard — even though effectively nothing searchable is selected.

I confirmed MiniSearch does **not** throw on an unknown field in the search `fields` option (valid fields still match), so this is a correctness/UX inconsistency, not a crash.

**Fix:** Apply the same `type !== 'photo'` filter used by `buildIndex` at the two candidate sources so the scope panel and the resolver agree with the index:
```ts
// ScopePanel.tsx
const customDefs = (useLiveQuery<FieldDef[]>(() => listFieldDefs('people'), []) ?? [])
  .filter((def) => def.type !== 'photo');

// useScopeSelection.ts – resolveActiveFields
const candidates = [
  ...builtinKeys,
  ...customDefs.filter((def) => !def.deleted && def.type !== 'photo').map((def) => def.id),
];
```
Consider exporting a shared `isIndexableDef(def)` predicate from `searchIndex.ts` so the three call sites cannot drift apart again.

### WR-02: A person created during the initial async index build is silently dropped from the index

**File:** `src/features/search/useSearchIndex.ts:56-95`
**Issue:**
The one-time build effect is async: it awaits `db.people.toArray()` then `buildIndex(...)` before assigning `bundleRef.current`/`setBundle` (`lines 59-65`). The incremental `onChange` subscription is installed in a separate effect and guards with `if (!current) return; // not built yet` (`line 80`).

If a `people` `create`/`update` commits **after** the build's `toArray()` snapshot but **before** `bundleRef.current` is set, the change event is received while `bundleRef.current` is still `null` and is dropped on the floor — and it was not in the snapshot either. That row stays **unsearchable** until an unrelated field-schema change triggers the coarse rebuild (or the view is remounted). The comment on `line 80` ("the initial build will read the persisted row") is only true when the write precedes the snapshot read, not when it lands in this window.

This is narrow (a write racing mount), but the e2e "created while Search is open" test only exercises the post-build path, so the gap is uncovered.

**Fix:** After the build resolves, drain any events missed during the build window, or make the subscription buffer while `bundleRef.current === null` and replay on assignment. Minimal approach — record events received before the bundle exists and replay them once `bundleRef.current` is set; or install the `onChange` subscription and begin buffering **before** the first `toArray()`.

### WR-03: Concurrent `applyChange` calls are not atomic across their internal await and can leave stale index state

**File:** `src/features/search/useSearchIndex.ts:76-93`, `src/features/search/searchIndex.ts:276-306`
**Issue:**
Each `onChange` emit spawns an independent `void (async () => { ... })()` (`useSearchIndex.ts:81`) that awaits `db.people.get` then `applyChange`, and `applyChange` itself awaits `projectFieldText` (`searchIndex.ts:300`) — whose latency varies (a `link-to-entity` field resolves a target name via a Dexie read) — **before** the non-atomic `index.has(...)` → `index.replace/add` decision (`searchIndex.ts:304-305`).

Because these IIFEs run concurrently with no per-entity serialization, two rapid updates to the same person can complete in an order that does not match their commit order: the operation that resolves its `projectFieldText` last writes last, so the index can retain the **older** field text. Note the `useScopeSelection.setFieldChecked` writer deliberately serializes its read-modify-write in a Dexie `rw` transaction (`useScopeSelection.ts:82-85`) precisely to avoid this class of bug; the index-maintenance path has no equivalent guard.

**Fix:** Serialize index maintenance — e.g. chain events through a promise queue (`pending = pending.then(() => handle(ev))`) so `applyChange` calls apply strictly in emit order, or make the `index.has`/`replace`/`add` decision immediately after a single fresh read with no interleaving await. A queue also closes the ordering exposure in WR-02.

## Info

### IN-01: Result-count live-region announcement is not pluralized

**File:** `src/features/search/SearchView.tsx:127-133`
**Issue:** `announce` renders `` `${results.length} people match` `` unconditionally, so a single result is announced to assistive tech as "1 people match".
**Fix:** `` `${results.length} ${results.length === 1 ? 'person matches' : 'people match'}` ``.

### IN-02: `snippet.ts` re-derives constants independently of `searchIndex.ts`

**File:** `src/features/search/snippet.ts:15-19`
**Issue:** `NAME_KEY`, `NEUTRAL_BOOST`, and `BUILTIN_ORDER` restate constants whose source of truth lives in `searchIndex.ts` (`BUILTIN_FIELD_KEYS[0]` is the name key; custom fields' neutral weight is "absent from the boost map"). If the boost model or built-in ordering changes, these can drift silently.
**Fix:** Derive `NAME_KEY` from `BUILTIN_FIELD_KEYS[0]` (already imported) and centralize the neutral-boost constant in `searchIndex.ts`, importing it here.

---

_Reviewed: 2026-08-05T10:57:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
