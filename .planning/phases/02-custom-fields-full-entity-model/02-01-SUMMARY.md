---
phase: 02-custom-fields-full-entity-model
plan: 01
subsystem: database
tags: [zod, dexie, indexeddb, typescript, serializer, backup, custom-fields, entity-model]

# Dependency graph
requires:
  - phase: 01 (storage spine / walking skeleton)
    provides: "Person/MapDoc/Marker domain model, zod schemas + satisfies locks, Dexie version(1) tables, single repository mutation path, sharded serializer + atomic manifest-swap sync engine, export/restore with BackupSchema"
provides:
  - "Full five-type entity model: Person (enriched), MapDoc-as-rich-Location (D-07), Group (D-09), RelationshipLink data-bearing shell (D-08)"
  - "Per-entity custom-value map (CustomValues, D-01) carrying DATA-03 field VALUES on every entity"
  - "FieldDef store (fieldDefs table, D-02/D-05): stable-id per-type custom-field schema with order + soft-delete"
  - "Repository CRUD: createGroup/updateGroup, createRelationshipLink/updateRelationshipLink, updateMap, createFieldDef/updateFieldDef/reorderFieldDefs/softDeleteFieldDef/listFieldDefs"
  - "Serializer / Dexie sync port / export-restore threaded for all new types + fieldDefs (manifest swap stays the sole commit point)"
affects: [browse-lists, custom-field-manager, custom-field-inputs, entity-forms, profile-rendering, phase-4-relationships, phase-5-search]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EntityType union widening propagates through types/schemas/Dexie/serializer/sync/backup in lockstep (satisfies locks guard drift)"
    - "Closed zod unions/enums (FieldTypeSchema, CustomValueSchema) as the trust boundary for user-defined field shapes (threat T-02-02)"
    - "Soft-delete via an update flag, never a row delete, so stored values are retained (D-05)"
    - "Dexie multi-table transactions with >5 tables use the array-form signature db.transaction('rw', [tables], cb)"

key-files:
  created:
    - tests/domain/entityModel.schemas.test.ts
    - tests/db/entityModel.crud.test.ts
    - tests/sync/serializer.entities.test.ts
    - tests/backup/roundtrip.entities.test.ts
  modified:
    - src/domain/types.ts
    - src/domain/schemas.ts
    - src/db/schema.ts
    - src/db/repository.ts
    - src/sync/serializer.ts
    - src/sync/syncEngine.ts
    - src/features/backup/exportDb.ts
    - src/features/backup/importDb.ts

key-decisions:
  - "Location is the enriched maps table (D-07): kept the 'maps' EntityType + markers.mapId FK; no rename, no migration"
  - "fieldDefs are part of EntitySet + export/restore + serializeShards, but NOT a manifest EntityType — they describe schema, not entities, and ride backup/reconcile without a cloud commit slot of their own"
  - "SHARD_NAMES keyed by EntityType (kebab) + a fieldDefs slot, so SHARD_NAMES[type] stays well-typed in the sync engine; EntitySet uses camelCase relationshipLinks, bridged by an explicit per-type switch in reconcile"

patterns-established:
  - "Pattern 1: per-entity custom-value map (custom: CustomValues) rides the single put path, so custom values round-trip automatically through Dexie/serializer/export"
  - "Pattern 2: field-definition store mirrors the validate->stamp->put->emit invariant with createFieldDef stamping order = max(existing)+1"

requirements-completed: [DATA-01, DATA-03]

# Metrics
duration: ~18min
completed: 2026-06-25
status: complete
---

# Phase 2 Plan 01: Full Entity Model Data Backbone Summary

**Five-type entity model (Person, rich Location, Group, Relationship-link) with a per-entity custom-value map and a stable-id field-definition store, threaded end-to-end through Dexie, the sharded serializer, the sync port, and export/restore — manifest swap still the sole commit point.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-25T18:13Z
- **Completed:** 2026-06-25T18:31Z
- **Tasks:** 2
- **Files modified:** 8 source + 6 test files

