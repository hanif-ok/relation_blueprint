# Phase 02: Custom Fields & Full Entity Model - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 24 new/modified
**Analogs found:** 24 / 24 (every new file has a strong in-repo analog; this codebase is internally consistent and provides a template for almost everything in scope)

> Anchor truth: this is a **Dexie / IndexedDB client-side app**. There is no server ORM, no migration push. `src/db/schema.ts` is the Dexie schema applied in the browser at runtime; adding a table means adding a `version().stores()` entry (Dexie auto-upgrades). The **only mutation path** is `src/db/repository.ts` (validate -> stamp `updatedAt`+`dirty` -> `emit`). Every new entity type and custom-field write MUST go through that same shape.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/types.ts` (extend) | model | transform | itself (Person/MapDoc/Marker interfaces) | exact (extend in place) |
| `src/domain/schemas.ts` (extend) | model/validation | transform | itself (zod + `satisfies` locks) | exact (extend in place) |
| `src/db/schema.ts` (extend) | config | CRUD | itself (Dexie `version().stores`) | exact (extend in place) |
| `src/db/repository.ts` (extend) | service | CRUD | itself (`createPerson`/`deletePerson`) | exact (extend in place) |
| Custom-field-definition store/table | service + config | CRUD | `repository.ts` + Dexie `meta`/typed table | role-match |
| `src/sync/serializer.ts` (extend) | service | transform | itself (`SHARD_NAMES`, serialize/deserialize) | exact (extend in place) |
| `src/sync/syncEngine.ts` `createDexieRepoPort` (extend) | service | batch | itself (`getEntities`/`getDirtyTypes`) | exact (extend in place) |
| `src/features/backup/exportDb.ts` + `importDb.ts` (extend) | service | transform | itself (`exportDb`, `BackupSchema`) | exact (extend in place) |
| Left-nav view switcher (S10) | component | event-driven | `src/app/App.tsx` top-bar `actions` + nav-less shell | partial (new layout) |
| Browse list ×4 (S11) | component | request-response (read) | `PhotoGallery.tsx` (live read + lazy media grid) + `App.tsx` `useLiveQuery` | role-match |
| Browse row (S12) | component | request-response (read) | `ProfileSidebar` header (`initialsOf` + avatar) | role-match |
| Per-type field manager (S13) | component | CRUD | `PersonForm.tsx` (Radix Dialog) + `ConfirmDialog` | role-match |
| Field editor (S14) | component | CRUD | `PersonForm.tsx` tag-chip + field rows | role-match |
| Custom-field rendering read (S15) | component | request-response (read) | `ProfileSidebar.tsx` `.row` blocks | exact (same pattern) |
| Custom-field inputs (S16) | component | CRUD | `PersonForm.tsx` `.field` inputs + `PhotoUpload` | exact (same pattern) |
| Entity forms Location/Group/Rel-link (S17) | component | CRUD | `PersonForm.tsx` (whole file) | exact template |
| Photo lightbox (S18) | component | request-response (read) | `ConfirmDialog.tsx` (Radix overlay/focus-trap) + `useMediaUrl` | role-match |
| Gallery drag-to-reorder (S19) | component | event-driven | `PhotoUpload.tsx` `GalleryTile` grid | role-match |
| Privacy notice (S20) | component | event-driven | `ConfirmDialog.tsx` / `PersonForm` Dialog | exact template |
| Delete-vs-remove actions (S21) | service + component | CRUD (delete) | `deletePerson` cascade + `ConfirmDialog` | exact (split existing) |
| `+ New ▾` create menu (top bar) | component | event-driven | `App.tsx` `addPerson` button + Radix DropdownMenu (new) | partial |
| media object-URL hook for rows/lightbox | hook | request-response (read) | `useMapImage.ts` `useBlobImage` + `PhotoGallery` `useMediaUrl` | exact |

---

## Shared Patterns

### Single mutation path (apply to ALL new entity CRUD + custom-field value writes)
**Source:** `src/db/repository.ts:48-82` (`createPerson` / `updatePerson`)
Every create/update: `Schema.parse({...input, id: nanoid(), updatedAt: Date.now(), dirty: true})` -> `db.<table>.put(x)` -> `emit({entityType, entityId, op})`. New entity types (`createLocation`/`createGroup`/`createRelationshipLink`) replicate this verbatim against their table + schema. Custom-field VALUES live on the entity record (a `custom: Record<fieldId, value>` map per D-01), so they round-trip automatically through this same `put`.

```typescript
export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const person: Person = PersonSchema.parse({
    id: nanoid(),
    name: input.name,
    // ...fields...
    updatedAt: Date.now(),
    dirty: true,
  });
  await db.people.put(person);
  emit({ entityType: 'people', entityId: person.id, op: 'create' });
  return person;
}
```

The `ChangeEvent.entityType` union (`repository.ts:16`) must gain `'locations'|'groups'|'relationship-links'` (and field-definition writes if they emit).

### Type ↔ schema ↔ Dexie correspondence (every new type added in three files, locks preserved)
**Sources:** `src/domain/types.ts`, `src/domain/schemas.ts:85-108`, `src/db/schema.ts:48-59`
For each new entity type add: (1) an interface in `types.ts`, (2) a zod schema in `schemas.ts` PLUS its `satisfies` lock at the bottom, (3) a Dexie table field + `version(2).stores({...})` line. The `EntityType` union (`types.ts:82`) and `EntityTypeSchema` enum (`schemas.ts:52`) both gain the new members. Keep the `_xCheck = {} as XInput satisfies X; void _xCheck;` lock pattern — it is the compile-time guard against drift.

```typescript
// schemas.ts pattern to replicate per new type:
export const GroupSchema = z.object({ id: z.string(), name: z.string(), /* spine + custom */ });
export type GroupInput = z.infer<typeof GroupSchema>;
const _groupCheck = {} as GroupInput satisfies Group;
void _groupCheck;
```

### Dexie table addition (no migration step — bump the version)
**Source:** `src/db/schema.ts:50-58`
Add a `version(2).stores({...})` block adding the new tables (and the field-definitions table). Dexie auto-upgrades the open DB in the browser. Index only what you query: `id, name, updatedAt, dirty` is the established per-type index string. Default sort uses `name` (D-17 Name A-Z) and `updatedAt` (recently-updated) — both already indexed for People, mirror them for new tables.

### Radix Dialog scaffold (field manager, entity forms, privacy notice, lightbox focus-trap)
**Sources:** `src/features/person-form/PersonForm.tsx:101-121`, `src/features/common/ConfirmDialog.tsx:36-49`
`Dialog.Root > Dialog.Portal > Dialog.Overlay + Dialog.Content`, `aria-labelledby={titleId}` (via `useId()`), `onOpenAutoFocus` to place initial focus deliberately (first field for forms; **safe Cancel button for destructive dialogs** — `ConfirmDialog:45-48`). Esc/focus-trap/focus-return come free from Radix.

### Destructive confirmation (S21 delete; S14 remove-field)
**Source:** `src/features/common/ConfirmDialog.tsx` (whole file) — already generic. Reuse directly. Pass brick styling for `Delete {entity}` (cascade) and neutral styling for `Remove from map` and `Remove field` (reversible). The component already focuses Cancel first.

### Media object-URL loading with leak-safe revoke (rows, lightbox, custom Photo field)
**Sources:** `src/features/person-map/useMapImage.ts:12-37` (`useBlobImage`), `src/features/profile/PhotoGallery.tsx:19-38` (`useMediaUrl`), `src/db/repository.ts:193` (`getMedia`), `src/media/mediaManager.ts` (`resolveMediaUrl`/`storeMedia`)
Two established hooks: `useBlobImage(blob)` -> decoded `HTMLImageElement` (Konva/avatar), and `useMediaUrl(hash)` -> object-URL string (DOM `<img>`). Both revoke on hash-change/unmount. Browse rows and the lightbox MUST use one of these — do not roll a third URL lifecycle. Consider lifting `useMediaUrl` (duplicated in `PhotoGallery` and `PhotoUpload`) into a shared hook.

### Security: render all user text as React children
**Sources:** `ProfileSidebar.tsx:12-13` comment + `.rowValue` usage; `PersonForm.tsx:6-7`
NEVER `dangerouslySetInnerHTML`. Applies to every new custom-field value (S15), browse name/secondary line (S12), lightbox caption (S18), link labels, tags. (T-03-01: XSS would exfiltrate the Drive token.)

### Live reactive reads (browse lists, profile, counts)
**Sources:** `App.tsx:51-55`, `ProfileSidebar.tsx:45-48`
`useLiveQuery(async () => db.<table>.toArray()/.get(id), [deps])` re-renders on any repository write. Browse lists, nav count pills, and per-type profile all read this way — no manual refetch on mutation.

---

## Pattern Assignments

### `src/features/person-form/PersonForm.tsx` → Entity forms S17 + custom-field inputs S16

**Analog:** `PersonForm.tsx` (the direct template — copy its structure for Location/Group/Relationship-link forms).

**Form shell + amber-on-create / neutral-on-edit discipline** (lines 48-53, 221-228):
```typescript
const isEdit = !!person;
// footer:
<button className={isEdit ? styles.saveNeutral : styles.saveCreate} disabled={nameEmpty} ...>
  Save person
