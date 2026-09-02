// MapView — the full-bleed dark Konva Stage that is the app's hero surface.
//
// Phase 3: generalized from the single-map skeleton (`maps[0]`) into an ACTIVE-MAP editor. The
// active map is driven by `activeMapId` (lifted in App next to `activeView`); the Stage renders
// across THREE physical Konva layers (RESEARCH Pattern 3 / UI-SPEC, NOT one-layer-per-user-layer):
//   L0  background image — `listening={false}`, positioned/scaled/rotated by `map.backgroundTransform`
//   L1  content — markers (and later shapes/portals), each composed from IMAGE space via
//       `imageToStage` and FILTERED by `useViewportCulling` so off-screen markers are not mounted
//   L2  transformer-overlay — empty placeholder layer, populated by 03-04 (Transformer)
// A toolbar `MapSwitcher` (D-05) changes the active map; a `Breadcrumb` (D-10, Task 3) walks the
// parent chain. The empty-state upload affordance still shows when NO map exists at all.
//
// Pan/zoom stays minimal (drag-pan + wheel-zoom); the culling hook's debounced recompute is wired
// to the Stage `onDragEnd`/`onWheel`. AvatarMarker's own transform consumption arrives in 03-04 —
// markers render at composed positions now via the `position` prop.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Image as KonvaImage, Rect as KonvaRect, Ellipse, Line } from 'react-konva';
import type Konva from 'konva';
import { nanoid } from 'nanoid';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin } from 'lucide-react';
import { db } from '@/db/schema';
import type { BackgroundTransform, Layer as MapLayer, Marker, Shape } from '@/domain/types';
import {
  createMap,
  deleteMarker,
  updateMap,
  updateMapFrom,
  updateMapShapes,
  upsertMarker,
} from '@/db/repository';
import { ConfirmDialog } from '@/features/common/ConfirmDialog';
import { storeMedia } from '@/media/mediaManager';
import { colors, zonePresets } from '@/app/tokens';
import { AvatarMarker } from './AvatarMarker';
import {
  loadAppearance,
  getMapAppearance,
  setMapColor,
  clearMapColor,
} from './mapAppearance';
import { useMapImage, useBlobImage } from './useMapImage';
import { imageToStage, stageToImage } from './coords';
import { useViewportCulling, type Rect } from './editor/useViewportCulling';
import { MapSwitcher } from './editor/MapSwitcher';
import { Breadcrumb } from './editor/Breadcrumb';
import { ToolPalette } from './editor/ToolPalette';
import { ShapeNode } from './editor/ShapeNode';
import { ZoneLabel } from './editor/ZoneLabel';
import { StylePopover } from './editor/StylePopover';
import { TransformerOverlay } from './editor/TransformerOverlay';
import { LayersPanel } from './editor/LayersPanel';
import { ConnectorLayer } from './editor/ConnectorLayer';
import { PortalGlyph, PORTAL_TARGET_DELETED_MESSAGE } from './editor/PortalGlyph';
import { PortalTargetPicker } from './editor/PortalTargetPicker';
import { PersonPicker } from './editor/PersonPicker';
import { orderObjectsForRender, resolveLayer } from './editor/layers';
import {
  useToolMode,
  beginDraw,
  updateDraw,
  commitDraw,
  addPolygonVertex,
  closePolygon,
  type DraftShape,
  type DrawState,
} from './editor/useToolMode';
import { normalizeBox, marqueeHits } from './editor/marquee';
import { deleteTargets, selectionCount } from './editor/multiSelect';
import { MultiSelectBar } from './editor/MultiSelectBar';
import styles from './MapView.module.css';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB cap (UI-SPEC A10)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_ERROR = "That image couldn't be loaded. Try a JPG, PNG, or WebP under 25 MB.";

/** Identity transform — the fallback when a (pre-Phase-3 or in-flight) map has no explicit one. */
const IDENTITY_TRANSFORM: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

/** Half-extent (px) of a marker's bounding box for culling — the avatar circle + stem reach a few
 *  dozen px around the anchor; a generous box keeps a marker mounted slightly before it enters. */
const MARKER_HALF_EXTENT = 48;

/** The default preset a freshly-drawn shape carries (the generic "Stone" room; D-03). */
const DEFAULT_PRESET = 'stone';

/**
 * The extent (stage-container px) a marquee band must EXCEED in width or height before it counts
 * as a drag rather than a click. Below it the release changes no selection at all, so an ordinary
 * empty-canvas click still deselects and a stray click can never build a delete set (T-QT-01).
 */
const MARQUEE_MIN_DRAG = 3;

/**
 * Resolve the layer id a new shape attaches to. A map created via `createMap` starts with an
 * EMPTY `layers` array (only the version(4) upgrade backfills the default "Markers" layer for
 * pre-existing maps); a shape MUST reference a real layer (D-04). So when the active map has no
 * layer yet, we create the default "Markers" layer (order 0) on the fly and persist it alongside
 * the shape — the full layers panel arrives in 03-05, but a shape can never dangle without one
 * (Rule 2: missing-critical-functionality).
 */
function ensureDefaultLayer(layers: MapLayer[]): { layers: MapLayer[]; layerId: string } {
  if (layers.length > 0) return { layers, layerId: layers[0].id };
  const layer: MapLayer = { id: nanoid(), name: 'Markers', visible: true, locked: false, order: 0 };
  return { layers: [layer], layerId: layer.id };
}

/** The stage center of a shape's bounding box / vertex set, for anchoring its ZoneLabel chip. */
function shapeCenter(shape: Shape, transform: BackgroundTransform): { x: number; y: number } {
  if (shape.points && shape.points.length >= 2) {
    let sx = 0;
    let sy = 0;
    const n = shape.points.length / 2;
    for (let i = 0; i < shape.points.length; i += 2) {
      sx += shape.points[i];
      sy += shape.points[i + 1];
    }
    return imageToStage({ x: sx / n, y: sy / n }, transform);
  }
  return imageToStage(
    { x: (shape.x ?? 0) + (shape.width ?? 0) / 2, y: (shape.y ?? 0) + (shape.height ?? 0) / 2 },
    transform,
  );
}

/** The live stage-space preview rendered while a rect/ellipse/line draw is in progress. */
function DrawPreview({ draw, transform }: { draw: DrawState; transform: BackgroundTransform }) {
  const stroke = zonePresets[DEFAULT_PRESET].stroke;
  const a = imageToStage(draw.start, transform);
  const b = imageToStage(draw.current, transform);
  if (draw.kind === 'line') {
    return <Line points={[a.x, a.y, b.x, b.y]} stroke={stroke} strokeWidth={2} dash={[6, 4]} listening={false} />;
  }
  if (draw.kind === 'polygon') {
    // Multi-click polygon: draw the placed vertices as an open polyline, then rubber-band the last
    // segment to the live cursor (draw.current) so the curator sees where the next edge lands.
    const pts: number[] = [];
    for (const v of draw.vertices) {
      const p = imageToStage(v, transform);
      pts.push(p.x, p.y);
    }
    pts.push(b.x, b.y);
    return <Line points={pts} stroke={stroke} strokeWidth={2} dash={[6, 4]} closed={false} listening={false} />;
  }
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (draw.kind === 'ellipse') {
    return (
      <Ellipse
        x={x + w / 2}
        y={y + h / 2}
        radiusX={w / 2}
        radiusY={h / 2}
        stroke={stroke}
        strokeWidth={2}
        dash={[6, 4]}
        listening={false}
      />
    );
  }
  // rect / polygon-in-progress fall back to a bounding rect preview
  return <KonvaRect x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={2} dash={[6, 4]} listening={false} />;
}

export interface MapViewProps {
  /** The currently selected person id, mirrored to the marker ring. */
  selectedPersonId: string | null;
  /** Raised when a marker is clicked — opens the profile sidebar. The clicked marker's own id is
   *  passed too (when a person marker is selected) so the host can act on the EXACT placement that
   *  was clicked rather than re-deriving an arbitrary one for a multi-placed person (CR-01). */
  onSelect: (personId: string, markerId?: string) => void;
  /** The active map id (lifted in App). When null and maps exist, App seeds it. */
  activeMapId: string | null;
  /** Switch the active map (from the MapSwitcher or a breadcrumb crumb). */
  onActiveMapChange: (id: string) => void;
  /** Open the create-Location flow from the MapSwitcher "+ New map" (D-18). */
  onCreateMap: () => void;
  /** Open the create-Person flow from the PersonPicker empty state (no people yet). */
  onCreatePerson?: () => void;
  /**
   * Jump-to-placement (D-12, Task 2): a marker id to SELECT + CENTER. When it changes to a real
   * marker on the active map, MapView selects it (Transformer ring) and recenters the viewport on
   * it, then fires `onFocusHandled` so the host can clear it (re-jumps to the same id work again).
   */
  focusMarkerId?: string | null;
  /** Raised after a `focusMarkerId` jump has been applied (host clears it). */
  onFocusHandled?: () => void;
}

