// GraphView — the viewer-only relationship graph (REL-04, D-11/D-12/D-13). A react-cytoscapejs
// host renders people (round avatar nodes) + groups (paper-shade square nodes) as nodes and
// relationship-links as edges (arrowhead when directed), all on the shared slate canvas.
//
// Reactive + pure: `elements` come from the pure `toGraphElements` over the people/groups/links
// live queries; the token-driven `graphStyle` colors them; node/edge labels render as Cytoscape
// canvas text (never injected HTML — T-04-01).
//
// Layout (D-13): `cose` force-directed on first build; on `layoutstop` the node positions are
// cached to the Dexie `meta` table, and a reopen whose whole node-set is cached uses `preset` for
// an instant, physics-free render. A node-set change invalidates the cache (→ fresh `cose`).
//
// Interaction (viewer-only, locked by PROJECT.md): `autoungrabify` + `boxSelectionEnabled={false}`
// so no drag mutates data; a node tap opens its ProfileSidebar through the existing selection→AT
// bridge (R7). Opening the graph with an `egoId` centers + amber-highlights that node (D-12).
//
// Resource safety: person-node avatar object-URLs are resolved in an effect keyed by photo hash
// and REVOKED on unmount / hash change (Pitfall 2 / T-04-04) — no leak as the graph re-renders.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import CytoscapeComponent from 'react-cytoscapejs';
import type cytoscape from 'cytoscape';
import { Share2 } from 'lucide-react';
import { db } from '@/db/schema';
import { resolveMediaUrl } from '@/media/mediaManager';
import { toGraphElements, type GraphPositions } from './graphElements';
import { graphStyle } from './graphStyle';
import { hasCachedPositions, loadPositions, savePositions } from './positionCache';
import styles from './GraphView.module.css';

export interface GraphViewProps {
  /**
   * The entity id to treat as the ego node — centered + amber-highlighted — when the graph is
   * opened from that entity's profile (D-12). `null`/absent = a plain graph with no ego emphasis.
   */
  egoId?: string | null;
  /**
   * Open an entity's ProfileSidebar (reuses the existing selection→AT bridge, R7). Only the two
   * node families are graph nodes; a node's `kind` disambiguates the table.
   */
  onSelectNode: (kind: 'people' | 'groups', id: string) => void;
}

/** e2e-only: publish the Cytoscape core on window so Playwright can drive node taps (mirrors __rb). */
const CY_GLOBAL = import.meta.env.VITE_E2E === 'true' ? '__cyGraph' : undefined;

