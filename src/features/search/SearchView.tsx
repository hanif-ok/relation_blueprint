// SearchView — the Search surface (S1 input + S2 scope panel + S3 windowed results + S4 states).
// A native debounced `<input type="search">` drives a main-thread MiniSearch query (D-02) over the
// ACTIVE scope fields; matches render as BrowseRow-variant rows whose click opens the ProfileSidebar
// (D-10). The field-scope panel (S2) drives WHICH fields the query matches: `resolveActiveFields`
// merges the live People field schema with the persisted subtractive selection, and that active
// key set is passed as the search `fields` argument — so unchecking "Job" drops the blacksmiths.
//
// Three DISTINCT state panels (D-11): a pre-query prompt below the 2-char threshold (D-08), a
// zero-match panel echoing the query as a React child (T-05-01), and the all-fields-off guard when
// every checkbox is OFF (a distinct branch, never the zero-match message, B9). Windowing (constant
// 64px rows) is copied from BrowseList so the list stays cheap toward thousands.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, SearchX, FilterX } from 'lucide-react';
import { db } from '@/db/schema';
import { listFieldDefs } from '@/db/repository';
import type { FieldDef, Person } from '@/domain/types';
import { BUILTIN_FIELD_KEYS, BUILTIN_FIELD_LABELS, MIN_QUERY_LENGTH, type SearchHit } from './searchIndex';
import { useSearchIndex } from './useSearchIndex';
import { useScopeSelection, resolveActiveFields } from './useScopeSelection';
import { ScopePanel } from './ScopePanel';
import { SearchResultRow } from './SearchResultRow';
import browse from '@/features/browse/BrowseList.module.css';
import styles from './SearchView.module.css';

/** Fixed row height (S3) — the constant that makes windowing cheap. Mirrors BrowseList. */
const ROW_HEIGHT = 64;
/** Extra rows rendered above/below the viewport so fast scrolls don't flash blank. */
const OVERSCAN = 6;
/** Debounce before querying as-you-type (D-02). */
const DEBOUNCE_MS = 200;
/** The built-in scope keys, always candidates before the subtractive selection is applied. */
const BUILTIN_KEYS: string[] = [...BUILTIN_FIELD_KEYS];

export interface SearchViewProps {
  onOpen: (id: string) => void;
  onShowOnMap: (id: string) => void;
}

