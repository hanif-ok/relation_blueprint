// MapView — the full-bleed dark Konva Stage that is the app's hero surface.
//
// Layers: (1) the uploaded background image, (2) the markers. When no map exists yet it
// shows the DOM empty-state upload affordance (UI-SPEC S2). Pan/zoom is intentionally
// minimal (drag-pan + wheel-zoom) — the full editor is Phase 3. No viewport culling or
// shape caching (single-marker skeleton; deferred to Phase 3 per RESEARCH Pattern 5).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin } from 'lucide-react';
import { db } from '@/db/schema';
import type { Marker } from '@/domain/types';
import { createMap } from '@/db/repository';
import { storeMedia } from '@/media/mediaManager';
import { colors } from '@/app/tokens';
import { AvatarMarker } from './AvatarMarker';
import { useMapImage, useBlobImage } from './useMapImage';
import styles from './MapView.module.css';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB cap (UI-SPEC A10)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_ERROR = "That image couldn't be loaded. Try a JPG, PNG, or WebP under 25 MB.";

export interface MapViewProps {
  /** The currently selected person id, mirrored to the marker ring. */
  selectedPersonId: string | null;
  /** Raised when a marker is clicked — opens the profile sidebar. */
  onSelect: (personId: string) => void;
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

export function MapView({ selectedPersonId, onSelect }: MapViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Reactive reads — Dexie is the source of truth (no hand-rolled listeners).
  const map = useLiveQuery(() => db.maps.toArray().then((m) => m[0] ?? null), [], null);
  const markers = useLiveQuery(
    () =>
      map ? db.markers.where('mapId').equals(map.id).toArray() : Promise.resolve<Marker[]>([]),
    [map?.id],
    [] as Marker[],
  );
  const people = useLiveQuery(() => db.people.toArray(), [], []);

  const bgImage = useMapImage(map?.background.hash);

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
      await createMap({
        name: file.name,
        background: ref,
        width: ref.width ?? dims.width,
        height: ref.height ?? dims.height,
      });
    } catch {
      setUploadError(UPLOAD_ERROR);
    }
  }, []);

  // Basic wheel-zoom around the pointer (minimal — Phase 3 owns the real editor).
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
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
  }, []);

  const hasMap = !!map;

  return (
    <div ref={rootRef} className={styles.root} data-testid="map-view">
      {hasMap && size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          draggable
          onWheel={handleWheel}
          // Click on empty canvas (not a marker) clears selection.
          onClick={(e) => {
            if (e.target === e.target.getStage()) onSelect('');
          }}
        >
          <Layer listening={false}>{bgImage && <KonvaImage image={bgImage} />}</Layer>
          <Layer>
            {(markers ?? []).map((mk) => {
              const person = (people ?? []).find((p) => p.id === mk.personId);
              if (!person) return null;
              return (
                <AvatarMarker
                  key={mk.id}
                  marker={mk}
                  person={person}
                  selected={person.id === selectedPersonId}
                  onSelect={onSelect}
                />
              );
            })}
          </Layer>
        </Stage>
      )}

      {!hasMap && (
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