## Accomplishments
- Domain model gains `FieldType`, `CustomValue`/`CustomValues`, `FieldDef`, `Group`, `RelationshipLink`; `MapDoc` promoted in place to a rich Location (photo/gallery/notes/custom, D-07); `Person` gains a `custom` map; `EntityType` widened with `groups`/`relationship-links`.
- zod mirror with closed `FieldTypeSchema`/`CustomValueSchema` unions (threat T-02-02), `GroupSchema`/`RelationshipLinkSchema`/`FieldDefSchema`/`CustomValuesSchema`, extended `ManifestSchema.shards` + `BackupSchema` (entities + new `fieldDefs` slot), and a `satisfies` lock for every new type.
- Dexie `version(2)` adds `groups`, `relationshipLinks`, and `fieldDefs` tables (auto-upgrade, no push step); version(1) untouched.
- Repository CRUD for the new types + the field-definition store (create/update/reorder/soft-delete/list), all on the single validate->stamp->put->emit path.
- Serializer shards, Dexie sync port (getEntities/getDirtyTypes/markSynced/upsert), and export/restore threaded for the new types + fieldDefs + custom values; `importDb.collectMimes` now scans custom Photo-field MediaRefs.
- New tests prove schema parse behavior, repository CRUD, serializer round-trip of custom values, and a byte-for-byte export→import round trip of the full model. Full suite: 21 files / 118 tests green; `tsc --noEmit` and eslint clean.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 (RED): failing schema tests** - `a245fb1` (test)
2. **Task 1 (GREEN): domain model + Dexie schema + storage threading** - `16ae0c9` (feat)
3. **Task 2 (GREEN): repository CRUD + field-def store + entity-model tests** - `13f598c` (feat)

_Task 2's tests were authored alongside their implementation; the implementation landed in the same commit since the storage threading it depends on was already proven by Task 1's tsc/schema gate._

## Files Created/Modified
- `src/domain/types.ts` - FieldType/CustomValue(s)/FieldDef/Group/RelationshipLink; MapDoc→Location; Person.custom; widened EntityType + Backup.entities/fieldDefs
- `src/domain/schemas.ts` - closed FieldType/CustomValue unions + new entity schemas; widened ManifestSchema.shards + BackupSchema; satisfies locks
- `src/db/schema.ts` - version(2) groups/relationshipLinks/fieldDefs tables (fieldDefs indexed by entityType + order)
- `src/db/repository.ts` - create/update for Group, RelationshipLink, Map (updateMap); field-def store; widened ChangeEvent
- `src/sync/serializer.ts` - EntitySet + SHARD_NAMES + serialize/deserialize for groups/relationship-links/fieldDefs
- `src/sync/syncEngine.ts` - ENTITY_TYPES + createDexieRepoPort (getEntities/getDirtyTypes/markSynced/upsert) + reconcile per-type bridge
- `src/features/backup/exportDb.ts` - bundle the new entity arrays + fieldDefs; localManifest gains the new shard pointers
- `src/features/backup/importDb.ts` - clear+bulkPut the new tables in the same rw txn; collectMimes scans custom Photo values
- `tests/domain/entityModel.schemas.test.ts` - schema parse acceptance/rejection for the new types + custom values
- `tests/db/entityModel.crud.test.ts` - Group/RelationshipLink/Location CRUD + field-def create/reorder/soft-delete/list
- `tests/sync/serializer.entities.test.ts` - shard round-trip + naming + custom-value-map preservation
- `tests/backup/roundtrip.entities.test.ts` - export→wipe→import of the full model + custom Photo-field blob byte-equality