export function GraphView({ egoId = null, onSelectNode }: GraphViewProps) {
  const people = useLiveQuery(() => db.people.toArray(), []);
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const links = useLiveQuery(() => db.relationshipLinks.toArray(), []);

  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  // Probe the position cache ONCE on mount (undefined-until-loaded is ambiguous via useLiveQuery,
  // so a probed flag distinguishes "still loading" from "no cache" for the layout decision).
  const [posCache, setPosCache] = useState<{ probed: boolean; positions?: GraphPositions }>({
    probed: false,
  });

  const cyRef = useRef<cytoscape.Core | null>(null);
  const attachedRef = useRef<cytoscape.Core | null>(null);
  // Keep the latest onSelectNode reachable from the once-attached tap handler.
  const onSelectRef = useRef(onSelectNode);
  useEffect(() => {
    onSelectRef.current = onSelectNode;
  }, [onSelectNode]);

  useEffect(() => {
    let cancelled = false;
    void loadPositions().then((positions) => {
      if (!cancelled) setPosCache({ probed: true, positions });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = people === undefined || groups === undefined || links === undefined;

  const nodeIds = useMemo(
    () => [...(people ?? []).map((p) => p.id), ...(groups ?? []).map((g) => g.id)],
    [people, groups],
  );

  // Use the preset fast-path only when the cache covers EVERY current node (else a fresh cose).
  const usePreset = posCache.probed && hasCachedPositions(posCache.positions, nodeIds);

  const elements = useMemo(
    () =>
      toGraphElements(
        people ?? [],
        groups ?? [],
        links ?? [],
        usePreset ? posCache.positions : undefined,
      ),
    [people, groups, links, usePreset, posCache.positions],
  );

  const edgeCount = useMemo(() => elements.filter((e) => 'source' in e.data).length, [elements]);

  // Stable layout object: preset from cache, else a one-shot cose. Only changes when the
  // preset/cose decision flips (node-set invalidation) — NOT on every data tick (Pitfall 5).
  const layout = useMemo(
    () => (usePreset ? { name: 'preset' } : { name: 'cose', animate: false }),
    [usePreset],
  );

  // Resolve person-node avatar object-URLs; REVOKE on unmount / when the photo-hash set changes
  // (Pitfall 2 / T-04-04). Keyed by a stable id:hash signature so it only re-runs on real changes.
  const photoKey = useMemo(
    () => (people ?? []).map((p) => `${p.id}:${p.photo?.hash ?? ''}`).join('|'),
    [people],
  );
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const next: Record<string, string> = {};
    const withPhoto = (people ?? []).filter((p) => p.photo?.hash);
    void Promise.all(
      withPhoto.map(async (p) => {
        const url = await resolveMediaUrl(p.photo!.hash);
        if (url) {
          next[p.id] = url;
          created.push(url);
        }
      }),
    ).then(() => {
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setAvatarUrls(next);
    });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  // Paint resolved avatars onto their person nodes (background-image is per-node runtime style).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes('[kind = "people"]').forEach((n) => {
        const url = avatarUrls[n.id()];
        if (url) {
          n.style({ 'background-image': url, 'background-fit': 'cover' });
        } else {
          n.removeStyle('background-image');
        }
      });
    });
  }, [avatarUrls, elements]);

  // Edge-label toggle (ON by default; UI-SPEC B4) — reversible inline text-opacity, no restyle churn.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().style('text-opacity', showEdgeLabels ? 1 : 0);
  }, [showEdgeLabels, elements]);

  // Ego emphasis (D-12): amber-ring + center/zoom the entity the graph was opened from.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('ego');
    if (!egoId) return;
    const node = cy.getElementById(egoId);
    if (node.nonempty()) {
      node.addClass('ego');
      cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
    }
  }, [egoId, elements]);

  // Attach tap + layoutstop handlers ONCE per Cytoscape instance (the cy callback fires on every
  // update). The tap handler reads the latest onSelectNode via a ref so it never goes stale.
  const registerCy = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;
    if (attachedRef.current === cy) return;
    attachedRef.current = cy;
    cy.on('tap', 'node', (e) => {
      const node = e.target;
      onSelectRef.current(node.data('kind') as 'people' | 'groups', node.id());
    });
    cy.one('layoutstop', () => {
      void savePositions(cy);
    });
  }, []);

  if (loading) {
    return (
      <div className={styles.root} data-testid="graph-view">
        <div className={styles.centered}>
          <span className={styles.loading}>Laying out graph…</span>
        </div>
      </div>
    );
  }

  // Empty (no relationships in the DB) — the graph exists to explain connections (UI-SPEC R6).
  if (edgeCount === 0) {
    return (
      <div className={styles.root} data-testid="graph-view">
        <div className={styles.centered} data-testid="graph-empty">
          <Share2 size={32} strokeWidth={1.75} className={styles.emptyGlyph} aria-hidden="true" />
          <h2 className={styles.emptyHeading}>No connections yet.</h2>
          <p className={styles.emptySub}>
            Add relationships from a person&rsquo;s or group&rsquo;s profile, then come back to see
            how everyone connects.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="graph-view">
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={showEdgeLabels}
          data-testid="graph-edge-labels-toggle"
          onClick={() => setShowEdgeLabels((v) => !v)}
        >
          Relationship labels {showEdgeLabels ? 'on' : 'off'}
        </button>
        <span className={styles.viewerNote}>Viewer-only — edit relationships from a profile.</span>
      </div>
      <CytoscapeComponent
        className={styles.canvas}
        elements={CytoscapeComponent.normalizeElements(elements)}
        stylesheet={graphStyle}
        layout={layout}
        cy={registerCy}
        global={CY_GLOBAL}
        autoungrabify
        boxSelectionEnabled={false}
      />
    </div>
  );
}
