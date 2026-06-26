---
phase: 02-custom-fields-full-entity-model
reviewed: 2026-06-26T02:29:41Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/app/App.tsx
  - src/db/repository.ts
  - src/db/schema.ts
  - src/db/testBridge.ts
  - src/domain/schemas.ts
  - src/domain/types.ts
  - src/features/backup/exportDb.ts
  - src/features/backup/importDb.ts
  - src/features/browse/BrowseList.tsx
  - src/features/browse/BrowseRow.tsx
  - src/features/browse/browseTypes.ts
  - src/features/browse/useEntityThumb.ts
  - src/features/entity-form/CustomFieldInputs.tsx
  - src/features/entity-form/EntityForm.tsx
  - src/features/fields/FieldEditor.tsx
  - src/features/fields/FieldManager.tsx
  - src/features/fields/customValue.ts
  - src/features/nav/NewEntityMenu.tsx
  - src/features/nav/ViewSwitcher.tsx
  - src/features/onboarding/PrivacyNotice.tsx
  - src/features/person-form/PhotoUpload.tsx
  - src/features/profile/CustomFieldRows.tsx
  - src/features/profile/PhotoGallery.tsx
  - src/features/profile/PhotoLightbox.tsx
  - src/features/profile/ProfileSidebar.tsx
  - src/sync/serializer.ts
  - src/sync/syncEngine.ts
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-26T02:29:41Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Reviewed the Phase 2 custom-fields / full-entity-model slice: the Dexie repository (delete-vs-remove cascade + media GC), custom-value validation/coercion, serializer/import round-trip, and the React UI (entity forms, field manager, profile, browse, lightbox). The XSS surface is clean — every reviewed component renders user text as React children and there is no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in scope, so the stated token-exfiltration threat (T-03-01) is genuinely mitigated. Object-URL lifecycles in the lazy-media hooks are leak-safe, and the import/export base64 round-trip is byte-exact.

Two correctness defects warrant blocking. First, the headline D-05 "keep-or-quarantine on type change" behavior is **not wired**: `coerceOnTypeChange` exists and is unit-tested but has no production caller, so changing a field's type leaves stale-shaped values on every entity — directly contradicting the UI caution the user is shown. Second, the avatar object URL produced through `ProfileSidebar` → `useBlobImage` is the one media path that does not follow the established revoke-on-change lifecycle and leaks an object URL per avatar view. The remaining findings are robustness and consistency issues.

## Critical Issues

### CR-01: Field type change never coerces/quarantines stored values (D-05 unfulfilled)

**File:** `src/features/fields/FieldEditor.tsx:76-92` (and `src/features/fields/customValue.ts:86-130`)
**Issue:** `coerceOnTypeChange` is the documented D-05 mechanism that, on a field type change, keeps values that still fit and quarantines those that don't (never discarding). It is fully implemented and unit-tested — but it has **no caller anywhere in the app** (grep confirms references only in its own module, its test, and planning docs). `FieldEditor.handleSave` changes a field's `type` via `updateFieldDef(field.id, patch)` and never touches the existing `custom[fieldId]` values stored on entities. Yet the editor shows the user a caution promising the behavior:

```
"Changing the type keeps values that still fit; others are set aside, not deleted."
```

After a real type change (e.g. `text` → `number`), every entity still holds the old-shaped value under `custom[def.id]`. Consequences:
- `CustomFieldRows` / `CustomFieldInputs` render the new type against an old-shaped value (e.g. a `number` input bound to a leftover string, a `tags` renderer calling `.map` on a string).
- `validateCustomValue` on next save will flag previously-valid data as invalid, or accept mismatched data.
- The promised "set aside, not deleted / re-addable" guarantee silently does not exist — this is the headline feature of the plan (per 02-04-SUMMARY) shipping non-functional.

**Fix:** Wire coercion into the type-change save path. When `isEdit && field.type !== type`, after persisting the def, iterate the affected entity table and run `coerceOnTypeChange(field.type, type, entity.custom[field.id])`, writing back the `kept` value or moving the original into a quarantine store. Do it in one transaction. Sketch:

```ts
if (isEdit && field!.type !== type) {
  const table = tableFor(entityType);
  await db.transaction('rw', table, async () => {
    for (const e of await table.toArray()) {
      const v = e.custom?.[field!.id];
      if (v === undefined) continue;
      const r = coerceOnTypeChange(field!.type, type, v);
      // persist kept value, or stash quarantined original, then updatePerson/... to bump dirty
    }
  });
}
await updateFieldDef(field!.id, patch);
```

If coercion is genuinely deferred, the caution copy and the SUMMARY claim must be removed so the UI does not promise behavior that does not run.

### CR-02: Avatar object URL leaks on every profile view (ProfileSidebar avatar path)

