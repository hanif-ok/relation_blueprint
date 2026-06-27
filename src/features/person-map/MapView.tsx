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
import { createMap, updateMap, upsertMarker } from '@/db/repository';
import { storeMedia } from '@/media/mediaManager';
import { colors, zonePresets } from '@/app/tokens';
import { AvatarMarker } from './AvatarMarker';
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
import { PortalGlyph, PORTAL_TARGET_DELETED_MESSAGE } from './editor/PortalGlyph';
import { PortalTargetPicker } from './editor/PortalTargetPicker';
import { PersonPicker } from './editor/PersonPicker';
import { orderObjectsForRender, resolveLayer } from './editor/layers';
import {
  useToolMode,
  beginDraw,
  updateDraw,
  commitDraw,
  type DraftShape,
  type DrawState,
} from './editor/useToolMode';
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
  /** Raised when a marker is clicked — opens the profile sidebar. */
  onSelect: (personId: string) => void;
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

  const bgImage = useMapImage(map?.background.hash);

  // Viewport culling (RESEARCH Pattern 5): recompute the visible world-rect on pan/zoom END,
  // debounced — not every frame. Off-screen markers are filtered out before mounting.
  const culling = useViewportCulling();

  const transform = map?.backgroundTransform ?? IDENTITY_TRANSFORM;

  // Track the container size so the Stage fills the surface.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
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
  const { tool, setTool, stageDraggable, draw, setDraw, setTwoFingerActive } = toolMode;

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
  }, []);

  // D-20: show person-name labels on the canvas — driven by the LayersPanel toggle (default hidden).
  const [showLabels, setShowLabels] = useState(false);

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
  const layers = map?.layers ?? [];

  // D-04: the ACTIVE layer — new shapes/markers land on it. Resolves to the topmost layer when unset
  // or stale (the selected layer was deleted). The panel sets this when a row is selected/created.
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const effectiveActiveLayerId = useMemo(() => {
    if (activeLayerId && layers.some((l) => l.id === activeLayerId)) return activeLayerId;
    if (layers.length === 0) return null;
    return layers.slice().sort((a, b) => b.order - a.order)[0].id;
  }, [activeLayerId, layers]);

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
      void updateMap(map.id, { shapes: [...map.shapes, shape], layers });
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
      // Drag-draw only for rect/ellipse/line (polygon is multi-click — deferred to 03-04).
      if (tool !== 'rect' && tool !== 'ellipse' && tool !== 'line') return;
      const start = pointerToImage(stage);
      if (!start) return;
      setDrawTracked(beginDraw(tool, start));
    },
    [tool, pointerToImage, setDrawTracked, placePortal, setTool],
  );

  const handlePointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const current = drawRef.current;
      if (!current) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const at = pointerToImage(stage);
      if (!at) return;
      setDrawTracked(updateDraw(current, at));
    },
    [pointerToImage, setDrawTracked],
  );

  const handlePointerUp = useCallback(() => {
    const current = drawRef.current;
    if (!current) return;
    const committed = commitDraw(current);
    setDrawTracked(null);
    if (committed) commitShape(committed);
  }, [setDrawTracked, commitShape]);

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

  // Compose each marker's IMAGE-space coord onto the background transform, then cull off-screen
  // markers BEFORE rendering them (so they are never mounted as Konva nodes). Hidden-layer markers
  // are already excluded by `orderObjectsForRender`; the cull box is the composed stage point ±
  // MARKER_HALF_EXTENT.
  const visibleMarkers = useMemo(() => {
    const ordered = orderObjectsForRender(markers ?? [], layers);
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
          objectCounts={objectCounts}
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
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          // Click on empty canvas (not a marker/shape) clears selection (D-15).
          onClick={(e) => {
            if (e.target === e.target.getStage()) {
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
                  selected={shape.id === selectedShapeId}
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
                    selected={person.id === selectedPersonId}
                    showLabels={showLabels}
                    onSelect={(personId) => {
                      // Selecting a marker opens its profile AND selects it for the Transformer
                      // (single-select: clear any shape selection, exit bg-edit).
                      onSelect(personId);
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
                  selected={mk.id === selectedMarkerId}
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

      {/* Style popover — opens when a shape is selected; closing it clears the selection. */}
      {map && (
        <StylePopover
          open={selectedShape !== null}
          onOpenChange={(o) => {
            if (!o) setSelectedShapeId(null);
          }}
          map={map}
          shape={selectedShape}
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
