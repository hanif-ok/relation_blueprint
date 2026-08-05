// useSearchIndex — the hook that owns one MiniSearch index instance for the Search view. It reads
// the live People snapshot via `useLiveQuery(db.people.toArray())` and rebuilds the index in a
// `useMemo` whenever that snapshot changes. This full rebuild is deliberately simple and correct
// for the SRCH-01 spine; plan 03 replaces it with incremental add/replace/discard over the
// repository change signal (criterion 3).
//
// The index is a local, rebuildable projection — this hook never persists it to the cloud/backup.

import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { buildIndex, search, type SearchHit } from './searchIndex';

export interface UseSearchIndex {
  /** True once the people snapshot has resolved and the index exists. */
  ready: boolean;
  /**
   * Run a field-restricted query against the current index. For this slice callers pass the full
   * built-in key list as `fields`; plan 02's checkboxes pass a subset. Returns `[]` until ready.
   */
  search: (query: string, fields: string[]) => SearchHit[];
}

export function useSearchIndex(): UseSearchIndex {
  // The live source of truth for the index — re-runs whenever any person changes (D-02 reactivity).
  const people = useLiveQuery(() => db.people.toArray(), []);

  // Rebuild the index whenever the snapshot changes. `undefined` = the query has not resolved yet.
  const index = useMemo(() => (people ? buildIndex(people) : null), [people]);

  // Stable across renders — its identity changes ONLY when the index is rebuilt, so callers can
  // safely memoize their result set on it.
  const runSearch = useCallback(
    (query: string, fields: string[]): SearchHit[] =>
      index ? search(index, query, fields) : [],
    [index],
  );

  return { ready: index !== null, search: runSearch };
}