**File:** `src/features/profile/ProfileSidebar.tsx:159-173`
**Issue:** Every other media surface in this phase (`useEntityThumb`, `PhotoGallery.useMediaUrl`, `PhotoLightbox.useFullRes`, `CustomFieldRows.useMediaUrl`, `PhotoUpload.useMediaUrl`) follows the prescribed revoke-on-change/unmount lifecycle. The ProfileSidebar header avatar does not: it loads a `Blob` into `photoBlob` and passes it to `useBlobImage(photoBlob)`, which (per its name/contract) creates an object URL from the blob. There is no `URL.revokeObjectURL` for that URL anywhere in the component — the effect only manages the `Blob`, not the URL `useBlobImage` derives from it. Opening N profiles (or paging the profile across N entities) leaks N object URLs for the session, exactly the threat (T-03-04 / object-URL leak) the other hooks were written to avoid. Because the sidebar re-resolves on every `entity.id` change, this fires on routine navigation, not an edge case.

**Fix:** Verify `useBlobImage` revokes its derived URL on blob-change/unmount; if it does not (it is the shared map-image hook, tuned for a long-lived Konva background, not rapid profile switching), replace the avatar resolution here with the same `resolveMediaUrl` + revoke lifecycle the gallery/lightbox use, so the avatar URL is revoked when `entity.photo.hash` changes or the sidebar unmounts. Do not roll a new lifecycle — reuse `useMediaUrl`/`useEntityThumb`.

## Warnings

### WR-01: Number custom field — coercion accepts whitespace-only as NaN-free? Verify `Number('')` path; empty handled, but non-numeric strings become `null` silently in the input

**File:** `src/features/entity-form/CustomFieldInputs.tsx:101-115`
**Issue:** The `number` input does `onChange={(e) => onChange(raw === '' ? null : Number(raw))}`. A native `type="number"` input usually yields `''` for invalid text, but for partially-valid input (e.g. trailing `e`, `-`, or locale edge cases) `Number(raw)` can produce `NaN`. `NaN` is then stored as the custom value, written to Dexie, and serialized — `JSON.stringify(NaN)` produces `null`, so a `NaN` value silently becomes `null` on the next sync/export round-trip (lossy and confusing), while in-memory `validateCustomValue` would have rejected it (`Number.isFinite(NaN)` is false). The store-then-validate-later ordering means a transient `NaN` can reach IndexedDB before save-time validation.

**Fix:** Guard the parse: `const n = Number(raw); onChange(raw === '' || Number.isNaN(n) ? null : n);` so a non-numeric entry never persists as `NaN`.

### WR-02: `tel:` href interpolates raw user phone value (CustomFieldRows + no validation of phone content)

**File:** `src/features/profile/CustomFieldRows.tsx:155-159`
**Issue:** `href={`tel:${String(value)}`}` interpolates an unvalidated custom-`phone` value directly into a URL. React escapes attribute content so this is not script-XSS, but `phone` validation is type-only (`typeof === 'string'`) — any string is accepted. A value containing newlines, URL control characters, or a crafted `tel:` payload renders an attacker-influenced link in the dossier. Low severity given single-curator model, but it is an unsanitized-URL pattern in the one place a user value becomes a navigable URI.