/** Decode an uploaded File to obtain intrinsic dimensions before persisting. */
function decodeDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

export function MapView({
  selectedPersonId,
  onSelect,
  activeMapId,
  onActiveMapChange,
  onCreateMap,
  onCreatePerson,
  focusMarkerId,
  onFocusHandled,
}: MapViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Reactive reads — Dexie is the source of truth (no hand-rolled listeners). The active map is
  // driven by `activeMapId`; App seeds it to the first map when still null (so the single-map
  // skeleton behavior is preserved). A separate count gates the no-map-at-all empty state.
  const map = useLiveQuery(
    async () => (activeMapId ? await db.maps.get(activeMapId) : undefined),
    [activeMapId],
  );
  const mapCount = useLiveQuery(() => db.maps.count(), [], undefined);
  const markers = useLiveQuery(
    () =>
      map ? db.markers.where('mapId').equals(map.id).toArray() : Promise.resolve<Marker[]>([]),
    [map?.id],
    [] as Marker[],
  );
  const people = useLiveQuery(() => db.people.toArray(), [], []);
  // REL-03: all relationship-links drive the connector projection. A connector renders only for a
  // person↔person link whose both endpoints have a marker on THIS map (buildConnectors filters the
  // rest) — group-involving/endpoint-less/unplaced links draw nothing. Reactive so authoring a new
  // relationship (or moving a marker) recomputes the lines from source.
  const links = useLiveQuery(() => db.relationshipLinks.toArray(), [], []);

  // POL-01 (D-05): per-map label/connector colours — a device-local `meta` preference (NOT synced).
  // useLiveQuery re-renders on every meta.put, so dragging a native color picker live-updates the
  // canvas halo/casing (IC-1). getMapAppearance is the pure resolver + trust boundary: an absent or
  // malformed value coerces to today's D-06 default, so existing maps render identically.
  const appearanceRecord = useLiveQuery(() => loadAppearance(), []);
  const appearance = getMapAppearance(appearanceRecord ?? {}, map?.id ?? '');

  const bgImage = useMapImage(map?.background.hash);

  // Viewport culling (RESEARCH Pattern 5): recompute the visible world-rect on pan/zoom END,
  // debounced — not every frame. Off-screen markers are filtered out before mounting.
  const culling = useViewportCulling();

  const transform = map?.backgroundTransform ?? IDENTITY_TRANSFORM;

  // Track the container size so the Stage fills the surface.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
      // WR-03: keep the viewport cull rect in sync with the container size. It is otherwise only
      // recomputed on wheel/drag, so after a pan (visibleRect non-null) enlarging the pane would
      // leave the rect sized to the OLD, smaller viewport and cull markers in the newly-revealed
      // edge region until the next gesture. `culling.recompute` is a stable useCallback, so the
      // mount-time reference stays valid for the observer's lifetime.
      if (stageRef.current) culling.recompute(stageRef.current);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
      setUploadError(UPLOAD_ERROR);
      return;
    }
    try {
      const dims = await decodeDimensions(file);
      // Route the map background through the capping pipeline (WR-06): a raw 25MB upload is
      // downscaled/re-encoded to WebP before storage so it doesn't defeat the quota budget. The
      // returned ref carries the POST-cap intrinsic dimensions; fall back to the pre-decode dims
      // when the runtime lacks an image decoder (ref dims undefined).
      const ref = await storeMedia(file, { kind: 'map' });
      const created = await createMap({
        name: file.name,
        background: ref,
        width: ref.width ?? dims.width,
        height: ref.height ?? dims.height,
      });
      // First-ever map: make it active so it renders immediately (App also seeds, but this avoids
      // a one-frame gap where activeMapId is still null right after the very first upload).
      onActiveMapChange(created.id);
    } catch {
      setUploadError(UPLOAD_ERROR);
    }
  }, [onActiveMapChange]);

  // Basic wheel-zoom around the pointer (minimal — the full editor is later in Phase 3). After the
  // gesture, recompute the cull rect (debounced inside the hook).
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const scaleBy = 1.05;
      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
      const clamped = Math.max(0.2, Math.min(5, newScale));
      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };
      stage.scale({ x: clamped, y: clamped });
      stage.position({
        x: pointer.x - mousePointTo.x * clamped,
        y: pointer.y - mousePointTo.y * clamped,
      });
      culling.recompute(stage);
    },
    [culling],
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const stage = e.target.getStage();
      if (stage) culling.recompute(stage);
    },
    [culling],
  );

  // ── Tool-mode draw wiring (MAP-02) ────────────────────────────────────────────────────────
  // One useToolMode instance owned here drives the ToolPalette and routes Stage pointer events to
  // draw vs. pan/select. `stageDraggable` toggles Stage.draggable so a single-pointer drag DRAWS
  // in a draw mode (D-19) but PANS in Select. A two-finger touch always pans/pinches.
  const toolMode = useToolMode();
  const {
    tool,
    setTool,
    stageDraggable,
    draw,
    setDraw,
    setTwoFingerActive,
    setMiddlePanning,
    setMarqueeActive,
  } = toolMode;

  // ── Middle-button pan (quick-260821-nac) ────────────────────────────────────────────────────
  // Hand-rolled rather than left to Konva's drag-and-drop: Konva's default `dragButtons` include
  // the middle button, so relying on `Stage.draggable` would pan only in Select mode (draw modes
  // set stageDraggable=false) and would DOUBLE-pan in Select mode. Instead the gesture begins on
  // the Konva pointerdown and is driven from WINDOW listeners, with `middlePanning` forcing
  // `stageDraggable` false for its duration.
  //
  // Holds the press origin in CLIENT px plus the Stage position at press time, so each move is an
  // absolute reposition (start + delta) and can never accumulate drift.
  const middlePanRef = useRef<{
    clientX: number;
    clientY: number;
    stageX: number;
    stageY: number;
  } | null>(null);
  const [middlePanning, setMiddlePanningState] = useState(false);
  const beginMiddlePan = useCallback(
    (origin: { clientX: number; clientY: number; stageX: number; stageY: number }) => {
      middlePanRef.current = origin;
      setMiddlePanningState(true);
      setMiddlePanning(true);
    },
    [setMiddlePanning],
  );
  const endMiddlePan = useCallback(() => {
    middlePanRef.current = null;
    setMiddlePanningState(false);
    setMiddlePanning(false);
  }, [setMiddlePanning]);

  // Mirror the in-progress draw into a ref so the pointer-move/up handlers always read the LIVE
  // draft, never a stale render-closure value. Without this, a fast down→move→up sequence (or a
  // synthetic one in tests) reads `draw === null` on pointer-up and silently drops the shape.
  const drawRef = useRef<DrawState | null>(null);
  const setDrawTracked = useCallback(
    (next: DrawState | null) => {
      drawRef.current = next;
      setDraw(next);
    },
    [setDraw],
  );

  // ── Marquee (rubber-band) selection (quick-260821-nac) ──────────────────────────────────────
  // The live band, in STAGE-CONTAINER px (what `stage.getPointerPosition()` returns). Mirrored
  // into a ref for exactly the reason `drawRef` is: a fast press-move-release must never read a
  // stale render-closure value on the release that finalizes it.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const setMarqueeTracked = useCallback(
    (next: { x0: number; y0: number; x1: number; y1: number } | null) => {
      marqueeRef.current = next;
      setMarquee(next);
      // The band owns the Stage for its duration — no panning underneath it.
      setMarqueeActive(next !== null);
    },
    [setMarqueeActive],
  );

  // D-4: an ADDITIVE multi-selection that sits ALONGSIDE the strictly single-select
  // selectedShapeId/selectedMarkerId path (which is NOT refactored). Populated only when a band
  // catches 2+ objects; a 1-hit band sets the existing single-select state instead, so the
  // Transformer and StylePopover attach through the path they already use.
  const [marqueeSelection, setMarqueeSelection] = useState<{
    shapeIds: string[];
    markerIds: string[];
  }>({ shapeIds: [], markerIds: [] });
  const marqueeShapeIdSet = useMemo(
    () => new Set(marqueeSelection.shapeIds),
    [marqueeSelection.shapeIds],
  );
  const marqueeMarkerIdSet = useMemo(
    () => new Set(marqueeSelection.markerIds),
    [marqueeSelection.markerIds],
  );

  // D-1: the delete set a 2+ marquee selection has proposed, held while the blocking ConfirmDialog
  // is open. Non-null == the dialog is showing. There is no undo in this app, so a bulk delete —
  // the first gesture that can remove MARKERS en masse — is never allowed to run un-confirmed
  // (T-NFS-01). The single-selected-shape delete does NOT come through here.
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{
    shapeIds: string[];
    markerIds: string[];
  } | null>(null);

  // Set on the release that ended a real band, and consumed by the Stage onClick handler: Konva
  // raises a click on that same release, which would otherwise wipe the selection just made.
  const suppressStageClickRef = useRef(false);

  // The currently-selected shape id (opens the StylePopover).
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // ── Single-select + Transformer (MAP-02, D-14/D-15, criterion 6) ────────────────────────────
  // Exactly ONE object is selected at a time. The selected object's live Konva node is mirrored
  // into a ref so the L2 TransformerOverlay can attach to it. Selecting a marker also selects it
  // for the Transformer; selecting a shape does too (and opens the StylePopover). Clicking empty
  // canvas deselects everything (D-15).
  const [selectedNode, setSelectedNode] = useState<Konva.Node | null>(null);
  // The id of the currently-selected MARKER (its Group is what the Transformer attaches to). A
  // shape selection is tracked by `selectedShapeId`; only one of the two is non-null at a time.
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // ── Background-transform affordance (S16b, criterion 7) ─────────────────────────────────────
  // An explicit "Edit background" toggle (so the background is never grabbed by accident). While
  // active, a Transformer attaches to the <KonvaImage> and, on transform-end, persists
  // MapDoc.backgroundTransform via updateMap. Because markers/shapes compose THROUGH this transform,
  // re-fitting keeps them anchored automatically — the criterion-7 payoff.
  const [editingBackground, setEditingBackground] = useState(false);
  const [bgNode, setBgNode] = useState<Konva.Node | null>(null);

  // Clear any object selection (markers + shapes) — used on empty-canvas click and bg-edit entry.
  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedMarkerId(null);
    setSelectedShapeId(null);
    // The additive marquee selection clears with everything else (D-4).
    setMarqueeSelection({ shapeIds: [], markerIds: [] });
  }, []);

  // Delete shapes from the active map's `shapes` array (via updateMapShapes — never straight to
  // Dexie) and clear the selection so the just-detached Transformer/StylePopover close cleanly.
  // Shared by the keyboard Delete/Backspace handler and the StylePopover Delete button. Takes a
  // LIST so a marquee selection is removed in ONE write rather than N racing ones; the filter runs
  // against the FRESHLY-READ array (the WR-01 rationale) so a concurrent edit isn't clobbered.
  const deleteShapes = useCallback(
    (shapeIds: string[]) => {
      if (!map || shapeIds.length === 0) return;
      const doomed = new Set(shapeIds);
      void updateMapShapes(map.id, (shapes) => shapes.filter((s) => !doomed.has(s.id)));
      clearSelection();
    },
    [map, clearSelection],
  );

  // Remove MARKER rows (person placements and portals) — the marker half of a bulk marquee delete.
  //
  // `deleteMarker` removes ONLY the `db.markers` row. The referenced PERSON (or a portal's target
  // map) survives untouched in the database and on every other map: this is the delete-vs-remove
  // distinction `e2e/delete-vs-remove.spec.ts` guards — deleting a person destroys the person
  // everywhere, removing a placement drops just this pin. Do not "simplify" this into a person
  // delete.
  //
  // One `deleteMarker` per id rather than a bulk `bulkDelete`, because each call is the repository's
  // validate→emit path that keeps the sync journal correct (the same reason every other write in
  // this file routes through the repository rather than straight to Dexie).
  const deleteMarkers = useCallback((markerIds: string[]) => {
    for (const id of markerIds) void deleteMarker(id);
  }, []);

  // D-20: show person-name labels on the canvas — driven by the LayersPanel toggle (default hidden).
  const [showLabels, setShowLabels] = useState(false);

  // D-09/R5: show relationship (connector) labels on the canvas — a separate LayersPanel toggle,
  // default OFF to keep the canvas clean and cheap at scale (mirrors the D-20 Names toggle).
  const [showConnectorLabels, setShowConnectorLabels] = useState(false);

  // Show relationship (connector) LINES on the canvas — the LayersPanel toggle that sits directly
  // above the labels one. Default TRUE: connectors have always drawn unconditionally, so ON
  // reproduces today's canvas exactly. This is a SESSION-ONLY view preference and is intentionally
  // NOT persisted (no mapAppearance / db.meta / MapDoc write) — a reload deliberately returns it
  // to ON. Do not "fix" this by routing it through mapAppearance.
  const [showConnectorLines, setShowConnectorLines] = useState(true);

  // REL-03 (Pitfall 1): the transient LIVE stage position of the one marker currently being dragged.
  // AvatarMarker.onDragMove (rAF-throttled) pushes it here; the ConnectorLayer overlays it for that
  // marker so connectors follow the drag WITHOUT a per-frame Dexie write. Cleared on drag-end, at
  // which point the persisted position flows back through useLiveQuery and the connector recomputes.
  const [draggingMarker, setDraggingMarker] = useState<{
    markerId: string;
    x: number;
    y: number;
  } | null>(null);
  const handleMarkerDragMove = useCallback(
    (markerId: string, x: number, y: number) => setDraggingMarker({ markerId, x, y }),
    [],
  );
  const handleMarkerDragEnd = useCallback(() => setDraggingMarker(null), []);

  // ── Portal placement + navigation (MAP-06/MAP-07, D-06/D-07/D-08) ───────────────────────────
  // The just-dropped portal awaiting a target (opens the PortalTargetPicker). When set, the picker
  // is shown; choosing a target sets its `targetMapId`, cancelling deletes the target-less portal.
  const [pendingPortalId, setPendingPortalId] = useState<string | null>(null);
  // A transient message surfaced when a portal whose target was deleted is double-clicked (T-03-10).
  const [portalError, setPortalError] = useState<string | null>(null);

  // ── Person placement (MAP-05, D-11) ─────────────────────────────────────────────────────────
  // The IMAGE-space point where the Person tool was dropped, awaiting a pick from the PersonPicker.
  // When set, the picker is open; picking a person places a NEW Marker row at this point (a second
  // placement of an already-placed person is just another row — multi-placement, D-13).
  const [pendingPersonPoint, setPendingPersonPoint] = useState<{ x: number; y: number } | null>(
    null,
  );

  // D-04: the layers the content render is organized by (always at least the default layer).
  //
  // MEMOIZED because six hooks below take `layers` as a dependency: as a bare `??` expression it
  // produced a FRESH `[]` on every render whenever `map` was still loading, invalidating all of
  // them each pass (react-hooks/exhaustive-deps flags exactly this). Memoizing on `map?.layers`
  // makes the empty case referentially stable; when a map is loaded the identity already tracks the
  // stored array. Behaviour is unchanged — this is purely the referential stability those hooks
  // already assumed.
  const layers = useMemo(() => map?.layers ?? [], [map?.layers]);

  // D-04: the ACTIVE layer — new shapes/markers land on it. Resolves to the topmost layer when unset
  // or stale (the selected layer was deleted). The panel sets this when a row is selected/created.
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const effectiveActiveLayerId = useMemo(() => {
    if (activeLayerId && layers.some((l) => l.id === activeLayerId)) return activeLayerId;
    if (layers.length === 0) return null;
    return layers.slice().sort((a, b) => b.order - a.order)[0].id;
  }, [activeLayerId, layers]);

  // The ids of every object (shape or marker/portal) whose resolved layer is LOCKED.
  //
  // A locked object renders `listening={false}`, so it cannot be clicked or dragged — but the
  // marquee hit-test is DATA-driven (`marquee.ts`), running over `map.shapes` and the composed
  // marker positions rather than over the Konva scene graph. A band therefore CAN catch a
  // locked-layer object, and without this set a group Delete / group move / bulk re-layer would
  // mutate objects the curator explicitly locked — silently defeating the lock. Every group action
  // below filters against this set, so "locked" means the same thing for a bulk gesture as it does
  // for a click. `resolveLayer` is the same resolver the render path uses, so a dangling layerId
  // resolves identically here (T-03-14).
  const lockedObjectIdSet = useMemo(() => {
    const locked = new Set<string>();
    if (layers.length === 0) return locked;
    for (const s of map?.shapes ?? []) {
      if (resolveLayer({ id: s.id, layerId: s.layerId }, layers)?.locked) locked.add(s.id);
    }
    for (const mk of markers ?? []) {
      if (resolveLayer({ id: mk.id, layerId: mk.layerId }, layers)?.locked) locked.add(mk.id);
    }
    return locked;
  }, [layers, map?.shapes, markers]);

  /**
   * The ONE delete entry point shared by the Delete/Backspace key and the MultiSelectBar button, so
   * the two can never drift apart. `deleteTargets` (pure, unit-tested) decides what dies and whether
   * a confirm is required; locked-layer objects are stripped from the set first (they are
   * `listening={false}` on the canvas but the band's hit-test is data-driven, so it can still reach
   * them). A 2+ selection opens the ConfirmDialog; anything else takes today's immediate path.
   */
  const requestDelete = useCallback(() => {
    const targets = deleteTargets(marqueeSelection, selectedShapeId);
    const shapeIds = targets.shapeIds.filter((id) => !lockedObjectIdSet.has(id));
    const markerIds = targets.markerIds.filter((id) => !lockedObjectIdSet.has(id));
    if (shapeIds.length === 0 && markerIds.length === 0) return false;
    if (targets.requiresConfirm) {
      setPendingBulkDelete({ shapeIds, markerIds });
      return true;
    }
    deleteShapes(shapeIds);
    return true;
  }, [marqueeSelection, selectedShapeId, lockedObjectIdSet, deleteShapes]);

  // Compose each marker's IMAGE-space coord onto the background transform, then cull off-screen
  // markers BEFORE rendering them (so they are never mounted as Konva nodes). Hidden-layer markers
  // are already excluded by `orderObjectsForRender`; the cull box is the composed stage point ±
  // MARKER_HALF_EXTENT.
  //
  // These two memos sit HERE — above the pointer handlers rather than down with the render set —
  // because `finishMarquee` reads them as its hit-test candidate list, and a `useCallback`
  // dependency array is evaluated at render time (a later `const` would be in its temporal dead
  // zone). Keeping them culled is also the T-QT-02 mitigation: a marquee release costs what is on
  // screen, never the whole marker table.
  const visibleMarkers = useMemo(() => {
    // IN-01: own exactly the PERSON markers here (portals are rendered by visiblePortals). Filtering
    // up front — mirroring visiblePortals' kind==='portal' filter — avoids composing + culling every
    // portal only to render null for it in the JSX below (dead work that obscured the render path).
    const persons = (markers ?? []).filter((m) => m.kind === 'person');
    const ordered = orderObjectsForRender(persons, layers);
    return ordered
      .map((item) => ({
        mk: item.object,
        locked: item.locked,
        opacity: item.opacity,
        pos: imageToStage({ x: item.object.x, y: item.object.y }, transform),
      }))
      .filter(({ pos }) => {
        const box: Rect = {
          x: pos.x - MARKER_HALF_EXTENT,
          y: pos.y - MARKER_HALF_EXTENT,
          width: MARKER_HALF_EXTENT * 2,
          height: MARKER_HALF_EXTENT * 2,
        };
        return culling.isVisible(box);
      });
  }, [markers, layers, transform, culling]);

  // The same compose+cull pass for PORTAL markers (kind:'portal'). Portals render as PortalGlyph in
  // the SAME L1 content layer, composed from IMAGE space through the background transform and culled
  // off-screen. Person markers (visibleMarkers above) skip portals because they have no personId.
  const visiblePortals = useMemo(() => {
    const portals = (markers ?? []).filter((m) => m.kind === 'portal');
    const ordered = orderObjectsForRender(portals, layers);
    return ordered
      .map((item) => ({
        mk: item.object,
        locked: item.locked,
        opacity: item.opacity,
        pos: imageToStage({ x: item.object.x, y: item.object.y }, transform),
      }))
      .filter(({ pos }) => {
        const box: Rect = {
          x: pos.x - MARKER_HALF_EXTENT,
          y: pos.y - MARKER_HALF_EXTENT,
          width: MARKER_HALF_EXTENT * 2,
          height: MARKER_HALF_EXTENT * 2,
        };
        return culling.isVisible(box);
      });
  }, [markers, layers, transform, culling]);

  // Convert a Stage pointer position to IMAGE space (undo the Stage pan/zoom, then the bg transform).
  const pointerToImage = useCallback(
    (stage: Konva.Stage): { x: number; y: number } | null => {
      const pos = stage.getPointerPosition();
      if (!pos) return null;
      // Undo the Stage's own pan/zoom to get content-space, then undo the background transform.
      const contentX = (pos.x - stage.x()) / stage.scaleX();
      const contentY = (pos.y - stage.y()) / stage.scaleY();
      return stageToImage({ x: contentX, y: contentY }, transform);
    },
    [transform],
  );

  // Commit a finished draft shape onto the active map's `shapes` array (persisting via updateMap,
  // never straight to Dexie). Ensures a default layer exists so the shape never dangles (D-04).
  const commitShape = useCallback(
    (draft: DraftShape) => {
      if (!map) return;
      // Ensure a layer exists, then land the shape on the ACTIVE layer (D-04). When no layer is
      // active yet (fresh map), `ensureDefaultLayer` materializes the default "Markers" layer.
      const ensured = ensureDefaultLayer(map.layers);
      const layers = ensured.layers;
      const layerId =
        effectiveActiveLayerId && layers.some((l) => l.id === effectiveActiveLayerId)
          ? effectiveActiveLayerId
          : ensured.layerId;
      const shape: Shape = {
        id: nanoid(),
        layerId,
        kind: draft.kind,
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        points: draft.points,
        rotation: 0,
        preset: DEFAULT_PRESET,
        // A freshly-drawn line is never filled; rooms/zones default to filled.
        fill: draft.kind !== 'line',
      };
      // WR-01: append the shape against the FRESHLY-READ row (not the stale useLiveQuery snapshot)
      // so a rapid second draw/edit before the live query refreshes can't silently clobber it.
      // IN-02: include `layers` ONLY when the map has none yet (materialize the default layer);
      // otherwise the identical array would churn updatedAt/dirty for sync on every shape commit.
      void updateMapFrom(map.id, (m) =>
        m.layers.length === 0
          ? { shapes: [...m.shapes, shape], layers: ensured.layers }
          : { shapes: [...m.shapes, shape] },
      );
      // Select the just-drawn shape so the StylePopover opens for immediate styling.
      setSelectedShapeId(shape.id);
    },
    [map, effectiveActiveLayerId],
  );

  // Drop a portal at an IMAGE-space point on the active map and open the target picker (D-08). The
  // portal is a one-shot place tool (like Person): commit a Marker(kind:'portal') with NO target
  // yet — the picker (Task 2) sets `targetMapId` or, on cancel, deletes the target-less portal — and
  // return to Select. The portal lands on the ACTIVE layer (D-04) so it never dangles.
  const placePortal = useCallback(
    async (at: { x: number; y: number }) => {
      if (!map) return;
      const ensured = ensureDefaultLayer(map.layers);
      const layerId =
        effectiveActiveLayerId && ensured.layers.some((l) => l.id === effectiveActiveLayerId)
          ? effectiveActiveLayerId
          : ensured.layerId;
      // Materialize the default layer on the map first if the map had none, so the portal's layerId
      // references a real layer (mirrors commitShape).
      if (map.layers.length === 0) {
        await updateMap(map.id, { layers: ensured.layers });
      }
      const portal = await upsertMarker({ mapId: map.id, kind: 'portal', x: at.x, y: at.y, layerId });
      setPendingPortalId(portal.id);
      // One-shot: return to Select after the drop (the picker now owns the flow).
      setTool('select');
    },
    [map, effectiveActiveLayerId, setTool],
  );

  // Place an existing person at the pending drop point (MAP-05, D-11). Called when the PersonPicker
  // fires `onPick`: upsert a NEW Marker row (no id) on the ACTIVE layer with kind:'person', so
  // placing an already-placed person yields a SECOND placement (D-13) while the canonical Person
  // record is untouched. Mirrors `placePortal`'s active-layer materialization so it never dangles.
  const placePerson = useCallback(
    async (personId: string) => {
      if (!map || !pendingPersonPoint) return;
      const ensured = ensureDefaultLayer(map.layers);
      const layerId =
        effectiveActiveLayerId && ensured.layers.some((l) => l.id === effectiveActiveLayerId)
          ? effectiveActiveLayerId
          : ensured.layerId;
      if (map.layers.length === 0) {
        await updateMap(map.id, { layers: ensured.layers });
      }
      await upsertMarker({
        mapId: map.id,
        kind: 'person',
        personId,
        x: pendingPersonPoint.x,
        y: pendingPersonPoint.y,
        layerId,
      });
      setPendingPersonPoint(null);
    },
    [map, pendingPersonPoint, effectiveActiveLayerId],
  );

  // Pointer-down: in a draw mode, begin a drag-draw at the image-space point. (Polygon multi-click
  // and Esc-cancel are deferred — rect/ellipse/line drag-draw is the MAP-02 core; polygon arrives
  // alongside the Transformer in 03-04. The pure polygon helpers already exist in useToolMode.)
  // Portal is one-shot: pointer-down at the point drops a portal and opens the target picker (D-08).
  const handlePointerDown = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      // Button routing runs FIRST, before any tool branch, so no tool ever sees a non-left press.
      // Middle button (1) starts a pan whatever the armed tool is; the in-progress draw state is
      // deliberately left untouched (D-2) — panning mid-polygon to reach an off-screen vertex is a
      // legitimate workflow, and the rubber band simply freezes while the button is held.
      //
      // `e.evt` is typed non-optional but is genuinely absent on a PROGRAMMATICALLY fired event
      // (`stage.fire('pointerdown', …)`), so every read below is guarded; an event with no native
      // counterpart is treated as a plain left press.
      if (e.evt?.button === 1) {
        e.evt.preventDefault();
        // Kill any Konva drag this same press may have armed (the Pitfall-4 treatment the
        // two-finger touch handler already uses) so nothing pans underneath the manual gesture.
        stage.stopDrag();
        beginMiddlePan({
          clientX: e.evt.clientX,
          clientY: e.evt.clientY,
          stageX: stage.x(),
          stageY: stage.y(),
        });
        return;
      }
      // Anything other than the LEFT button (right-click, back/forward) never reaches a tool.
      if (e.evt && e.evt.button !== 0) return;
      // Marquee (rubber-band) selection — Select tool, MOUSE only, starting on EMPTY canvas.
      //   • `e.target === stage` is what keeps a drag that begins on a marker, portal or shape
      //     flowing to that object's OWN drag handler: the object moves and no band appears.
      //   • the pointerType test is what preserves single-finger touch panning (D-3) — touch and
      //     pen keep today's Select-mode `stageDraggable` empty-canvas pan untouched. Mouse
      //     panning is intentionally replaced by the middle-drag gesture above.
      if (tool === 'select' && e.evt?.pointerType === 'mouse' && e.target === stage) {
        const pos = stage.getPointerPosition();
        if (!pos) return;
        // Kill any Konva drag this press armed, so the Stage can't pan out from under the band.
        stage.stopDrag();
        setMarqueeTracked({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        return;
      }
      if (tool === 'portal') {
        const at = pointerToImage(stage);
        if (at) void placePortal(at);
        return;
      }
      // Person is one-shot like Portal (D-11): record the drop point + open the PersonPicker, then
      // return to Select. The pick (placePerson) upserts the marker at this point.
      if (tool === 'person') {
        const at = pointerToImage(stage);
        if (at) {
          setPendingPersonPoint(at);
          setTool('select');
        }
        return;
      }
      // Polygon is MULTI-CLICK (D-19): each pointer-down drops one vertex. The first click seeds the
      // draft (beginDraw), every later click appends (addPolygonVertex). Closing/cancelling is handled
      // by dblclick/Enter (handlePolygonClose) and Escape (in the keydown effect) — NOT pointer-up, so
      // handlePointerUp early-returns for a polygon draft below. Reads/writes the LIVE draft via
      // drawRef so a fast click sequence never sees a stale render-closure value.
      if (tool === 'polygon') {
        const at = pointerToImage(stage);
        if (!at) return;
        const active = drawRef.current;
        setDrawTracked(
          active && active.kind === 'polygon'
            ? addPolygonVertex(active, at)
            : beginDraw('polygon', at),
        );
        return;
      }
      // Drag-draw for rect/ellipse/line: pointer-down anchors, move previews, up commits.
      if (tool !== 'rect' && tool !== 'ellipse' && tool !== 'line') return;
      const start = pointerToImage(stage);
      if (!start) return;
      setDrawTracked(beginDraw(tool, start));
    },
    [tool, pointerToImage, setDrawTracked, placePortal, setTool, beginMiddlePan, setMarqueeTracked],
  );

  const handlePointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      // A middle-button pan owns the pointer: never let it update (or later commit) a draw.
      if (middlePanRef.current) return;
      // A live band just tracks its second corner — hit-testing waits for the release (T-QT-02).
      const band = marqueeRef.current;
      if (band) {
        const stage = e.target.getStage();
        const pos = stage?.getPointerPosition();
        if (pos) setMarqueeTracked({ ...band, x1: pos.x, y1: pos.y });
        return;
      }
      const current = drawRef.current;
      if (!current) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const at = pointerToImage(stage);
      if (!at) return;
      setDrawTracked(updateDraw(current, at));
    },
    [pointerToImage, setDrawTracked, setMarqueeTracked],
  );

  // Finalize an in-progress marquee band. Reads and IMMEDIATELY nulls `marqueeRef`, so calling it
  // twice (Stage pointer-up plus the window safety net below) is harmless.
  const finishMarquee = useCallback(() => {
    const band = marqueeRef.current;
    if (!band) return;
    setMarqueeTracked(null);

    const dx = Math.abs(band.x1 - band.x0);
    const dy = Math.abs(band.y1 - band.y0);
    // At or below the threshold this was a click, not a drag: change nothing and leave
    // suppressStageClickRef alone so the ordinary empty-canvas deselect still runs.
    if (dx <= MARQUEE_MIN_DRAG && dy <= MARQUEE_MIN_DRAG) return;

    const box = normalizeBox({ x: band.x0, y: band.y0 }, { x: band.x1, y: band.y1 });
    // T-QT-02: candidates come from the ALREADY-CULLED memos, so the cost is bounded by what is on
    // screen, never by the marker table size.
    const candidates = [...visibleMarkers, ...visiblePortals].map(({ mk, pos }) => ({
      id: mk.id,
      pos,
    }));
    const hits = marqueeHits(box, map?.shapes ?? [], candidates, transform, MARKER_HALF_EXTENT);
    const total = hits.shapeIds.length + hits.markerIds.length;
    // Konva raises a click on this very release; consume it so it can't undo what we just selected.
    suppressStageClickRef.current = true;

    // D-4 release rule.
    if (total === 0) {
      clearSelection();
      return;
    }
    if (total === 1) {
      // Exactly one hit behaves EXACTLY like a click on that object: the existing single-select
      // state is set, so the Transformer and StylePopover attach through the existing onNodeRef
      // path with no special-casing.
      setMarqueeSelection({ shapeIds: [], markerIds: [] });
      setEditingBackground(false);
      if (hits.shapeIds.length === 1) {
        setSelectedShapeId(hits.shapeIds[0]);
        setSelectedMarkerId(null);
      } else {
        setSelectedMarkerId(hits.markerIds[0]);
        setSelectedShapeId(null);
      }
      return;
    }
    // 2+ hits: the additive multi-selection only. Every hit renders its amber selected outline and
    // Delete removes all selected SHAPES in one write; no Transformer attaches (the L2 overlay is
    // single-node by construction) and no StylePopover opens.
    setMarqueeSelection(hits);
    setSelectedShapeId(null);
    setSelectedMarkerId(null);
    setSelectedNode(null);
  }, [
    setMarqueeTracked,
    visibleMarkers,
    visiblePortals,
    map?.shapes,
    transform,
    clearSelection,
  ]);

  const handlePointerUp = useCallback(() => {
    // A middle-button pan owns the pointer — its release is handled by the window listener below
    // and must never commit a shape.
    if (middlePanRef.current) return;
    // A band finalizes on release, before any draw-commit path.
    if (marqueeRef.current) {
      finishMarquee();
      return;
    }
    const current = drawRef.current;
    if (!current) return;
    // Polygon commits on dblclick/Enter, never on pointer-up — otherwise the up of the very first
    // vertex click would run commitDraw (a 0-size box → null) and wipe the in-progress draft.
    if (current.kind === 'polygon') return;
    const committed = commitDraw(current);
    setDrawTracked(null);
    if (committed) {
      commitShape(committed);
      // One-shot draw: a COMMITTED shape re-arms Select, mirroring what placePortal and the Person
      // tool already do. Only on a non-null commit (D-6) — a degenerate/stray drag deliberately
      // keeps the drawing tool armed rather than silently disarming the curator.
      //
      // Order matters: setDrawTracked(null) above already cleared the mirrored ref, so setTool's
      // own internal setDraw(null) is a harmless no-op. Reversed, setTool would discard the draft
      // from state while drawRef still held it.
      //
      // commitShape has already run setSelectedShapeId, so the curator lands on Select with the
      // shape they just drew selected and its StylePopover open — the intended end state.
      setTool('select');
    }
  }, [setDrawTracked, commitShape, finishMarquee, setTool]);

  // Window-level safety net: releasing OUTSIDE the canvas must still finalize the band (a
  // Stage-scoped pointerup would never fire and the band would stay stuck to the cursor).
  useEffect(() => {
    if (!marquee) return;
    const onUp = () => finishMarquee();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [marquee, finishMarquee]);

  // Drive the middle-button pan from WINDOW listeners, not Stage ones: that is precisely what makes
  // a release OUTSIDE the canvas still end the pan (a Stage-scoped pointerup would never fire and
  // the Stage would stay stuck to the cursor). Mounted only while the gesture is live.
  useEffect(() => {
    if (!middlePanning) return;
    const onMove = (ev: PointerEvent) => {
      const origin = middlePanRef.current;
      const stage = stageRef.current;
      if (!origin || !stage) return;
      // Absolute reposition from the press origin — start + total delta, never incremental.
      stage.position({
        x: origin.stageX + (ev.clientX - origin.clientX),
        y: origin.stageY + (ev.clientY - origin.clientY),
      });
      stage.batchDraw();
    };
    const onEnd = () => {
      endMiddlePan();
      // The viewport moved — refresh the cull rect exactly as handleWheel/handleDragEnd do.
      if (stageRef.current) culling.recompute(stageRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [middlePanning, endMiddlePan, culling]);

  // Suppress the platform autoscroll widget (the four-way scroll cursor) on a middle press over the
  // canvas. This MUST be a native `mousedown`/`auxclick` listener: preventing the default on the
  // POINTER event does not suppress the compatibility mouse event the widget is triggered from.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const suppress = (ev: MouseEvent) => {
      if (ev.button === 1) ev.preventDefault();
    };
    el.addEventListener('mousedown', suppress);
    el.addEventListener('auxclick', suppress);
    return () => {
      el.removeEventListener('mousedown', suppress);
      el.removeEventListener('auxclick', suppress);
    };
  }, []);

  // Close + commit an in-progress polygon (dblclick / double-tap, or Enter via the keydown effect).
  // closePolygon returns null for < 3 vertices (degenerate) — then we just clear the draft.
  const handlePolygonClose = useCallback(() => {
    const active = drawRef.current;
    if (!active || active.kind !== 'polygon') return;
    const committed = closePolygon(active);
    setDrawTracked(null);
    if (committed) {
      commitShape(committed);
      // Same one-shot rule as the drag-draw path above: a CLOSED polygon re-arms Select, while an
      // Escape-cancelled or under-three-vertex polygon leaves the Polygon tool armed (D-6).
      setTool('select');
    }
  }, [setDrawTracked, commitShape, setTool]);

  // Keyboard interactions on the editor surface:
  //   • Polygon in progress → Enter closes+commits, Escape cancels (checked first, independent of
  //     whether a form control has focus).
  //   • Delete / Backspace → remove the current delete set, as resolved by the pure `deleteTargets`:
  //     a 2+ marquee selection removes every banded SHAPE and MARKER/PORTAL behind one blocking
  //     confirm (D-1), while a single selected shape still deletes instantly with no confirm. A lone
  //     selected MARKER is deliberately NOT deletable from the keyboard (D-2) — removing one
  //     placement stays the explicit "Remove from this map" action. Suppressed while typing in a
  //     form control (e.g. the StylePopover zone-label input) so editing text never nukes the shape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = drawRef.current;
      if (active && active.kind === 'polygon') {
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePolygonClose();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setDrawTracked(null);
          return;
        }
      }

      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable);
      if (typing) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // `requestDelete` is the single shared path (key + MultiSelectBar button): it resolves the
        // set, drops locked-layer objects, and either opens the confirm or deletes immediately. It
        // returns false when there is nothing to delete, in which case the key is left alone.
        if (requestDelete()) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePolygonClose, setDrawTracked, requestDelete]);

  // Two-finger touch always pans/pinches (RESEARCH Pattern 6); the second touch landing kills any
  // in-flight single-finger draw so a pinch never leaves a stray preview (Pitfall 4).
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches && touches.length >= 2) {
        setTwoFingerActive(true);
        setDrawTracked(null);
        const stage = e.target.getStage();
        if (stage) stage.stopDrag();
      }
    },
    [setTwoFingerActive, setDrawTracked],
  );

  const handleTouchEnd = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (!touches || touches.length < 2) setTwoFingerActive(false);
    },
    [setTwoFingerActive],
  );

  const selectedShape = useMemo(
    () => (map?.shapes ?? []).find((s) => s.id === selectedShapeId) ?? null,
    [map?.shapes, selectedShapeId],
  );

  // Persist a background transform on transform-end. The <KonvaImage> renders at
  // (offsetX, offsetY) scaled by `transform.scale` and rotated by `transform.rotation`; reading the
  // node's post-gesture x/y/scale/rotation and writing them back as the new BackgroundTransform is
  // the whole mechanism (markers stay anchored because they compose THROUGH this transform).
  const handleBackgroundTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>) => {
      if (!map) return;
      const node = e.target as Konva.Image;
      const next: BackgroundTransform = {
        offsetX: node.x(),
        offsetY: node.y(),
        // scaleX === scaleY for the uniform background scale; read scaleX.
        scale: node.scaleX(),
        rotation: (node.rotation() * Math.PI) / 180,
      };
      void updateMap(map.id, { backgroundTransform: next });
    },
    [map],
  );

  // ── Logical-layer render set (MAP-03, RESEARCH Pattern 3) ───────────────────────────────────
  // Both shapes AND markers are organized by `MapDoc.layers`: each object's effective layer is its
  // `layerId` resolved against the map's layers (absent/dangling → default layer). Objects on a
  // HIDDEN layer are excluded; objects on a LOCKED layer render dimmed (opacity 0.6) and
  // non-interactive (listening=false). The whole set renders into the SINGLE physical L1 content
  // layer, sorted by logical layer order (bottom→top) — NEVER one Konva Layer per user layer.
  const orderedShapes = useMemo(
    () => orderObjectsForRender(map?.shapes ?? [], layers),
    [map?.shapes, layers],
  );

  // `visibleMarkers` / `visiblePortals` are declared ABOVE, next to the layer resolution, because
  // the marquee release (`finishMarquee`) reads them as its candidate list.

  // The set of map ids that currently exist (drives the deleted-target affordance + label name). A
  // portal whose `targetMapId` is not in this set shows the muted glyph + the deleted message on
  // navigate (T-03-10) rather than crashing.
  const allMaps = useLiveQuery(() => db.maps.toArray(), [], []);
  const mapsById = useMemo(() => {
    const by = new Map<string, string>();
    for (const m of allMaps ?? []) by.set(m.id, m.name);
    return by;
  }, [allMaps]);

  // Navigate DOWN through a portal (MAP-07): set the target map active. When the target was deleted
  // (or never set), surface the deleted-destination message instead of navigating (T-03-10).
  const navigatePortal = useCallback(
    (targetMapId: string | undefined) => {
      if (!targetMapId || !mapsById.has(targetMapId)) {
        setPortalError(PORTAL_TARGET_DELETED_MESSAGE);
        return;
      }
      setPortalError(null);
      onActiveMapChange(targetMapId);
    },
    [mapsById, onActiveMapChange],
  );

  // ── Jump-to-placement (D-12, Task 2) ────────────────────────────────────────────────────────
  // When the profile "Appears on" jump sets `focusMarkerId` (after switching the active map), find
  // that marker on the now-active map, SELECT it (so the Transformer ring shows), and recenter the
  // viewport on its composed stage point. Then fire `onFocusHandled` so the host clears the id —
  // re-jumping to the SAME placement works again. Guarded on the marker being present so it runs
  // only once the (async) markers read for the new active map has resolved.
  useEffect(() => {
    if (!focusMarkerId) return;
    const stage = stageRef.current;
    const mk = (markers ?? []).find((m) => m.id === focusMarkerId);
    if (!stage || !mk || size.width === 0) return;
    setSelectedMarkerId(focusMarkerId);
    setSelectedShapeId(null);
    setEditingBackground(false);
    const c = imageToStage({ x: mk.x, y: mk.y }, transform);
    const scale = stage.scaleX();
    stage.position({ x: size.width / 2 - c.x * scale, y: size.height / 2 - c.y * scale });
    culling.recompute(stage);
    onFocusHandled?.();
  }, [focusMarkerId, markers, transform, size.width, size.height, culling, onFocusHandled]);

  // Per-layer object count (shapes + markers resolved to a layer) for the panel count pills. An
  // object with an absent/dangling layerId is counted against the default layer (resolveLayer).
  const objectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (layers.length === 0) return counts;
    const bump = (layerId?: string) => {
      const layer = resolveLayer({ id: '', layerId }, layers);
      if (!layer) return;
      counts[layer.id] = (counts[layer.id] ?? 0) + 1;
    };
    for (const s of map?.shapes ?? []) bump(s.layerId);
    for (const mk of markers ?? []) bump(mk.layerId);
    return counts;
  }, [layers, map?.shapes, markers]);

  const hasMap = !!map;
  const hasAnyMap = (mapCount ?? 0) > 0;

  return (
    <div ref={rootRef} className={styles.root} data-testid="map-view">
      {/* Editor toolbar overlay — map switcher + parent-chain breadcrumb. Shown whenever a map is
          active (it floats over the Stage; the empty state has no toolbar). */}
      {hasMap && (
        <div className={styles.toolbar}>
          <MapSwitcher
            activeMapId={activeMapId}
            activeMapName={map?.name ?? ''}
            onActiveMapChange={onActiveMapChange}
            onCreateMap={onCreateMap}
          />
          <Breadcrumb activeMapId={activeMapId} onNavigate={onActiveMapChange} />
          <ToolPalette tool={tool} onSelectTool={setTool} disabled={!hasMap} />
          {/* S16b: explicit background-edit toggle so the bg is never grabbed by accident.
              Entering it clears any object selection; the Transformer then attaches to the bg. */}
          <button
            type="button"
            className={styles.bgEditToggle}
            data-testid="edit-background-toggle"
            aria-pressed={editingBackground}
            onClick={() => {
              setEditingBackground((on) => {
                const next = !on;
                if (next) clearSelection();
                return next;
              });
            }}
          >
            {editingBackground ? 'Done' : 'Edit background'}
          </button>
        </div>
      )}

      {/* While transforming the background, a hint reassures the curator placements stay put. */}
      {hasMap && editingBackground && (
        <div className={styles.bgHint} role="status" data-testid="bg-transform-hint">
          Transforming background — markers stay anchored.
        </div>
      )}

      {/* Layers panel (S11, MAP-03) — create/rename/reorder/show/hide/lock + the D-20 label toggle.
          Only meaningful once the map has at least one layer (drawing/placing creates one). */}
      {hasMap && map && layers.length > 0 && (
        <LayersPanel
          map={map}
          activeLayerId={effectiveActiveLayerId}
          onActiveLayerChange={setActiveLayerId}
          showLabels={showLabels}
          onShowLabelsChange={setShowLabels}
          showConnectorLines={showConnectorLines}
          onShowConnectorLinesChange={setShowConnectorLines}
          showConnectorLabels={showConnectorLabels}
          onShowConnectorLabelsChange={setShowConnectorLabels}
          objectCounts={objectCounts}
          appearance={appearance}
          onLabelColorChange={(hex) => void setMapColor(map.id, 'labelColor', hex)}
          onConnectorColorChange={(hex) => void setMapColor(map.id, 'connectorColor', hex)}
          onResetLabelColor={() => void clearMapColor(map.id, 'labelColor')}
          onResetConnectorColor={() => void clearMapColor(map.id, 'connectorColor')}
        />
      )}

      {hasMap && size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          // Draggable only when the tool mode says so: Select pans, draw modes draw (single
          // pointer), and a two-finger touch always pans/pinches (D-19).
          draggable={stageDraggable}
          onWheel={handleWheel}
          onDragEnd={handleDragEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          // Double-click / double-tap closes an in-progress polygon (the multi-click commit gesture).
          onDblClick={handlePolygonClose}
          onDblTap={handlePolygonClose}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          // Click on empty canvas (not a marker/shape) clears selection (D-15) — EXCEPT while placing
          // polygon vertices, where each vertex is itself an empty-canvas click and must not deselect.
          onClick={(e) => {
            // Konva raises a synthetic click on the release of ANY button, so without this guard a
            // middle-button pan (or a right-click) would wipe the curator's selection.
            //
            // `e.evt` is typed non-optional but is genuinely absent when a click is raised
            // PROGRAMMATICALLY (`node.fire('click', { target: node }, true)`) rather than by the
            // browser — reading `.button` off it then throws and kills the whole handler chain.
            // Treat a synthetic click as a left click, which is what it stands in for.
            if (e.evt && e.evt.button !== 0) return;
            // Konva also raises a click on the release that ENDED a marquee band. Consume it, or
            // the empty-canvas deselect below would immediately wipe the selection just made.
            if (suppressStageClickRef.current) {
              suppressStageClickRef.current = false;
              return;
            }
            if (e.target === e.target.getStage()) {
              if (tool === 'polygon' && drawRef.current) return;
              onSelect('');
              clearSelection();
            }
          }}
        >
          {/* L0 — background image. Positioned/scaled/rotated by the map's background transform
              (offset → uniform scale → rotation in radians). Non-interactive EXCEPT while the
              "Edit background" affordance is active, when it becomes draggable and exposes its node
              to the L2 Transformer for resize/rotate (S16b, criterion 7). */}
          <Layer listening={editingBackground}>
            {bgImage && (
              <KonvaImage
                ref={(node) => setBgNode(node)}
                image={bgImage}
                x={transform.offsetX}
                y={transform.offsetY}
                scaleX={transform.scale}
                scaleY={transform.scale}
                rotation={(transform.rotation * 180) / Math.PI}
                draggable={editingBackground}
                onDragEnd={editingBackground ? handleBackgroundTransformEnd : undefined}
                onTransformEnd={editingBackground ? handleBackgroundTransformEnd : undefined}
              />
            )}
          </Layer>

          {/* Connectors (REL-03) — the data-driven relationship lines. A dedicated NON-INTERACTIVE
              physical Konva layer inserted BETWEEN L0 (background) and L1 (content) so the lines
              paint BENEATH the markers and never intercept a marker drag/click (D-08/D-10, B7).
              This is a physical-layer insertion, NOT a user-facing logical (MapDoc.layers) layer.
              Endpoints compose through the SAME background transform as markers (imageToStage) so
              they stay anchored on a background re-fit and follow a marker live during a drag. */}
          {/* The physical <Layer> stays MOUNTED unconditionally — only its ConnectorLayer child is
              gated by the session-only showConnectorLines toggle. Unmounting the Layer itself would
              churn a real <canvas> element and disturb the fixed physical-layer stack described
              above. Gating the child is enough to skip the geometry work: buildConnectors runs in
              ConnectorLayer's function body, and an unrendered component never executes it. */}
          <Layer listening={false}>
            {showConnectorLines && (
              <ConnectorLayer
                links={links ?? []}
                markers={markers ?? []}
                transform={transform}
                dragOverride={draggingMarker}
                showConnectorLabels={showConnectorLabels}
                connectorColor={appearance.connectorColor}
              />
            )}
          </Layer>

          {/* L1 — content. ALL objects (shapes + markers) live in this SINGLE physical Konva layer
              and are ordered by their LOGICAL layer (RESEARCH Pattern 3 — never one Konva Layer per
              user layer). Shapes render bottom→top by layer order (then a draw preview), then the
              markers (each composed from IMAGE space + culled), so markers stay visually above
              same-layer zones. Hidden-layer objects are already filtered out; locked-layer objects
              render dimmed (opacity 0.6) and non-interactive (listening=false). */}
          <Layer>
            {orderedShapes.map(({ object: shape, locked, opacity }) => (
              <Group key={shape.id} opacity={opacity} listening={!locked}>
                <ShapeNode
                  map={map!}
                  shape={shape}
                  transform={transform}
                  // Single-select OR part of a marquee multi-selection — the existing `selected`
                  // prop is simply widened, so ShapeNode itself is untouched (D-4).
                  selected={shape.id === selectedShapeId || marqueeShapeIdSet.has(shape.id)}
                  onSelect={(id) => {
                    // Selecting a shape is single-select: clear any marker selection, exit bg-edit.
                    setSelectedShapeId(id);
                    setSelectedMarkerId(null);
                    setEditingBackground(false);
                  }}
                  onNodeRef={
                    shape.id === selectedShapeId ? (node) => setSelectedNode(node) : undefined
                  }
                />
              </Group>
            ))}
            {/* Zone label chips for any VISIBLE-layer shape carrying a non-empty label (D-02). */}
            {orderedShapes
              .filter(({ object: s }) => (s.label ?? '').trim().length > 0)
              .map(({ object: s }) => {
                const c = shapeCenter(s, transform);
                return <ZoneLabel key={`label-${s.id}`} label={s.label!} x={c.x} y={c.y} />;
              })}
            {/* In-progress draw preview (rect/ellipse/line). */}
            {draw && <DrawPreview draw={draw} transform={transform} />}

            {visibleMarkers.map(({ mk, pos, locked, opacity }) => {
              const person = (people ?? []).find((p) => p.id === mk.personId);
              if (!person) return null;
              return (
                <Group key={mk.id} opacity={opacity} listening={!locked}>
                  <AvatarMarker
                    marker={mk}
                    person={person}
                    position={pos}
                    transform={transform}
                    selected={person.id === selectedPersonId || marqueeMarkerIdSet.has(mk.id)}
                    showLabels={showLabels}
                    labelColor={appearance.labelColor}
                    onDragMove={handleMarkerDragMove}
                    onDragEnd={handleMarkerDragEnd}
                    onSelect={(personId) => {
                      // Selecting a marker opens its profile AND selects it for the Transformer
                      // (single-select: clear any shape selection, exit bg-edit). Thread THIS
                      // marker's id so the host removes the exact clicked placement (CR-01).
                      onSelect(personId, mk.id);
                      setSelectedMarkerId(mk.id);
                      setSelectedShapeId(null);
                      setEditingBackground(false);
                    }}
                    onNodeRef={
                      mk.id === selectedMarkerId ? (node) => setSelectedNode(node) : undefined
                    }
                  />
                </Group>
              );
            })}

            {/* Portal glyphs (kind:'portal') — the down-navigation half of MAP-07. Single-click
                selects (Transformer handles); double-click navigates to the target map. A portal
                whose target was deleted renders muted and shows the deleted message on navigate. */}
            {visiblePortals.map(({ mk, pos, locked, opacity }) => (
              <Group key={mk.id} opacity={opacity} listening={!locked}>
                <PortalGlyph
                  marker={mk}
                  position={pos}
                  transform={transform}
                  selected={mk.id === selectedMarkerId || marqueeMarkerIdSet.has(mk.id)}
                  targetExists={!!mk.targetMapId && mapsById.has(mk.targetMapId)}
                  showLabels={showLabels}
                  targetName={mk.targetMapId ? mapsById.get(mk.targetMapId) : undefined}
                  onSelect={(id) => {
                    setSelectedMarkerId(id);
                    setSelectedShapeId(null);
                    setEditingBackground(false);
                    onSelect('');
                  }}
                  onNavigate={navigatePortal}
                  onNodeRef={
                    mk.id === selectedMarkerId ? (node) => setSelectedNode(node) : undefined
                  }
                />
              </Group>
            ))}
          </Layer>

          {/* L2 — transformer-overlay (RESEARCH Pattern 3, fixed third physical layer). Attaches a
              single Konva.Transformer to the selected object's node, OR to the background image
              while the "Edit background" affordance is active (S16b). */}
          <Layer>
            <TransformerOverlay selectedNode={editingBackground ? bgNode : selectedNode} />
          </Layer>
        </Stage>
      )}

      {/* The marquee band — a DOM overlay sibling, NOT a Konva node. `stage.getPointerPosition()`
          already returns STAGE-CONTAINER pixels, which is the same box this root div occupies, so
          the band needs no transform composition and stays a constant-weight 1px outline at any
          zoom (a Konva rect would scale with the Stage). */}
      {marquee && (
        <div
          className={styles.marquee}
          data-testid="marquee-rect"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      {/* Multi-selection action bar (D-6) — mounts ONLY while a band holds 2+ objects. Its Delete
          runs the SAME `requestDelete` path as the Delete key, so the button and the key can never
          diverge; it is the touch-reachable affordance for a bulk delete (no hardware Delete key on
          a tablet), mirroring why StylePopover carries a Delete button of its own. */}
      {hasMap && (
        <MultiSelectBar
          count={selectionCount(marqueeSelection)}
          onDelete={() => void requestDelete()}
        />
      )}

      {/* T-NFS-01 / D-1: the blocking confirm for a bulk delete. Used exactly as ProfileSidebar uses
          it (safe Cancel takes initial focus). The body spells out the delete-vs-remove distinction
          so a curator can never mistake "remove these pins" for "delete these people". */}
      <ConfirmDialog
        open={pendingBulkDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingBulkDelete(null);
        }}
        title={`Delete ${
          (pendingBulkDelete?.shapeIds.length ?? 0) + (pendingBulkDelete?.markerIds.length ?? 0)
        } selected objects?`}
        body="Shapes are removed from this map. Placed people and portals are removed from THIS map only — the people, groups and maps they point to stay in your database. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          const targets = pendingBulkDelete;
          setPendingBulkDelete(null);
          if (!targets) return;
          // Shapes go in ONE updateMapShapes write (the existing fresh-read WR-01 filter); markers
          // go one deleteMarker per row — the referenced people/groups survive (see deleteMarkers).
          deleteShapes(targets.shapeIds);
          deleteMarkers(targets.markerIds);
          clearSelection();
        }}
      />

      {/* Style popover — opens when a shape is selected; closing it clears the selection. */}
      {map && (
        <StylePopover
          open={selectedShape !== null}
          onOpenChange={(o) => {
            if (!o) setSelectedShapeId(null);
          }}
          map={map}
          shape={selectedShape}
          onDelete={() => {
            if (selectedShape) deleteShapes([selectedShape.id]);
          }}
        />
      )}

      {/* Portal target picker (S15, D-08) — opens on portal drop. Create-or-pick the target map
          inline; cancel removes the just-dropped (target-less) portal. */}
      {map && (
        <PortalTargetPicker
          open={pendingPortalId !== null}
          portalId={pendingPortalId}
          currentMapId={map.id}
          onOpenChange={(o) => {
            if (!o) setPendingPortalId(null);
          }}
          onDone={() => setPendingPortalId(null)}
        />
      )}

      {/* Person picker (S16, D-11) — opens when the Person tool drops at a point. Pick an existing
          person → a NEW Marker row is placed at the drop point (multi-placement, D-13). Cancel
          abandons the pending placement. */}
      {map && (
        <PersonPicker
          open={pendingPersonPoint !== null}
          onOpenChange={(o) => {
            if (!o) setPendingPersonPoint(null);
          }}
          onPick={(personId) => void placePerson(personId)}
          onCreateNew={onCreatePerson}
        />
      )}

      {/* Deleted-destination message (T-03-10) — surfaced when a portal whose target was deleted is
          double-clicked. A brief dismissible status rather than a crash. */}
      {portalError && (
        <div className={styles.bgHint} role="alert" data-testid="portal-target-error">
          {portalError}
          <button
            type="button"
            className={styles.bgEditToggle}
            onClick={() => setPortalError(null)}
            style={{ marginLeft: 8 }}
          >
            Dismiss
          </button>
        </div>
      )}

      {!hasAnyMap && (
        <div className={styles.empty}>
          <div className={styles.dropZone}>
            <MapPin size={32} strokeWidth={1.75} color={colors.amber} aria-hidden="true" />
            <h2 className={styles.dropHeading}>Start with a place.</h2>
            <p className={styles.dropBody}>
              Upload a floor plan, site photo, or any image to use as your map. Then you can
              place people on it.
            </p>
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload map image
            </button>
            {uploadError && (
              <p className={styles.error} role="alert">
                {uploadError}
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.hiddenInput}
            data-testid="map-upload-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}

// `useBlobImage` is re-exported for sibling components that already hold a Blob.
export { useBlobImage };
