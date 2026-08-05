// useSearchIndex — the hook that owns one MiniSearch index bundle for the Search view. It builds the
// index ONCE from the People snapshot on mount, then keeps it fresh INCREMENTALLY over the
// repository change signal (SRCH-01 criterion 3): a person create/update/delete routes through the
// pure `applyChange` add/replace/discard path — the index is NOT rebuilt on every load or edit.
//
// The one coarse rebuild that remains is a FIELD-SCHEMA change: adding/renaming/type-changing/
// soft-deleting a People custom field changes WHICH fields are indexed, so the whole field set is
// re-derived. That is a different concern from criterion 3's per-entity freshness (the searchable
// SET changed, not one row), so a rebuild there is correct — and it is driven by a `useLiveQuery`
// over `listFieldDefs('people')`, which re-runs only when a field def changes (never on a people edit).
//
// The build is ASYNC (a `link-to-entity` value resolves to its target's name via a Dexie read). The
// index is a local, rebuildable projection — this hook never persists it to the cloud/backup.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { listFieldDefs, onChange } from '@/db/repository';
import type { ChangeEvent } from '@/db/repository';
import type { FieldDef, Person } from '@/domain/types';
import { applyChange, buildIndex, search, type SearchHit, type SearchIndexBundle } from './searchIndex';

export interface UseSearchIndex {
  /** True once the people snapshot + field schema have resolved and the index bundle exists. */
  ready: boolean;
  /**
   * Run a field-restricted query against the current index. Callers pass the ACTIVE scope keys
   * (built-ins + custom ids) resolved from the checkbox selection. Returns `[]` until ready.
   */
  search: (query: string, fields: string[]) => SearchHit[];
  /**
   * The exact per-field text indexed for one person (`fieldKey -> string`), or `undefined` until
   * ready / for an unknown id. Single source of truth for the matched-field snippet.
   */
  fieldText: (personId: string) => Record<string, string> | undefined;
}

