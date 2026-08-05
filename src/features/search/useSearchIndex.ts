// useSearchIndex — the hook that owns one MiniSearch index bundle for the Search view. It reads
// the live People snapshot AND the live People custom `FieldDef`s (so the indexed field set stays
// in sync as fields are added/renamed/soft-deleted, D-03), then rebuilds the index whenever either
// changes. The build is ASYNC (a `link-to-entity` value resolves to its target's name via a Dexie
// read), so the bundle is held in state and swapped in when the async build resolves.
//
// This full rebuild is deliberately simple and correct for the field-scope slice; plan 03 replaces
// it with incremental add/replace/discard over the repository change signal.
//
// The index is a local, rebuildable projection — this hook never persists it to the cloud/backup.

import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { listFieldDefs } from '@/db/repository';
import { buildIndex, search, type SearchHit, type SearchIndexBundle } from './searchIndex';

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
   * ready / for an unknown id. Single source of truth for plan 03's matched-field snippet.
   */
  fieldText: (personId: string) => Record<string, string> | undefined;
}

export function useSearchIndex(): UseSearchIndex {
  // Live sources of truth for the index — re-run whenever a person OR a People field def changes.
  const people = useLiveQuery(() => db.people.toArray(), []);
  const customDefs = useLiveQuery(() => listFieldDefs('people'), []);

  const [bundle, setBundle] = useState<SearchIndexBundle | null>(null);

  // Rebuild the index whenever the people snapshot or the field schema changes. The build is async
  // (link-to-entity name resolution); guard against a stale resolve clobbering a newer one.
  useEffect(() => {
    if (people === undefined || customDefs === undefined) return;
    let cancelled = false;
    void buildIndex(people, customDefs).then((next) => {
      if (!cancelled) setBundle(next);
    });
    return () => {
      cancelled = true;
    };
  }, [people, customDefs]);

  // Stable across renders — identity changes ONLY when the bundle is rebuilt, so callers can
  // safely memoize their result set on it.
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
