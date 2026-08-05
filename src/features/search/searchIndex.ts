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
import { db } from '@/db/schema';
import type { ChangeEvent } from '@/db/repository';
import type { CustomValue, EntityType, FieldDef, Person } from '@/domain/types';

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

/** MiniSearch's built-in term processor (lower-casing etc.) — the search-time processor so a query
 *  is NOT expanded into suffixes (only the INDEX expands). Falls back to a plain lower-case. */
const DEFAULT_PROCESS_TERM =
  (MiniSearch.getDefault('processTerm') as (term: string) => string | string[] | null | undefined) ??
  ((term: string) => term.toLowerCase());

/**
 * INDEX-time term processor enabling INFIX / substring matching (the phase's signature behavior:
 * "smith" must match the Job value "blacksmith", where "smith" is a SUFFIX, not a prefix, of the
 * token — and MiniSearch's `prefix` only matches from a token's START). For each normalized token
 * we index the token PLUS every suffix down to the 2-char query threshold, so a later prefix/exact
 * query on "smith" hits the indexed suffix "smith" of "blacksmith". Only applied at index time;
 * the query keeps the default processor (above) so it is never itself expanded into suffixes.
 */
export function indexTermWithSuffixes(term: string): string[] {
  const processed = DEFAULT_PROCESS_TERM(term);
  if (!processed) return [];
  const bases = Array.isArray(processed) ? processed : [processed];
  const out = new Set<string>();
  for (const base of bases) {
    if (base.length < MIN_QUERY_LENGTH) {
      out.add(base);
      continue;
    }
    for (let start = 0; start <= base.length - MIN_QUERY_LENGTH; start++) {
      out.add(base.slice(start));
    }
  }
  return [...out];
}

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
  /** Matched DOCUMENT terms (e.g. the indexed suffix "smith" for the "blacksmith" value). */
  terms: string[];
  /** Matched QUERY terms (what the user actually typed, e.g. "smith") — the preferred highlight. */
  queryTerms: string[];
}

/**
 * An indexable document: `id` + one string per field key. Built-in keys are always present;
 * custom keys (stable `FieldDef.id`) are added when the People schema defines them (D-03). The
 * shape is dynamic because the custom-field set is data-driven, so keys beyond `id` are `string`.
 */
export type SearchDocument = { id: string } & Record<string, string>;

/**
 * The exact per-field TEXT indexed for one person — `fieldKey -> stringified value` (built-ins +
 * every non-photo custom field). Retained alongside the index as the single source of truth for
 * "the text of field X on person P"; plan 03's matched-field snippet reads it synchronously.
 */
export type FieldTextById = Map<string, Record<string, string>>;

/** The built + retained index pair: the MiniSearch instance and the per-person field-text map. */
export interface SearchIndexBundle {
  index: MiniSearch<SearchDocument>;
  fieldTextById: FieldTextById;
}

/** Resolve a Dexie table for a `link-to-entity` target family (mirrors CustomFieldRows.LinkValue). */
function tableFor(targetType: EntityType | undefined) {
  switch (targetType) {
    case 'people':
      return db.people;
    case 'maps':
      return db.maps;
    case 'groups':
      return db.groups;
    case 'relationship-links':
      return db.relationshipLinks;
    default:
      return null;
  }
}

/**
 * Stringify ONE custom value to its searchable text (D-03): text/phone as-is; number/date
 * stringified; tags joined; `link-to-entity` → the target entity's display NAME (resolved exactly
 * like CustomFieldRows.LinkValue — a removed/wrong-type target contributes nothing); photo excluded
 * upstream. An empty/absent value yields the empty string.
 */
async function stringifyCustomValue(def: FieldDef, value: CustomValue | undefined): Promise<string> {
  if (value === null || value === undefined) return '';
  switch (def.type) {
    case 'text':
    case 'phone':
      return typeof value === 'string' ? value : String(value);
    case 'number':
    case 'date':
      return String(value);
    case 'tags':
      return Array.isArray(value) ? value.join(' ') : '';
    case 'link-to-entity': {
      const table = tableFor(def.targetType);
      if (!table || typeof value !== 'string') return '';
      const target = await table.get(value);
      return target?.name ?? '';
    }
    default:
      // photo has no text (D-03) and is never passed here; any unknown type → no text.
      return '';
  }
}

/**
 * Project ONE person to its per-field text map. Built-ins first (name/phone/description/tags/notes),
 * then every non-deleted, non-photo custom field keyed by `FieldDef.id`. Quarantine keys never
 * appear: we read values BY `FieldDef.id`, never by iterating the raw `custom` map, so a
 * `__quarantine:*` set-aside key is inherently skipped (repository.ts QUARANTINE_KEY_PREFIX intent).
 */
