// Breadcrumb (D-10 / MAP-07 / UI-SPEC S12) — walks the active map's parent chain UP and lets the
// curator click an ancestor crumb to make it active. It is the up-navigation counterpart to the
// portal down-navigation (portals land in 03-06).
//
// The ancestor chain is built by the pure, cycle-safe `buildAncestorChain` (mapHierarchy.ts): a
// tampered cyclic or dangling `parentId` cannot hang the render (threat T-03-09/T-03-10). Crumbs
// read ROOT → current with ChevronRight separators (ink-muted). Each ancestor crumb is a
// `<button>` that calls `onNavigate(ancestorId)`; the current/last crumb is non-interactive ink
// with `aria-current="page"`. A top-level map (no parent) renders nothing (just its own name would
// be redundant with the MapSwitcher trigger). Deep chains cap the visible crumbs and collapse the
// middle to a non-interactive `…` (the overflow DropdownMenu is deferred; the cycle/depth cap in
// mapHierarchy is the NON-negotiable guard).

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { db } from '@/db/schema';
import { buildAncestorChain, type HierarchyNode } from './mapHierarchy';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbProps {
  /** The active map whose ancestor chain is shown. */
  activeMapId: string | null;
  /** Make an ancestor crumb the active map (walks UP, D-10). */
  onNavigate: (id: string) => void;
}

/** Max crumbs shown before the middle collapses to an ellipsis (root + … + last few). */
const MAX_VISIBLE_CRUMBS = 5;

export function Breadcrumb({ activeMapId, onNavigate }: BreadcrumbProps) {
  // Read every map (id/name/parentId) reactively so a parent rename / re-parent updates the strip.
  const maps = useLiveQuery(() => db.maps.toArray(), [], []);

  const chain = useMemo(() => {
    const byId = new Map<string, HierarchyNode>(
      (maps ?? []).map((m) => [m.id, { id: m.id, name: m.name, parentId: m.parentId }]),
    );
    return buildAncestorChain(activeMapId, byId);
  }, [maps, activeMapId]);

  // A top-level map (chain length ≤ 1) shows no breadcrumb — there is no ancestor to navigate to.
  if (chain.length <= 1) return null;

  // Collapse the middle of a deep chain: keep the root, an ellipsis, then the tail.
  const collapsed = collapseChain(chain, MAX_VISIBLE_CRUMBS);

  return (
    <nav className={styles.breadcrumb} aria-label="Map hierarchy" data-testid="map-breadcrumb">
      <ol className={styles.list}>
        {collapsed.map((entry, i) => {
          const isLast = i === collapsed.length - 1;
          return (
            <li key={entry === ELLIPSIS ? `ellipsis-${i}` : entry.id} className={styles.crumbItem}>
              {i > 0 && (
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={styles.separator}
                />
              )}
              {entry === ELLIPSIS ? (
                <span className={styles.ellipsis} aria-hidden="true">
                  …
                </span>
              ) : isLast ? (
                <span className={styles.current} aria-current="page">
                  {entry.name}
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.crumb}
                  data-testid={`breadcrumb-crumb-${entry.id}`}
                  onClick={() => onNavigate(entry.id)}
                >
                  {entry.name}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Sentinel for a collapsed-middle ellipsis entry. */
const ELLIPSIS = Symbol('ellipsis');
type CrumbEntry = HierarchyNode | typeof ELLIPSIS;

/**
 * Collapse a chain longer than `max` to `[root, …, …tail]` so very deep hierarchies stay readable
 * (UI-SPEC S12). The root and the last `max - 2` crumbs (incl. the current map) are kept; the
 * middle becomes a single ellipsis. A chain at or under `max` is returned unchanged.
 */
function collapseChain(chain: HierarchyNode[], max: number): CrumbEntry[] {
  if (chain.length <= max) return chain;
  const tailCount = max - 2; // reserve one slot for root + one for the ellipsis
  return [chain[0], ELLIPSIS, ...chain.slice(chain.length - tailCount)];
}