</button>
```
Generalize titles to `New {type}` / `Edit {type}` (line 114) and the empty-name error to `Add a name so you can find this {type}.` (lines 135-139). Locations additionally keep `background` + `width/height` (the promoted `MapDoc`, D-07 / D-18).

**Tag-chip editor** (lines 65-75, 173-200) → reuse for built-in Person tags AND the Tags/Select custom-field input (S16) and the field-editor option-list (S14).

**Built-in field input pattern** (lines 124-140): `label.field > span.label + input.input`, `aria-invalid` + `aria-describedby` + `role="alert"` for validation. Custom-field inputs (S16) append after built-ins using this exact markup, varying the `<input>` `type` per field type (text/number/tel/date) and swapping to `PhotoUpload` for Photo and the chip editor for Tags/Select.

**Photo control** (line 144): reuse `<PhotoUpload>` for the entity spine photo+gallery and for single-photo custom fields (S16 Photo). `PhotoUpload` already does `storeMedia` thumbnailing+dedupe and leak-safe previews.

---

### `src/features/profile/ProfileSidebar.tsx` → custom-field rendering S15 + lightbox host S18 + browse-row avatar (S12)

**Analog:** `ProfileSidebar.tsx` (extend in place; also the source of `initialsOf`).

**`initialsOf` avatar fallback** (lines 33-38) — export/reuse for browse rows (S12 People). For Location/Group/Rel-link rows, swap to a Lucide type glyph in a `radius-md` paper-shade square (UI-SPEC U2) instead of initials.

**Read-only field row pattern** (lines 115-150): `div.row > span.rowLabel + span.rowValue|chips`, **empty rows omitted**. Custom fields render after built-ins (S15) using this identical row, in schema order (D-02 / U8). Per-type read rendering varies the value node: plain text, `tel:` link (Phone), formatted date with raw-ISO `title`, paper-shade pill chips (Tags — reuse `.chip` from lines 136-138), neutral inline link with glyph (Link-to-entity; `(removed)` when target gone), thumbnail-that-opens-lightbox (Photo).

**Avatar blob load** (lines 51-65): pattern for resolving the header photo; the lightbox host mounts here and the gallery thumbnail click opens it.

**Delete action split (S21)** (lines 158-189): today's footer Edit/Delete + `ConfirmDialog` calling `deletePerson`. Split into: **"Delete {entity}"** (brick, full cascade — the existing `deletePerson` generalized) shown in list context, vs **"Remove from map"** (neutral, marker-only) shown in marker context. The sidebar shows ONE of the two based on how it was opened.

---

### `src/db/repository.ts` → new entity CRUD + delete/remove split S21 + marker delete

**Analog:** `repository.ts` (extend in place).

**`deletePerson` cascade + content-addressed media GC** (lines 84-120) — this becomes the **list-level `deleteEntity`** (D-12). It runs in one `db.transaction('rw', ...)`, deletes the entity, deletes its markers via index, then GCs media hashes no surviving entity references. Generalize the "still referenced" sweep (lines 103-112) to scan ALL entity types' photo/gallery/background AND custom Photo-field values so a blob shared across the new types isn't wrongly GC'd.

**NEW: marker-only delete** (the map-level action, D-12) — a small sibling that does only:
```typescript
export async function deleteMarker(id: string): Promise<void> {
  await db.markers.delete(id);
  emit({ entityType: 'markers', entityId: id, op: 'delete' });
}
```
No cascade, no GC — the entity stays in the DB and its browse list. This is the user-flagged correctness fix.

**Field-definition store**: a new `createFieldDef`/`updateFieldDef`/`reorderFieldDefs`/`softDeleteFieldDef` set following the same validate->stamp->put->emit shape, against a new `fieldDefs` Dexie table keyed by stable field `id` (NOT label — keep IDs stable for Phase 5 search and D-05 soft-delete/re-add). Soft-delete = a flag on the definition, not a row delete (values retained).

---

### Browse list S11 + row S12

**Analogs:** `PhotoGallery.tsx` (live read + lazy per-tile media), `App.tsx:51` (`useLiveQuery`), `ProfileSidebar` (`initialsOf` + avatar).

Read rows via `useLiveQuery(() => db.<table>.orderBy('name').toArray())` (toggle to `orderBy('updatedAt').reverse()` for recently-updated, D-17 — both indexed). Lazy-load each visible row's thumbnail with `useMediaUrl(hash)` (revoke on scroll-out). Virtualization is a planner detail; the contract is **constant 64px row height**. Row is `role="button"` opening the profile (D-16); nested "Show on map" + overflow use `stopPropagation`.

---

### Photo lightbox S18

**Analogs:** `ConfirmDialog.tsx` (Radix overlay + focus-trap + Esc + focus-return), `useMediaUrl` (full-res load).
Use a Radix Dialog for the focus-trap/Esc/return-focus guarantees; dark scrim (`#1B2230` @ ~92%, U7). Add `←/→` key handlers for prev/next over the `gallery: MediaRef[]`, mono `n / total` caption, paper glyph buttons. Returns focus to the originating gallery thumbnail (Radix focus-return covers this if the trigger is the focused element).