async function projectFieldText(person: Person, activeDefs: FieldDef[]): Promise<Record<string, string>> {
  const text: Record<string, string> = {
    'builtin:name': person.name ?? '',
    'builtin:phone': person.phone ?? '',
    'builtin:description': person.description ?? '',
    'builtin:tags': (person.tags ?? []).join(' '),
    'builtin:notes': person.notes ?? '',
  };
  const custom = person.custom ?? {};
  for (const def of activeDefs) {
    if (def.type === 'photo') continue; // photo/gallery excluded from the index (no text, D-03)
    text[def.id] = await stringifyCustomValue(def, custom[def.id]);
  }
  return text;
}

/**
 * Build a fresh MiniSearch index over the given people AND the live People custom `FieldDef`s
 * (D-03). The field set is the five built-in keys plus each NON-deleted custom def's id; custom
 * fields keep the neutral default boost (they are simply absent from the boost map). Configured
 * with `fuzzy: 0.2` + `prefix: true` + the name-boosted ranking in `searchOptions`, so those are
 * the DEFAULTS every `search` inherits and a per-search `{ fields }` restriction merges over them.
 *
 * Async because `link-to-entity` values resolve to their target's name via a Dexie read. Returns
 * the index PLUS the `fieldTextById` projection (single source of truth for plan 03's snippet).
 */
export async function buildIndex(
  people: Person[],
  customDefs: FieldDef[] = [],
): Promise<SearchIndexBundle> {
  const activeDefs = customDefs.filter((def) => !def.deleted && def.type !== 'photo');
  const fieldKeys = [...BUILTIN_FIELD_KEYS, ...activeDefs.map((def) => def.id)];

  const index = new MiniSearch<SearchDocument>({
    fields: fieldKeys,
    idField: 'id',
    // Index-time infix expansion (suffix indexing) so a substring query like "smith" matches the
    // "blacksmith" Job value (SRCH-02 signature behavior) — MiniSearch prefix only matches token
    // starts, so a suffix must be indexed explicitly.
    processTerm: indexTermWithSuffixes,
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { ...BUILTIN_FIELD_BOOSTS },
      // Do NOT expand the QUERY into suffixes — only the index is expanded (above).
      processTerm: DEFAULT_PROCESS_TERM,
    },
  });

  const fieldTextById: FieldTextById = new Map();
  const documents: SearchDocument[] = [];
  for (const person of people) {
    const text = await projectFieldText(person, activeDefs);
    fieldTextById.set(person.id, text);
    documents.push({ id: person.id, ...text });
  }
  index.addAll(documents);

  return { index, fieldTextById };
}

/**
 * Run a field-restricted query. Returns `[]` when the trimmed query is below the 2-char threshold
 * (D-08) OR when `fields` is empty (no scope selected) — otherwise queries only the supplied
 * fields (the scoping seam plan 02 drives). Maps each MiniSearch result to a `SearchHit`, keeping
 * `match`/`terms` for plan 03.
 */
export function search(
  index: MiniSearch<SearchDocument>,
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
    queryTerms: r.queryTerms,
  }));
}

/**
 * Apply ONE repository change event to an existing index — the incremental freshness path (SRCH-01
 * criterion 3): the index updates through the repository change signal instead of being rebuilt on
 * every load. Maps `op` to MiniSearch:
 *   - `create` → build the person's document and `index.add` it (+ set its `fieldTextById` entry),
 *   - `update` → `index.replace` (discard+add); guarded by `index.has` so an update for a not-yet-
 *     indexed row falls back to `add`,
 *   - `delete` → `index.discard` the id and drop its `fieldTextById` entry.
 * Only `entityType === 'people'` acts here — a `fieldDefs` schema change (which alters the indexed
 * field SET) is a coarse rebuild owned by the hook, not this per-entity path.
 *
 * `personById` supplies the current row for a create/update (the caller reads it post-commit); a
 * create/update whose person is absent (a create racing a delete) converges to the deleted state.
 * Async because the document build resolves `link-to-entity` target names via a Dexie read.
 */
export async function applyChange(
  index: MiniSearch<SearchDocument>,
  fieldTextById: FieldTextById,
  ev: ChangeEvent,
  personById: Map<string, Person>,
  customDefs: FieldDef[] = [],
): Promise<void> {
  if (ev.entityType !== 'people') return;

  if (ev.op === 'delete') {
    if (index.has(ev.entityId)) index.discard(ev.entityId);
    fieldTextById.delete(ev.entityId);
    return;
  }

  const person = personById.get(ev.entityId);
  if (!person) {
    // The row is gone (a create/update racing a delete) — converge to the deleted state.
    if (index.has(ev.entityId)) index.discard(ev.entityId);
    fieldTextById.delete(ev.entityId);
    return;
  }

  const activeDefs = customDefs.filter((def) => !def.deleted && def.type !== 'photo');
  const text = await projectFieldText(person, activeDefs);
  fieldTextById.set(person.id, text);
  const doc: SearchDocument = { id: person.id, ...text };
  // replace = discard+add; guard the not-yet-indexed case (a fresh create arriving as an update).
  if (index.has(person.id)) index.replace(doc);
  else index.add(doc);
}
