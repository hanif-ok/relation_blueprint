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
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin } from 'lucide-react';
import { db } from '@/db/schema';
import type { BackgroundTransform, Marker } from '@/domain/types';
import { createMap } from '@/db/repository';
import { storeMedia } from '@/media/mediaManager';
import { colors } from '@/app/tokens';
import { AvatarMarker } from './AvatarMarker';
import { useMapImage, useBlobImage } from './useMapImage';
import { imageToStage } from './coords';
import { useViewportCulling, type Rect } from './editor/useViewportCulling';
import { MapSwitcher } from './editor/MapSwitcher';
import { Breadcrumb } from './editor/Breadcrumb';
import styles from './MapView.module.css';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB cap (UI-SPEC A10)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_ERROR = "That image couldn't be loaded. Try a JPG, PNG, or WebP under 25 MB.";

/** Identity transform — the fallback when a (pre-Phase-3 or in-flight) map has no explicit one. */
const IDENTITY_TRANSFORM: BackgroundTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

/** Half-extent (px) of a marker's bounding box for culling — the avatar circle + stem reach a few
 *  dozen px around the anchor; a generous box keeps a marker mounted slightly before it enters. */
const MARKER_HALF_EXTENT = 48;

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
}: MapViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Compose each marker's IMAGE-space coord onto the background transform, then cull off-screen
  // markers BEFORE rendering them (so they are never mounted as Konva nodes). The cull box is the
  // composed stage point ± MARKER_HALF_EXTENT.
  const visibleMarkers = useMemo(() => {
    return (markers ?? [])
      .map((mk) => ({ mk, pos: imageToStage({ x: mk.x, y: mk.y }, transform) }))
      .filter(({ pos }) => {
        const box: Rect = {
          x: pos.x - MARKER_HALF_EXTENT,
          y: pos.y - MARKER_HALF_EXTENT,
          width: MARKER_HALF_EXTENT * 2,
          height: MARKER_HALF_EXTENT * 2,
        };
        return culling.isVisible(box);
      });
  }, [markers, transform, culling]);

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
        </div>
      )}

      {hasMap && size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          draggable
          onWheel={handleWheel}
          onDragEnd={handleDragEnd}
          // Click on empty canvas (not a marker) clears selection.
          onClick={(e) => {
            if (e.target === e.target.getStage()) onSelect('');
          }}
        >
          {/* L0 — background image. Non-interactive; positioned/scaled/rotated by the map's
              background transform (offset → uniform scale → rotation in radians). */}
          <Layer listening={false}>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={transform.offsetX}
                y={transform.offsetY}
                scaleX={transform.scale}
                scaleY={transform.scale}
                rotation={(transform.rotation * 180) / Math.PI}
              />
            )}
          </Layer>

          {/* L1 — content (markers; shapes/portals land in later plans). Each marker is positioned
              by composing its IMAGE-space coord onto the background transform; off-screen markers
              are culled out of this list entirely (not mounted). */}
          <Layer>
            {visibleMarkers.map(({ mk, pos }) => {
              const person = (people ?? []).find((p) => p.id === mk.personId);
              if (!person) return null;
              return (
                <AvatarMarker
                  key={mk.id}
                  marker={mk}
                  person={person}
                  position={pos}
                  selected={person.id === selectedPersonId}
                  onSelect={onSelect}
                />
              );
            })}
          </Layer>

          {/* L2 — transformer-overlay placeholder. Empty until 03-04 attaches the Konva
              Transformer here (kept as a fixed third physical layer per RESEARCH Pattern 3). */}
          <Layer />
        </Stage>
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
