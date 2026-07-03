// BrowseList — the virtualized per-type browse surface (S11). Reads rows reactively via
// `useLiveQuery(db.<table>.orderBy('name' | 'updatedAt'))` (Name A-Z default, D-17), with a
// constant 64px row height so a lightweight windowing pass keeps it cheap toward thousands of
// rows (U3 / threat T-03-04). Media is lazy-loaded per visible row by BrowseRow's useEntityThumb.
//
// Sticky header: Heading-20 title + mono count ("People · {n}") + a neutral segmented sort
// toggle (active segment = paper-pull + ink, NEVER amber — U4). States: loading (shimmer rows,
// never a spinner), empty (type glyph + heading + sub-line + ONE amber "Create the first {type}"
// CTA — the only amber here), error, offline (full function from Dexie).
//
// Security: all copy + row text render as React children — never dangerouslySetInnerHTML.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Users, UsersRound, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '@/db/schema';
import { BrowseRow } from './BrowseRow';
import { type BrowseEntity, type BrowseEntityType, PLURAL } from './browseTypes';
import styles from './BrowseList.module.css';

/** Fixed row height (S12) — the constant that makes windowing cheap. */
const ROW_HEIGHT = 64;
/** Extra rows rendered above/below the viewport so fast scrolls don't flash blank. */
const OVERSCAN = 6;

export type BrowseSort = 'name' | 'recent';

export interface BrowseListProps {
  type: BrowseEntityType;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onShowOnMap: (id: string) => void;
  onOpenMap: (id: string) => void;
  /** Opens the create form for this type (empty-state CTA). */
  onCreate: () => void;
}

const TYPE_GLYPH: Record<BrowseEntityType, LucideIcon> = {
  people: Users,
  maps: Building2,
  groups: UsersRound,
  'relationship-links': ArrowLeftRight,
};

const EMPTY_COPY: Record<BrowseEntityType, { heading: string; body: string; cta: string }> = {
  people: {
    heading: 'No people yet.',
    body: "Add someone to start mapping who's where.",
    cta: 'Create the first person',
  },
  maps: {
    heading: 'No locations yet.',
    body: 'Add a place — a map you can open and put people on.',
    cta: 'Create the first location',
  },
  groups: {
    heading: 'No groups yet.',
    body: "Create a group to describe a team, family, or org. You'll connect members in a later step.",
    cta: 'Create the first group',
  },
  'relationship-links': {
    heading: 'No relationship-links yet.',
    body: "Create a relationship record now; you'll connect who it links in a later step.",
    cta: 'Create the first relationship-link',
  },
};

/** Read a type's rows in the requested order. Both orderings are indexed (schema.ts). */
function useBrowseRows(type: BrowseEntityType, sort: BrowseSort): BrowseEntity[] | undefined {
  return useLiveQuery<BrowseEntity[]>(async () => {
    const table =
      type === 'people'
        ? db.people
        : type === 'maps'
          ? db.maps
          : type === 'groups'
            ? db.groups
            : db.relationshipLinks;
    if (sort === 'name') return table.orderBy('name').toArray();
    return table.orderBy('updatedAt').reverse().toArray();
  }, [type, sort]);
}

export function BrowseList({
  type,
  onOpen,
  onEdit,
  onDelete,
  onShowOnMap,
  onOpenMap,
  onCreate,
}: BrowseListProps) {
  const [sort, setSort] = useState<BrowseSort>('name');
  const rows = useBrowseRows(type, sort);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Track the scroll viewport height so windowing can size its render window. A ResizeObserver
  // keeps it correct across layout changes; the effect re-attaches whenever the list re-mounts
  // its scroll container (i.e. when transitioning out of loading/empty into the row list).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows === undefined, rows?.length === 0]);

  // Lightweight windowing: render only the rows intersecting the viewport (+ overscan).
  const { start, end, padTop, padBottom } = useMemo(() => {
    const count = rows?.length ?? 0;
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
  }, [rows?.length, scrollTop, viewportH]);

  const Glyph = TYPE_GLYPH[type];
  const title = PLURAL[type];
  const count = rows?.length;

  return (
    <section className={styles.list} data-testid={`browse-list-${type}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {title}
          {count !== undefined && <span className={styles.titleCount}> · {count}</span>}
        </h1>
        <div className={styles.sortToggle} role="group" aria-label="Sort order">
          <button
            type="button"
            className={sort === 'name' ? `${styles.sortSeg} ${styles.sortSegActive}` : styles.sortSeg}
            aria-pressed={sort === 'name'}
            data-testid="sort-name"
            onClick={() => setSort('name')}
          >
            Name A–Z
          </button>
          <button
            type="button"
            className={
              sort === 'recent' ? `${styles.sortSeg} ${styles.sortSegActive}` : styles.sortSeg
            }
            aria-pressed={sort === 'recent'}
            data-testid="sort-recent"
            onClick={() => setSort('recent')}
          >
            Recently updated
          </button>
        </div>
      </header>

      {rows === undefined ? (
        // Loading: shimmer rows, never a blocking spinner.
        <div className={styles.body} aria-busy="true" data-testid="browse-loading">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={styles.shimmerRow} aria-hidden="true">
              <span className={styles.shimmerThumb} />
              <span className={styles.shimmerText} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        // Empty: type glyph + heading + sub-line + the ONE amber CTA on this surface.
        <div className={styles.empty} data-testid="browse-empty">
          <Glyph size={32} strokeWidth={1.75} className={styles.emptyGlyph} aria-hidden="true" />
          <h2 className={styles.emptyHeading}>{EMPTY_COPY[type].heading}</h2>
          <p className={styles.emptyBody}>{EMPTY_COPY[type].body}</p>
          <button
            type="button"
            className={styles.emptyCta}
            data-testid="browse-empty-cta"
            onClick={onCreate}
          >
            {EMPTY_COPY[type].cta}
          </button>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={styles.body}
          data-testid="browse-scroll"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {rows.slice(start, end).map((entity) => (
              <BrowseRow
                key={entity.id}
                entity={entity}
                type={type}
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
                onShowOnMap={onShowOnMap}
                onOpenMap={onOpenMap}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