---

### Gallery drag-to-reorder S19

**Analog:** `PhotoUpload.tsx:50-69, 138-150` (`GalleryTile` grid). Reorder persists to `entity.gallery: MediaRef[]` order via `updatePerson`/`updateEntity` (same dirty->sync path). First tile badged "Thumbnail" (D-21). Keyboard reorder (Space pick / arrow move / Space drop / Esc cancel) with `aria-live` is mandatory (U10) — drag is the enhancement.

---

### Storage / sync threading (new entity types)

**Analogs:** `serializer.ts:21-62`, `syncEngine.ts:279-309` (`createDexieRepoPort`), `exportDb.ts:36-71`, `schemas.ts:60-83` (`ManifestSchema` / `BackupSchema`).

- `SHARD_NAMES` (serializer:21-25) gains `groups-000.json`, `relationship-links-000.json`; `EntitySet` (serializer:14-18) gains the new arrays; `serializeShards`/`deserializeShards` gain matching lines. `-000` bucketing shape is preserved.
- `createDexieRepoPort.getEntities`/`getDirtyTypes` (syncEngine:293-309) gain the new tables.
- `ManifestSchema.shards` (schemas:64-68) and `Manifest.shards` (types:107) gain explicit per-type keys — the **manifest swap stays the sole atomic commit point**; do not add a second commit point.
- `BackupSchema.entities` (schemas:77-81) + `exportDb`/`localManifest`/`importDb` gain the new arrays so custom-field values survive export/restore round-trip (custom values ride on the entity records, so adding the entity arrays is sufficient; the field DEFINITIONS need their own backup slot too — add a `fieldDefs` array/section to `BackupSchema` and the bundle).