export function SearchView({ onOpen, onShowOnMap }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { search, fieldText } = useSearchIndex();

  // Debounce the query so a fast typist runs one search, not one per keystroke (D-02).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Live people map so rows render current thumbnail/name/tags (skip a transiently-missing person).
  const people = useLiveQuery(() => db.people.toArray(), []);
  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people ?? []) map.set(p.id, p);
    return map;
  }, [people]);

  // The live People custom fields + the persisted subtractive scope selection → the ACTIVE keys.
  const customDefs = useLiveQuery<FieldDef[]>(() => listFieldDefs('people'), []);
  const { stored, setFieldChecked } = useScopeSelection();
  const activeFields = useMemo(
    () => resolveActiveFields(BUILTIN_KEYS, customDefs ?? [], stored),
    [customDefs, stored],
  );
  const allFieldsOff = activeFields.length === 0;

  // Field-key → display label (built-ins + every live custom People field) for the snippet prefix.
  const fieldLabels = useMemo<Record<string, string>>(() => {
    const labels: Record<string, string> = { ...BUILTIN_FIELD_LABELS };
    for (const def of customDefs ?? []) labels[def.id] = def.label;
    return labels;
  }, [customDefs]);

  // The ranked, live-resolved results — each carries its Person AND the hit's match metadata so the
  // row can render the matched-field snippet. Recomputes when the query, index, people, or scope
  // change (the incremental index bumps the `search` identity, so a live add re-queries here too).
  const results = useMemo<{ person: Person; hit: SearchHit }[]>(() => {
    const hits = search(debouncedQuery, activeFields);
    const out: { person: Person; hit: SearchHit }[] = [];
    for (const hit of hits) {
      const person = peopleById.get(hit.id);
      if (person) out.push({ person, hit });
    }
    return out;
  }, [search, debouncedQuery, activeFields, peopleById]);

  const trimmed = debouncedQuery.trim();
  const belowThreshold = trimmed.length < MIN_QUERY_LENGTH;
  const showList = !allFieldsOff && !belowThreshold && results.length > 0;

  // --- Windowing (copied from BrowseList) -----------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Re-measure the viewport whenever the scroll container mounts/unmounts (transitioning between a
  // state panel and the results list). Deps are simple booleans so the linter can check them.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [allFieldsOff, belowThreshold, showList]);

  const { start, end, padTop, padBottom } = useMemo(() => {
    const count = results.length;
    if (count === 0 || viewportH === 0) {
      return { start: 0, end: count, padTop: 0, padBottom: 0 };
    }
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2;
    const last = Math.min(count, first + visible);
    return {
      start: first,
      end: last,
      padTop: first * ROW_HEIGHT,
      padBottom: (count - last) * ROW_HEIGHT,
    };
  }, [results.length, scrollTop, viewportH]);

  // --- Live-region announcement (mirrors App.tsx Show-on-map) ----------------------------
  const announce = allFieldsOff
    ? 'No fields selected'
    : belowThreshold
      ? ''
      : results.length === 0
        ? 'No people match'
        : `${results.length} people match`;

  return (
    <section className={styles.view} data-testid="search-view">
      <div className={styles.inputWrap}>
        <Search size={16} strokeWidth={1.75} className={styles.inputIcon} aria-hidden="true" />
        <input
          type="search"
          className={styles.input}
          placeholder="Search people…"
          aria-label="Search people"
          data-testid="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.main}>
        <ScopePanel stored={stored} onToggle={(key, checked) => void setFieldChecked(key, checked)} />

        <div className={styles.results}>
          {allFieldsOff ? (
            // All-fields-off guard (S4/D-11/B9) — a DISTINCT state, never the zero-match message.
            <div className={browse.empty} data-testid="search-all-off">
              <FilterX size={32} strokeWidth={1.75} className={browse.emptyGlyph} aria-hidden="true" />
              <h2 className={browse.emptyHeading}>Nothing to search</h2>
              <p className={browse.emptyBody}>
                Every field is turned off. Turn at least one field on to search.
              </p>
            </div>
          ) : belowThreshold ? (
            // Pre-query prompt (S4) — below the 2-char threshold (D-08). No CTA (B4).
            <div className={browse.empty} data-testid="search-prequery">
              <Search size={32} strokeWidth={1.75} className={browse.emptyGlyph} aria-hidden="true" />
              <h2 className={browse.emptyHeading}>Search people</h2>
              <p className={browse.emptyBody}>
                Search people by name, tags, or any field — then narrow it with the checkboxes.
              </p>
            </div>
          ) : results.length === 0 ? (
            // Zero-match (S4) — the query echoes as a React child, never injected HTML (T-05-01).
            <div className={browse.empty} data-testid="search-zero-match">
              <SearchX size={32} strokeWidth={1.75} className={browse.emptyGlyph} aria-hidden="true" />
              <h2 className={browse.emptyHeading}>No people match &ldquo;{trimmed}&rdquo;</h2>
              <p className={browse.emptyBody}>
                Check your spelling, or turn more fields on to widen the search.
              </p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className={browse.body}
              data-testid="search-scroll"
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
                {results.slice(start, end).map(({ person, hit }) => (
                  <SearchResultRow
                    key={person.id}
                    entity={person}
                    match={hit.match}
                    terms={hit.terms}
                    fieldText={fieldText(person.id)}
                    fieldLabels={fieldLabels}
                    onOpen={onOpen}
                    onShowOnMap={onShowOnMap}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Visually-hidden result-count live region (announces as results change). */}
      <div className={styles.srOnly} aria-live="polite" role="status">
        {announce}
      </div>
    </section>
  );
}