## Decisions Made
- **Location = enriched `maps` table** (D-07): kept the `'maps'` EntityType member and `markers.mapId` FK, avoiding a data migration and an FK rename.
- **`fieldDefs` is part of `EntitySet`/serializer/export but not a manifest `EntityType`.** Field definitions describe schema, not entities; they round-trip through export/restore and the in-memory set, but the manifest's per-type atomic commit covers only the five entity types. This keeps the sole-commit-point invariant intact without inventing a sixth manifest shard pointer.
- **`SHARD_NAMES` keyed by `EntityType`** (kebab) so `SHARD_NAMES[type]` stays well-typed in the sync engine; the `EntitySet.relationshipLinks` camelCase field is bridged by an explicit per-type switch in `reconcileOnOpen` and a `pulledHas` helper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing Phase-1 test fixtures for the widened model**
- **Found during:** Task 1 (schema/type widening)
- **Issue:** Adding required `custom` to Person/MapDoc and the new `groups`/`relationship-links` shard pointers to ManifestSchema broke the hand-built fixtures in `tests/domain/person.test.ts`, `tests/sync/serializer.test.ts`, `tests/sync/atomicity.test.ts`, `tests/sync/reconcile.test.ts`, `tests/sync/prepareOnOpen.test.ts`, and `tests/sync/_memoryPort.ts` (tsc errors + missing-key assertions).
- **Fix:** Added `custom: {}`/`gallery: []` to the entity helpers, the new shard pointers to the manifest helpers, the new empty arrays to every `EntitySet` literal, and the new types to `_memoryPort`'s dirty/upsert/markSynced logic. Updated the serializer shard-name assertions to expect the six shards.
- **Files modified:** the six test files above
- **Verification:** `npx vitest run` — 21 files / 118 tests green; no behavioral regression on people/maps/markers.
- **Committed in:** `16ae0c9` (Task 1 commit)

**2. [Rule 3 - Blocking] Dexie array-form transactions for >5 tables**
- **Found during:** Task 2 (importDb / syncEngine markSynced)
- **Issue:** `db.transaction('rw', t1, ..., cb)` caps at 7 positional args; the import + markSynced transactions now touch 6–8 tables, which exceeds the overload and failed `tsc`.
- **Fix:** Switched those transactions to the array-form signature `db.transaction('rw', [tables], cb)`.
- **Files modified:** `src/features/backup/importDb.ts`, `src/sync/syncEngine.ts`, `tests/sync/reconcile.test.ts`
- **Verification:** `tsc --noEmit` exits 0; round-trip + reconcile tests green.
- **Committed in:** `16ae0c9` / `13f598c`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking).
**Impact on plan:** Both were mechanical consequences of the planned type widening (fixture upkeep + a Dexie API-shape constraint). No scope creep; no behavioral change to Phase-1 paths.

## Issues Encountered
None beyond the deviations above. The CLAUDE.md schema-gate note (Dexie, not Drizzle — no migration push) was honored: `version(2)` is a Dexie schema bump only.

## Threat Surface

Plan threat register handled as designed:
- **T-02-01 (tampering, import/deserialize):** `BackupSchema.parse` (extended with the new arrays + fieldDefs) runs before the single rw transaction; serializer reads go through the same schemas.
- **T-02-02 (schema poisoning):** `FieldTypeSchema` (closed enum) and `CustomValueSchema` (closed union) reject out-of-band types/values — covered by `entityModel.schemas.test.ts`.
- **T-02-03 (custom Photo-value GC):** accepted for this plan per the register. `deletePerson`'s media-GC sweep was intentionally left unchanged (the GC generalization to scan custom Photo values + new entity types is plan 03's delete slice). No new media is attached to the new types via UI this plan, so this does not regress Phase-1 GC behavior. See Known Stubs.

No new threat surface beyond the plan's register.

## Known Stubs
- **`deletePerson` media GC does not yet scan the new entity types or custom Photo-field values** (`src/db/repository.ts`). This is intentional and bounded: per threat T-02-03 and decision D-12, the cascade-delete + GC generalization is plan 03's slice. A blob referenced only by a Group/RelationshipLink/Location or a custom Photo value could be wrongly GC'd if `deletePerson` ran against a DB where such sharing existed; this plan adds no UI to create that sharing, and plan 03 generalizes the sweep before any such path ships.

## Next Phase Readiness
- The full data backbone is in place: every later slice in Phase 2 (browse lists, delete/remove split, custom-field manager/inputs, lightbox) and Phase 4/5 (relationships, search) now has real types, schemas, tables, repository CRUD, and storage threading to build on.
- No blockers. Plan 02 (browse UI) can consume `listGroups`/`listRelationshipLinks`/`listFieldDefs` and the enriched Location/Person records directly.

## Self-Check: PASSED

All 4 created test files and the SUMMARY exist on disk; all 4 commits (`a245fb1`, `16ae0c9`, `13f598c`, `6441d95`) are present in git history. `tsc --noEmit` exits 0; full vitest suite 21 files / 118 tests green; eslint clean.

---
*Phase: 02-custom-fields-full-entity-model*
*Completed: 2026-06-25*