**Fix:** Encode the value into the URI (`encodeURIComponent`) and/or strip to dialable characters: `href={`tel:${String(value).replace(/[^\d+*#,;]/g, '')}`}`. Keep the visible text as the raw React child (already safe).

### WR-03: `getNewMedia` watermark not cleared after media GC — orphaned cloud blobs / no re-validation on local delete

**File:** `src/db/repository.ts:200-202` and `src/sync/syncEngine.ts:343-356`
**Issue:** `deleteEntity` GC-deletes blobs from `db.media` when no surviving entity references them, but it never updates the `syncedMediaHashes` meta watermark. `getNewMedia` only re-uploads hashes not in that watermark; deletion logic on the cloud side is not in scope, but the local watermark now lists hashes whose blobs no longer exist locally. If that same content is re-introduced later (re-upload of identical bytes), `getNewMedia` will skip it because the hash is still marked "synced," yet the cloud copy may have been pruned by a prior cleanup — leaving an entity referencing `media/<hash>` that no device re-pushes. This is the exact failure class `importDb` explicitly guards against by dropping the watermark (see its CR-02 comment), but the local-delete path has no equivalent.

**Fix:** When `deleteEntity` GCs a hash, remove it from the `syncedMediaHashes` set in the same transaction, so a later re-introduction of identical bytes is re-validated/re-pushed. Mirror the watermark-drop reasoning already documented in `importDb`.

### WR-04: `FieldManager.move` reads `list[index].label` after the reorder mutation may have re-rendered

**File:** `src/features/fields/FieldManager.tsx:94-102`
**Issue:** `move` awaits `reorderFieldDefs` (which triggers a `useLiveQuery` re-render), then reads `list[index].label` and `list.length` for the announcement. `list` is captured from the render closure so it is stable here, but the announcement uses `list[index]` (the field at the OLD index) while describing a move to `next + 1` — after the splice the field that moved is the one previously at `index`, so the label is correct, but if `list` changed length between renders the indices can momentarily mismatch. More concretely: the announcement is computed from pre-move `list`, while the persisted order is post-move; on rapid repeated key presses the live query may not have settled, so successive `move` calls operate on a stale `list` and can produce an incorrect final order (each call recomputes `ids` from the stale closure).

**Fix:** Recompute `ids` inside `move` from the freshest data (e.g. read `await listFieldDefs(entityType, ...)` or guard against in-flight reorders), and derive the announcement from the moved field captured before splicing rather than re-indexing.

### WR-05: `PhotoLightbox` arrow-key handler binds `window` keydown but does not scope to the dialog; double-binds with ProfileSidebar's capture Esc

**File:** `src/features/profile/PhotoLightbox.tsx:95-108`
**Issue:** The lightbox adds a `window` `keydown` listener for ArrowLeft/Right whenever `open`. ProfileSidebar simultaneously runs a capture-phase `window` keydown for Esc and relies on `lightboxOpenRef` to avoid double-close. The arrow handler is fine in isolation, but because it is window-global (not scoped to the Radix content), arrow keys typed into any focused input elsewhere on the page while the lightbox is open will page the lightbox. In this phase the lightbox is modal (Radix traps focus), so practical exposure is low, but the global binding is fragile if a non-trapped overlay ever coexists. Also `onIndexChange` is in the dep array, so the listener re-attaches on every index change (minor churn).

**Fix:** Attach the keydown to the Radix `Dialog.Content` node (or gate on focus within it) rather than `window`, and/or wrap `onIndexChange` so the effect does not re-subscribe on every paging step.

### WR-06: `reorderFieldDefs` emits a change event with `entityId = entityType` (subscriber contract violation)

**File:** `src/db/repository.ts:485`
**Issue:** Every other `emit` sends an `entityId` that is an actual entity/record id. `reorderFieldDefs` emits `{ entityType: 'fieldDefs', entityId: entityType, op: 'update' }` — passing the entity *type* string (e.g. `'people'`) as the `entityId`. A sync-engine subscriber that keys by `entityId` (the documented contract: "What changed") will treat `'people'` as a fieldDef id, which it never is. It happens to be harmless today because the sync engine reconciles whole shards, but it violates the `ChangeEvent` contract and is a latent bug for any future per-id subscriber.

**Fix:** Emit one event per reordered id, or introduce a distinct bulk-change signal. At minimum document that `fieldDefs`+`entityType`-as-id is a special bulk marker.

## Info

### IN-01: `EntityForm` save-time custom validation re-reads defs async, can diverge from rendered inputs

**File:** `src/features/entity-form/EntityForm.tsx:172-188`
**Issue:** `handleSave` calls `await listFieldDefs(entityType)` to validate, while `CustomFieldInputs` renders from its own `useLiveQuery(listFieldDefs)`. Two independent reads; if a field is soft-deleted between render and save, the validation set and the rendered set differ. Benign (validation is the authority) but worth noting as a single-source-of-truth smell.

**Fix:** Pass the rendered defs down, or lift the def list to a shared hook.

### IN-02: `initialsOf` indexes `parts[0][0]` without guarding empty first token edge cases

**File:** `src/features/profile/ProfileSidebar.tsx:68-73`
**Issue:** After `split(/\s+/).filter(Boolean)`, tokens are non-empty so `parts[0][0]` is safe. For a single-char multi-token name the logic is fine. No actual crash path found — listed only because it is exported and reused by `BrowseRow`; keep the `filter(Boolean)` invariant if refactored.

**Fix:** None required; add a unit test pinning the empty/whitespace-name → `'?'` behavior.

### IN-03: `useTargetEntities` / `LinkValue` perform a full `table.toArray()` per link field

**File:** `src/features/entity-form/CustomFieldInputs.tsx:36-55`
**Issue:** Each `link-to-entity` input loads the entire target table into a select. Out of v1 perf scope, but at thousands of entities this select becomes unwieldy and the live query reloads the full table on any change. Flagged for the scale roadmap, not this phase.

**Fix:** Future: typeahead/paginated picker instead of a full `toArray()` select.

### IN-04: Duplicate `isMediaRef` helper defined in three modules

**File:** `src/db/repository.ts:108-114`, `src/features/fields/customValue.ts:25-31`, `src/features/backup/importDb.ts:24-32`
**Issue:** Three near-identical `isMediaRef` type guards with subtly different strictness (importDb also checks `mime` is a string and rejects arrays; the other two only check `hash`). The divergence means a value that passes one guard may fail another — e.g. a MediaRef missing `mime` is collected for GC by `repository.isMediaRef` but ignored by `importDb.isMediaRef`. Not a live bug given the schema enforces `mime`, but the drift is a maintenance hazard.

**Fix:** Extract one shared `isMediaRef` (the strict importDb variant) into `domain/` and import everywhere.

### IN-05: `BrowseList` ResizeObserver effect keyed on boolean expressions

**File:** `src/features/browse/BrowseList.tsx:102-110`
**Issue:** The effect deps are `[rows === undefined, rows?.length === 0]` — two booleans encoding mount transitions. It works but is hard to reason about; a reviewer can't tell at a glance when the observer re-attaches. Style/clarity only.

**Fix:** Key on a single explicit `listMounted` boolean derived once, with a comment.

---

_Reviewed: 2026-06-26T02:29:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