---

### Left-nav view switcher S10 + `+ New ▾` menu + App shell host

**Analog:** `src/app/App.tsx` (the current single-surface shell — becomes the host).
The map view, profile sidebar, and PersonForm stay; add an active-view state that swaps `<main>` between `MapView` and the four browse lists (D-13). Top-bar `addPerson` button (App.tsx:93-101) becomes a Radix DropdownMenu `+ New ▾` offering the four types. Nav is roving-arrow-focus with `aria-current="page"`; active item = paper-pull + 3px ink-muted left bar (U1), never amber. Count pills read live per-type counts via `useLiveQuery`.

---

## No Analog Found

None. Every Phase 2 surface maps to an existing in-repo pattern. The two genuinely-new mechanisms — **drag-to-reorder keyboard interaction** (S19/S13) and **roving-focus nav** (S10) — have no exact analog but are interaction patterns layered onto existing component scaffolds (`PhotoUpload` grid; `App` shell), not new architectures. The planner should treat Radix DropdownMenu (`+ New`, row overflow) as a permitted-but-not-yet-used primitive (UI-SPEC allows Dialog + DropdownMenu); no styled component library is introduced.

---

## Metadata

**Analog search scope:** `src/db`, `src/domain`, `src/sync`, `src/features/{profile,person-form,person-map,common,backup,connect}`, `src/app`, `src/media`.
**Files scanned (read in full or targeted):** repository.ts, types.ts, schemas.ts, schema.ts, ProfileSidebar.tsx, PersonForm.tsx, PhotoGallery.tsx, PhotoUpload.tsx, useMapImage.ts, App.tsx, serializer.ts, ConfirmDialog.tsx, exportDb.ts, syncEngine.ts (+ glob inventory of all `src/**`).
**Pattern extraction date:** 2026-06-25
