// GraphView — the viewer-only relationship graph (REL-04, D-11/D-12/D-13). A react-cytoscapejs
// host renders people (round avatar nodes) + groups (paper-shade square nodes) as nodes and
// relationship-links as edges (arrowhead when directed), all on the shared slate canvas.
//
// Reactive + pure: `elements` come from the pure `toGraphElements` over the people/groups/links
// live queries; the token-driven `graphStyle` colors them; node/edge labels render as Cytoscape
// canvas text (never injected HTML — T-04-01).
//
// Layout (D-08, supersedes D-13 full-invalidation): `cose` force-directed on first build; on
// `layoutstop` the node positions are cached to the Dexie `meta` table. A reopen partitions the
// node-set via `partitionCached` — a fully-cached set renders instantly with `preset`; a node-set
// change now KEEPS every saved position and auto-places ONLY the newcomer (lock the cached anchors,
// run `cose` over the whole graph so just the unlocked newcomer relaxes into place, unlock, save).
// A `suspendSaveRef` save-guard fences the `layoutstop` auto-save; it stays false here (every layout
// SHOULD persist) and exists for Plan 04's transient ego overlay to fence itself off.
//
// Interaction (viewer-only, locked by PROJECT.md): nodes are grabbable (POL-02) but drag is
// LAYOUT-ONLY — `dragfree` sticky-persists the new position to the `graphPositions` meta row and
// NEVER mutates `db.people`/`db.relationshipLinks`. A node tap (no movement) still opens its
// ProfileSidebar through the existing selection→AT bridge (R7); `boxSelectionEnabled={false}` keeps
// marquee-select off. A "Reset layout" button clears the saved positions and re-runs a fresh `cose`.
//
// Ego focus (POL-03, D-10..D-13): opening the graph from a profile — or tapping any node — re-lays
// the WHOLE graph out concentrically around that ego (ego at centre, nodes ringed by hop-distance
// via `computeHopLevels`), and focus follows subsequent taps. This is a TRANSIENT overlay: on enter
// the resting base positions are snapshotted into `basePosRef`, and the concentric layout is fenced
// off the auto-save (`suspendSaveRef` stays true for the whole focus session) so it NEVER overwrites
// the persisted base. Exit focus (a toolbar control) — or closing the ProfileSidebar (egoId -> null)
// — stops any in-flight animation and restores the exact base via `cy.nodes().positions()` (no
// layout, no save). Exit focus is DISTINCT from Reset layout: it keeps the manual positions and only
// drops the overlay, whereas Reset layout clears the saved `graphPositions` row.
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
import { clearPositions, loadPositions, partitionCached, savePositions } from './positionCache';
import { computeHopLevels, concentricValue, type Adjacency } from './egoLayout';
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
  // The currently-focused ego (POL-03, D-10/D-11). Seeded from the `egoId` prop AND from node taps
  // (focus follows the tap). `null` = no focus, the plain saved base layout. This is a TRANSIENT
  // view-state overlay — it never persists (the concentric run is fenced off the auto-save).
  const [focusedId, setFocusedId] = useState<string | null>(egoId);
  // Mirror the `egoId` prop into `focusedId` whenever the prop changes, via React's official
  // "adjust state during render" pattern (NOT an effect — set-state-in-effect cascades renders).
  // Opening the graph from a profile sets egoId → focus; closing the ProfileSidebar clears egoId →
  // null → exits focus. Node taps set focusedId independently (focus follows the tap), so this is a
  // sync-on-prop-change, not a derived value.
  const [prevEgoId, setPrevEgoId] = useState<string | null>(egoId);
  if (egoId !== prevEgoId) {
    setPrevEgoId(egoId);
    setFocusedId(egoId);
  }
  // Probe the position cache ONCE on mount (undefined-until-loaded is ambiguous via useLiveQuery,
  // so a probed flag distinguishes "still loading" from "no cache" for the layout decision).
  const [posCache, setPosCache] = useState<{ probed: boolean; positions?: GraphPositions }>({
    probed: false,
  });
  // Fence-lifted re-trigger for the newcomer-placement effect (WR-01). The placement effect is fenced
  // by `suspendSaveRef` while an ego-focus session is active, so a newcomer that arrives mid-focus is
  // NOT placed then (and NOT recorded in `placedMissingRef`). Bumping this counter in BOTH
  // concentric-overlay exit paths — right AFTER `suspendSaveRef.current = false` — re-runs the
  // placement effect once the fence has actually cleared, so the mid-focus newcomer is finally placed
  // on exit. A counter in the deps (not `focusedId`) is the deterministic trigger; it re-checks
  // placement AFTER the async restore path clears the fence, which a synchronously-re-running effect
  // (keyed on `focusedId`) would miss because it would still observe the fence up.
  const [postFocusPlaceTick, setPostFocusPlaceTick] = useState(0);

  const cyRef = useRef<cytoscape.Core | null>(null);
  const attachedRef = useRef<cytoscape.Core | null>(null);
  // Save-guard seam (POL-02) — the FIRST line of the `layoutstop` handler bails when this is true.
  // It STAYS FALSE in this plan: every layout here (fresh cose, reset cose, newcomer placement)
  // SHOULD persist. It exists so Plan 04's transient ego overlay can fence its layout off the
  // auto-save (a concentric overlay must never clobber the saved base positions — D-12/D-13).
  const suspendSaveRef = useRef(false);
  // Ego overlay (POL-03) — the base resting positions snapshotted on ENTER of a focus session, so
  // Exit focus can restore the EXACT saved base with no layout and no save (never overwriting the
  // persisted positions — Pitfall 1). Captured once per session (manual OR cose base) and cleared
  // on exit. `prevFocusedRef` distinguishes ENTER / re-ego / EXIT; `egoLayoutRef` holds the running
  // concentric layout so Exit can stop an in-flight animation before restoring.
  const basePosRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const prevFocusedRef = useRef<string | null>(null);
  const egoLayoutRef = useRef<cytoscape.Layouts | null>(null);
  // The newcomer node-set signature already auto-placed — so the partial-cache placement effect
  // runs exactly once per node-set change (not on every unrelated data tick).
  const placedMissingRef = useRef('');
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

  // Three-way layout gate (D-08 — supersedes the binary preset/cose): split the current node-set
  // into cached anchors vs newcomers. allCached → preset fast-path; noneCached → fresh cose;
  // partial → preset for the anchors, then the placement effect below cose-places only the newcomer.
  const partition = useMemo(
    () => partitionCached(posCache.positions, nodeIds),
    [posCache.positions, nodeIds],
  );
  // Feed saved positions to the elements whenever ANY are cached (allCached or partial) so cached
  // nodes snap to their saved spots; a newcomer simply has no position and is placed imperatively.
  // noneCached (or not-yet-probed) → undefined, so `cose` lays the whole graph out fresh.
  const usePresetPositions = posCache.probed && !partition.noneCached;

  const elements = useMemo(
    () =>
      toGraphElements(
        people ?? [],
        groups ?? [],
        links ?? [],
        usePresetPositions ? posCache.positions : undefined,
      ),
    [people, groups, links, usePresetPositions, posCache.positions],
  );

  const edgeCount = useMemo(() => elements.filter((e) => 'source' in e.data).length, [elements]);

  // Stable layout object: preset whenever cached anchors exist (allCached or partial), else a
  // one-shot cose. Only changes when the preset/cose decision flips — NOT on every data tick
  // (Pitfall 5). The partial case renders preset here; the placement effect handles the newcomer.
  const layout = useMemo(
    () => (usePresetPositions ? { name: 'preset' } : { name: 'cose', animate: false }),
    [usePresetPositions],
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

  // Ego emphasis (D-12), part 1 — the amber-ring class, now keyed on `focusedId` (the tap-follows
  // focus, not just the prop). Re-toggled whenever `elements` rebuild so the ring survives every
  // graph re-render. Class-only: it must NOT touch the viewport, or an unrelated DB mutation (a
  // fresh `elements` reference from useLiveQuery) would re-run it and discard the user's pan/zoom.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('ego');
    if (focusedId) cy.getElementById(focusedId).addClass('ego');
  }, [focusedId, elements]);

  // Concentric ego overlay (POL-03, D-10/D-11/D-12) — the whole graph re-lays-out concentrically
  // around `focusedId` (ego centre, nodes ringed by hop-distance), following taps, WITHOUT ever
  // overwriting the persisted base positions. The single landmine (Pitfall 1) is the global
  // `layoutstop` auto-save: it would clobber the base the instant this transient concentric layout
  // stops. `suspendSaveRef` fences it for the WHOLE focus session (set true on enter, kept true
  // through re-egos, dropped only on exit AFTER the in-flight layout is stopped and the base is
  // restored — so no stray concentric layoutstop can ever persist). This replaces the old
  // `cy.animate({center,zoom})` pan (the concentric run repositions instead of panning; all ego
  // layouts use `fit:false` — WR-01). Keyed on `focusedId` + `elements` so the overlay re-applies
  // after any graph rebuild while focused, mirroring the amber-class effect.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const prev = prevFocusedRef.current;

    if (focusedId) {
      const egoNode = cy.getElementById(focusedId);
      if (egoNode.empty()) {
        // The ego node isn't in the graph yet (elements still catching up) — wait for the rebuild.
        prevFocusedRef.current = focusedId;
        return;
      }
      // Snapshot the base ONCE per session (on ENTER). basePosRef null means we haven't captured a
      // base for this focus yet (fresh enter, or a deferred-node enter); a re-ego keeps the base.
      if (!basePosRef.current) {
        basePosRef.current = Object.fromEntries(
          cy.nodes().map((n) => [n.id(), { ...n.position() }]),
        );
      }
      // Build an UNDIRECTED adjacency from the graph's edges → hop-distance from the ego.
      const adjacency: Adjacency = {};
      cy.nodes().forEach((n) => {
        adjacency[n.id()] = [];
      });
      cy.edges().forEach((e) => {
        adjacency[e.source().id()]?.push(e.target().id());
      });
      const hop = computeHopLevels(adjacency, focusedId);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Fence the auto-save, then run the transient concentric layout (nearer hop → inner ring).
      suspendSaveRef.current = true;
      egoLayoutRef.current = cy.layout({
        name: 'concentric',
        concentric: (n: cytoscape.NodeSingular) => concentricValue(hop[n.id()] ?? 0),
        levelWidth: () => 1,
        minNodeSpacing: 40,
        fit: false,
        // prefers-reduced-motion → snap (no tween, Accessibility); else animate only the final
        // positions. `'end'` is a valid runtime value for concentric but @types/cytoscape narrows
        // `animate` to boolean, so cast it here.
        animate: (reduced ? false : 'end') as unknown as boolean,
        animationDuration: 300,
      });
      egoLayoutRef.current.run();
      prevFocusedRef.current = focusedId;
    } else if (prev !== null) {
      // EXIT (focusedId → null): stop any in-flight ego animation (its layoutstop is still fenced),
      // then restore the exact base with NO layout and NO save — `cy.nodes().positions()` sets
      // positions directly and never emits layoutstop, so the persisted base is never touched.
      egoLayoutRef.current?.stop();
      egoLayoutRef.current = null;
      const base = basePosRef.current;
      if (base) {
        cy.nodes().positions((n) => base[n.id()] ?? n.position());
        cy.nodes().removeClass('ego');
        basePosRef.current = null;
        // Safe to drop the fence now: the in-flight layout is stopped (no pending layoutstop) and
        // the restored positions equal what is already persisted, so nothing can clobber the base.
        suspendSaveRef.current = false;
        prevFocusedRef.current = null;
        // Re-run the (now-unfenced) placement effect so a newcomer added DURING focus is finally
        // placed (WR-01). The fence is down as of the line above, so this synchronous exit path's
        // re-trigger observes it cleared.
        setPostFocusPlaceTick((t) => t + 1);
      } else {
        // No snapshot (focus entered before a base was captured) — fall back to the persisted base.
        void loadPositions().then((positions) => {
          if (positions) cy.nodes().positions((n) => positions[n.id()] ?? n.position());
          cy.nodes().removeClass('ego');
          suspendSaveRef.current = false;
          prevFocusedRef.current = null;
          // Bump the re-trigger INSIDE the promise callback — only here has the async restore
          // actually cleared the fence, so the placement effect now runs unfenced and places any
          // mid-focus newcomer (WR-01). A synchronous re-run would still see the fence up.
          setPostFocusPlaceTick((t) => t + 1);
        });
      }
    } else {
      prevFocusedRef.current = focusedId;
    }
  }, [focusedId, elements]);

  // Partial-cache placement (D-08 "place only the newcomer"). When some nodes are cached and ≥1 is
  // new, the cached anchors already sit at their saved spots (preset render above). Lock those
  // anchors, run a full-graph `cose` so ONLY the unlocked newcomer relaxes into place around them
  // (`fit: false` preserves the viewport — WR-01), then unlock. Persistence flows SOLELY through the
  // fenced `layoutstop` handler (that cose emits `layoutstop`, which runs the save→reload→setPosCache
  // chain exactly once — IN-01, no redundant explicit save here).
  //
  // FENCED by `suspendSaveRef` (WR-01, mirrors the layoutstop guard): the effect returns BEFORE
  // recording the newcomer in `placedMissingRef` while an ego-focus session is active, so a newcomer
  // added mid-focus is neither placed then (its concentric snapshot must never persist over the base)
  // nor marked placed. The `postFocusPlaceTick` dep re-runs this effect after focus exits — once the
  // fence has actually cleared in the concentric-overlay exit branch — so the mid-focus newcomer is
  // finally placed, unfenced, and its single layoutstop persists it. Writes ONLY the graphPositions
  // meta row — never entity tables (viewer-only).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (suspendSaveRef.current) return; // fenced during an ego-focus session — re-runs via the tick
    if (partition.noneCached || partition.missing.length === 0) return; // partial only
    const sig = [...partition.missing].sort().join('|');
    if (placedMissingRef.current === sig) return;
    placedMissingRef.current = sig;
    const cachedSet = new Set(partition.cached);
    cy.batch(() => cy.nodes().filter((n) => cachedSet.has(n.id())).lock());
    cy.layout({ name: 'cose', animate: false, fit: false, randomize: false }).run();
    cy.nodes().unlock();
  }, [partition, postFocusPlaceTick]);

  // Attach tap + layoutstop handlers ONCE per Cytoscape instance (the cy callback fires on every
  // update). The tap handler reads the latest onSelectNode via a ref so it never goes stale.
  const registerCy = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;
    if (attachedRef.current === cy) return;
    attachedRef.current = cy;
    cy.on('tap', 'node', (e) => {
      const node = e.target;
      // Tap = open the profile AND re-ego onto the tapped node (focus follows the tap, POL-03/D-10).
      // `setFocusedId` is a stable state setter, safe to call from this once-attached handler.
      onSelectRef.current(node.data('kind') as 'people' | 'groups', node.id());
      setFocusedId(node.id());
    });
    // Sticky-persist a MANUAL drag (POL-02). `dragfree` fires only after a real drag (not a plain
    // tap-release like `free`), so tap-vs-drag stays native. Runs the SAME save→reload chain as
    // layoutstop and writes ONLY the graphPositions meta row — never db.people/db.relationshipLinks
    // (viewer-only contract: dragging rearranges the layout, it never mutates entity data).
    cy.on('dragfree', 'node', () => {
      void savePositions(cy).then(() =>
        loadPositions().then((positions) => setPosCache({ probed: true, positions })),
      );
    });
    // Persist positions after EVERY layout, not just the first (WR-03). react-cytoscapejs keeps one
    // `cy` for the component's lifetime, so `cy.one` fired only on the initial `cose` and every later
    // re-run (a node added → cache invalidated → `cose` again) had no listener — the new node's
    // position was never saved and `hasCachedPositions` stayed false forever, defeating the D-13
    // `preset` fast-path for any DB that is ever edited. `cy.on` is registered once (guarded above)
    // and re-saves idempotently on each `layoutstop`.
    cy.on('layoutstop', () => {
      // Save-guard seam (POL-02): a transient layout (Plan 04's ego concentric overlay) sets
      // suspendSaveRef true so its layoutstop never clobbers the saved base. False in this plan.
      if (suspendSaveRef.current) return;
      // Persist the fresh layout, THEN refresh the in-memory cache (IN-02). Without the reload the
      // React `posCache` state stayed stale after a node was added: `hasCachedPositions` kept
      // returning false and the D-13 `preset` fast-path stayed disabled for the rest of the session
      // (only a full reopen re-probed the cache). Reloading here lets a subsequent same-node-set
      // render re-enter the preset path without a reload. `setPosCache` is a stable state setter,
      // safe to call from this once-registered handler.
      void savePositions(cy).then(() =>
        loadPositions().then((positions) => setPosCache({ probed: true, positions })),
      );
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
        <button
          type="button"
          className={styles.toggle}
          data-testid="graph-reset-layout"
          onClick={() => {
            // D-09 / IC-3: clear the saved manual positions, then drop the in-memory cache so the
            // gate falls to noneCached → a fresh `cose` re-arranges and re-caches via layoutstop.
            // Reset placedMissingRef so a later add re-triggers newcomer placement. Neutral control
            // (styles.toggle, no amber A8) — always available, no confirm (regenerable cache).
            void clearPositions().then(() => {
              placedMissingRef.current = '';
              setPosCache({ probed: true, positions: undefined });
            });
          }}
        >
          Reset layout
        </button>
        {focusedId != null && (
          // Exit focus (POL-03, D-13) — DISTINCT from Reset layout: it discards nothing (keeps the
          // manual positions), only drops the transient concentric overlay and restores the saved
          // base. Rendered only while focused (hidden, not disabled). Setting focusedId → null runs
          // the overlay effect's EXIT branch, which restores basePosRef WITHOUT save/clearPositions.
          <button
            type="button"
            className={styles.toggle}
            data-testid="graph-exit-focus"
            onClick={() => setFocusedId(null)}
          >
            Exit focus
          </button>
        )}
        <span className={styles.viewerNote}>Viewer-only — edit relationships from a profile.</span>
      </div>
      <CytoscapeComponent
        className={styles.canvas}
        elements={CytoscapeComponent.normalizeElements(elements)}
        stylesheet={graphStyle}
        layout={layout}
        cy={registerCy}
        global={CY_GLOBAL}
        boxSelectionEnabled={false}
      />
    </div>
  );
}
