// searchIndex — the SRCH-01 MiniSearch index service (the one genuinely net-new module this
// phase). It is a LOCAL, rebuildable projection of the Dexie `people` table: build one document
// per Person keyed by stable built-in field ids, index with moderate fuzzy + prefix matching
// (D-06) and a name-boosted ranking (D-07), and expose a field-restricted `search` whose `fields`
// argument is the query-time scoping seam plan 02's checkboxes will drive.
//
// The index NEVER enters the cloud/backup serializer (no SyncEngine/BackupSchema change) — it is a
// derived convenience, rebuilt from `db.people` (threat T-05-NS: no new exfiltration surface).
//
// The built-in field keys chosen here are used TWICE: as the MiniSearch document field names AND
// (plan 02) as the scope-checkbox keys — so plan 02 supplies a SUBSET of these keys unchanged.

import MiniSearch, { type SearchResult } from 'minisearch';
import type { Person } from '@/domain/types';

/**
 * The five searchable built-in People attributes, keyed by STABLE ids (never by label — a label
 * is display-only). Ordered as they appear in the scope panel (D-03: built-ins first). These
 * strings are the MiniSearch document field names AND the plan-02 scope-checkbox keys.
 */
export const BUILTIN_FIELD_KEYS = [
  'builtin:name',
  'builtin:phone',
  'builtin:description',
  'builtin:tags',
  'builtin:notes',
] as const;

/** A stable built-in searchable-field key. */
export type BuiltinFieldKey = (typeof BUILTIN_FIELD_KEYS)[number];

/** Display labels for the built-in field keys (scope-panel labels, snippet prefixes in plan 03). */
export const BUILTIN_FIELD_LABELS: Record<BuiltinFieldKey, string> = {
  'builtin:name': 'Name',
  'builtin:phone': 'Phone',
  'builtin:description': 'Description',
  'builtin:tags': 'Tags',
  'builtin:notes': 'Notes',
};

/**
 * D-07 field-boosted ranking weights: Name highest (3), then Tags/Phone (2), then
 * Description/Notes (1). A name hit outranks a stray notes hit. Custom fields (plan 02) get the
 * neutral default weight of 1 by simply being absent from this map.
 */
export const BUILTIN_FIELD_BOOSTS: Record<BuiltinFieldKey, number> = {
  'builtin:name': 3,
  'builtin:tags': 2,
  'builtin:phone': 2,
  'builtin:description': 1,
  'builtin:notes': 1,
};

/** D-08 two-char threshold: a trimmed query shorter than this returns no results. */
export const MIN_QUERY_LENGTH = 2;

/** Per-term → matched-field-names match metadata from MiniSearch (kept so plan 03 can snippet). */
export type MatchInfo = SearchResult['match'];

/**
 * One ranked search hit. `match`/`terms` are RETAINED (not dropped) so plan 03's matched-field
 * snippet can read which field matched without re-querying.
 */
export interface SearchHit {
  id: string;
  score: number;
  match: MatchInfo;
  terms: string[];
}

/** A person's indexable document: `id` + each built-in key mapped to its (stringified) value. */
type PersonDocument = Record<BuiltinFieldKey, string> & { id: string };

/** Map a Person to its index document — tags joined with a space; absent built-ins → empty string. */
function toDocument(person: Person): PersonDocument {
  return {
    id: person.id,
    'builtin:name': person.name ?? '',
    'builtin:phone': person.phone ?? '',
    'builtin:description': person.description ?? '',
    'builtin:tags': (person.tags ?? []).join(' '),
    'builtin:notes': person.notes ?? '',
  };
}

/**
 * Build a fresh MiniSearch index over the given people. Configured with `fuzzy: 0.2` (moderate
 * edit-distance typo tolerance) + `prefix: true` (so "smi" matches "Smith" as you type) + the
 * name-boosted ranking. These live in `searchOptions` so they are the DEFAULTS every `search`
 * call inherits; a per-search `{ fields }` restriction merges over them without dropping them.
 */
export function buildIndex(people: Person[]): MiniSearch<PersonDocument> {
  const index = new MiniSearch<PersonDocument>({
    fields: [...BUILTIN_FIELD_KEYS],
    idField: 'id',
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { ...BUILTIN_FIELD_BOOSTS },
    },
  });
  index.addAll(people.map(toDocument));
  return index;
}

/**
 * Run a field-restricted query. Returns `[]` when the trimmed query is below the 2-char threshold
 * (D-08) OR when `fields` is empty (no scope selected) — otherwise queries only the supplied
 * fields (the scoping seam plan 02 drives). Maps each MiniSearch result to a `SearchHit`, keeping
 * `match`/`terms` for plan 03.
 */
export function search(
  index: MiniSearch<PersonDocument>,
  query: string,
  fields: string[],
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH || fields.length === 0) return [];
  return index.search(trimmed, { fields }).map((r) => ({
    id: String(r.id),
    score: r.score,
    match: r.match,
    terms: r.terms,
  }));
}