export function useSearchIndex(): UseSearchIndex {
  // The live People custom field schema. A field add/rename/type-change/soft-delete re-runs this
  // query (people edits do NOT touch fieldDefs, so they never re-run it) → the build effect below
  // rebuilds the index with the new field set. This is the coarse, correct path for a SET change.
  const customDefs = useLiveQuery<FieldDef[]>(() => listFieldDefs('people'), []);

  const [bundle, setBundle] = useState<SearchIndexBundle | null>(null);
  // Ref mirrors so the once-installed onChange subscription always sees the latest bundle + schema.
  const bundleRef = useRef<SearchIndexBundle | null>(null);
  const customDefsRef = useRef<FieldDef[]>([]);
  // Serializes ALL incremental index maintenance: every change event is chained onto this promise so
  // applyChange calls apply strictly in emit order, never interleaving their async projectFieldText
  // reads (WR-03). Mirrors the rw-transaction serialization useScopeSelection uses for its writes.
  const maintenanceQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Buffers change events that arrive while the index is still building (bundleRef is null). Without
  // this, a person created after the build's `toArray()` snapshot but before the bundle is assigned
  // is dropped by both paths and stays unsearchable until the next coarse rebuild (WR-02). Drained
  // in emit order once the build completes.
  const pendingEventsRef = useRef<ChangeEvent[]>([]);
  // Late-bound mirror of `enqueueMaintenance` so `handleEvent` can RE-enqueue an event (CR-01)
  // without a circular useCallback dep: handleEvent → enqueueMaintenance → handleEvent would form a
  // cycle (and, given declaration order, a temporal-dead-zone reference). The ref is filled in an
  // effect once enqueueMaintenance exists; handleEvent reads it only at call time.
  const enqueueMaintenanceRef = useRef<(ev: ChangeEvent) => void>(() => {});
  // Sync the schema mirror in an effect (never during render) so the onChange callback — which fires
  // only after mount/commit, on repository writes — always reads the current field set.
  useEffect(() => {
    customDefsRef.current = customDefs ?? [];
  }, [customDefs]);

  // ONE serialized maintenance step for a single change event. Reads the LATEST bundle (a prior
  // queued step may already have swapped it) and the current schema, applies the change, then swaps
  // in a NEW bundle wrapper (around the same mutated index) to bump the `search`/`fieldText`
  // identities so an open result view re-queries and reflects the change LIVE. Reads refs only, so
  // its identity is stable across renders.
  const handleEvent = useCallback(async (ev: ChangeEvent) => {
    const current = bundleRef.current;
    if (!current) return; // index not built yet — the event was (or will be) captured elsewhere
    const person = ev.op === 'delete' ? undefined : await db.people.get(ev.entityId);
    const personById = new Map<string, Person>();
    if (person) personById.set(person.id, person);
    await applyChange(current.index, current.fieldTextById, ev, personById, customDefsRef.current);
    // A coarse rebuild swapped the bundle out from under us mid-await: `current` is now a discarded
    // index, so publishing `swapped` here would clobber the newer bundle and pin search to the stale
    // field schema (CR-01). Don't publish — re-enqueue so the event re-applies to the fresh index.
    if (bundleRef.current !== current) {
      enqueueMaintenanceRef.current(ev);
      return;
    }
    const swapped: SearchIndexBundle = {
      index: current.index,
      fieldTextById: current.fieldTextById,
    };
    bundleRef.current = swapped;
    setBundle(swapped);
  }, []);

  // Chain one event onto the serial maintenance queue. `.catch` keeps the queue alive if a single
  // step throws (a rejected link is otherwise poisoned and drops every later event, WR-03).
  const enqueueMaintenance = useCallback(
    (ev: ChangeEvent) => {
      maintenanceQueueRef.current = maintenanceQueueRef.current
        .then(() => handleEvent(ev))
        .catch((err) => {
          console.error('[useSearchIndex] incremental index maintenance failed', err);
        });
    },
    [handleEvent],
  );

  // Keep the late-bound re-enqueue mirror pointed at the current enqueueMaintenance so handleEvent's
  // CR-01 re-enqueue path always chains onto the live queue. enqueueMaintenance is stable, so this
  // runs once.
  useEffect(() => {
    enqueueMaintenanceRef.current = enqueueMaintenance;
  }, [enqueueMaintenance]);

  // ONE build from the current people snapshot on mount, and a coarse REBUILD whenever the field
  // schema changes. People create/update/delete do NOT trigger this — they flow through the
  // incremental subscription below. Guard against a stale async build clobbering a newer one.
  useEffect(() => {
    if (customDefs === undefined) return;
    let cancelled = false;
    void (async () => {
      const people = await db.people.toArray();
      const next = await buildIndex(people, customDefs);
      if (cancelled) return;
      bundleRef.current = next;
      setBundle(next);
      // Replay any events received during the build window (WR-02). This runs synchronously right
      // after bundleRef is set, so no new emit can interleave: events buffered here are drained in
      // emit order, and any later emit sees a non-null bundleRef and enqueues directly. A buffered
      // event is idempotent against the fresh snapshot — applyChange's index.has guard turns a
      // now-already-present create into a replace and an already-absent delete into a no-op.
      if (pendingEventsRef.current.length > 0) {
        const buffered = pendingEventsRef.current;
        pendingEventsRef.current = [];
        for (const ev of buffered) enqueueMaintenance(ev);
      }
    })();
    return () => {
      cancelled = true;
    };
    // enqueueMaintenance is stable (empty-dep callback chain), so it never re-triggers a rebuild.
  }, [customDefs, enqueueMaintenance]);

  // Incremental maintenance (criterion 3): subscribe ONCE (mirroring useSyncEngine's onChange
  // lifecycle) and route People create/update/delete through the serial queue — never a full
  // rebuild. All emits are post-commit, so a fresh read reflects the persisted row. An event that
  // arrives before the index is built is buffered (not dropped) and replayed by the build (WR-02).
  useEffect(() => {
    const off = onChange((ev) => {
      if (ev.entityType !== 'people') return;
      if (!bundleRef.current) {
        // Index still building — buffer so a write racing the initial build isn't dropped (WR-02).
        pendingEventsRef.current.push(ev);
        return;
      }
      enqueueMaintenance(ev);
    });
    return off;
  }, [enqueueMaintenance]);

  // Stable across renders — identity changes only when the bundle is rebuilt OR incrementally
  // updated, so callers re-query exactly when (and only when) the index actually changed.
  const runSearch = useCallback(
    (query: string, fields: string[]): SearchHit[] =>
      bundle ? search(bundle.index, query, fields) : [],
    [bundle],
  );

  const fieldText = useCallback(
    (personId: string): Record<string, string> | undefined => bundle?.fieldTextById.get(personId),
    [bundle],
  );

  return { ready: bundle !== null, search: runSearch, fieldText };
}
