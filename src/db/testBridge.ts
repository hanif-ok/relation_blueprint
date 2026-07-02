// Test bridge — exposes the repository + db on `window.__rb` so Playwright E2E specs can
// seed and inspect the real Dexie database that the production bundle uses.
//
// This is intentionally shipped in the bundle: the E2E tests run against the built app
// (vite preview), and seeding through the SAME repository the UI uses is what proves the
// wiring end-to-end. It exposes only data helpers (no network, no secrets) and is a thin,
// inert global when no test driver is present.

import Konva from 'konva';
import { db } from './schema';
import {
  createPerson,
  updatePerson,
  deletePerson,
  getPerson,
  listPeople,
  createMap,
  updateMap,
  upsertMarker,
  createGroup,
  createRelationshipLink,
  deleteEntity,
  createFieldDef,
  updateFieldDef,
  reorderFieldDefs,
  softDeleteFieldDef,
  listFieldDefs,
} from './repository';
import { storeMediaRaw } from './media';
import { orderObjectsForRender, resolveLayer } from '@/features/person-map/editor/layers';
import type { BackgroundTransform } from '@/domain/types';
import {
  markConnected,
  markSyncing,
  markSynced,
  markNeedsReconnect,
  markError,
  markDisconnected,
} from '@/features/connect/syncStatusStore';

/**
 * Drive-connect state transitions exposed to E2E. Because a LIVE Drive connect needs the human
 * OAuth Client ID (absent in CI — see SETUP.md), the connect E2E drives these store transitions
 * to exercise the chrome (pill states + Reconnect banner) deterministically. The real connect
 * path (driveAuth.connect) is unit-tested with a mocked GIS in tests/storage/auth.test.ts.
 */
export interface ConnectTestBridge {
  markConnected: typeof markConnected;
  markSyncing: typeof markSyncing;
  markSynced: typeof markSynced;
  markNeedsReconnect: typeof markNeedsReconnect;
  markError: typeof markError;
  markDisconnected: typeof markDisconnected;
}

export interface TestBridge {
  db: typeof db;
  createPerson: typeof createPerson;
  updatePerson: typeof updatePerson;
  deletePerson: typeof deletePerson;
  getPerson: typeof getPerson;
  listPeople: typeof listPeople;
  createMap: typeof createMap;
  updateMap: typeof updateMap;
  upsertMarker: typeof upsertMarker;
  createGroup: typeof createGroup;
  createRelationshipLink: typeof createRelationshipLink;
  deleteEntity: typeof deleteEntity;
  createFieldDef: typeof createFieldDef;
  updateFieldDef: typeof updateFieldDef;
  reorderFieldDefs: typeof reorderFieldDefs;
  softDeleteFieldDef: typeof softDeleteFieldDef;
  listFieldDefs: typeof listFieldDefs;
  /** Raw (no-resize) media store for seeding pre-made blobs in E2E specs. */
  storeMedia: typeof storeMediaRaw;
  /**
   * Resize/rotate a marker through the repository (criterion 6). Reads the existing marker, then
   * re-upserts it with the new width/height/rotation — exactly what the Transformer's transform-end
   * persists, but addressable from Playwright without driving a brittle canvas handle-drag. Routes
   * through `upsertMarker` (validate→stamp→emit) — NEVER straight to Dexie.
   */
  transformMarker: (
    id: string,
    t: { width?: number; height?: number; rotation?: number },
  ) => Promise<void>;
  /**
   * Set a map's background transform through the repository (criterion 7). Routes through
   * `updateMap` (validate→stamp→emit). Markers compose THROUGH this transform, so a re-fit keeps
   * their stored image-space x/y unchanged (the anchoring property the E2E asserts).
   */
  setBackgroundTransform: (mapId: string, t: BackgroundTransform) => Promise<void>;
  /**
   * The map's VISIBLE render set (MAP-03), in canvas z-order (bottom→top): every shape + marker
   * whose resolved layer is visible, ordered by logical layer order then array order. Hidden-layer
   * objects are excluded. Computed via the SAME pure `orderObjectsForRender` the editor renders
   * through, so the E2E asserts the real layer-driven behavior without brittle canvas pixel math.
   */
  visibleObjectIds: (mapId: string) => Promise<string[]>;
  /** The ids of objects on a LOCKED layer (rendered dimmed + non-interactive — listening=false). */
  lockedObjectIds: (mapId: string) => Promise<string[]>;
  connect: ConnectTestBridge;
}

declare global {
  interface Window {
    __rb?: TestBridge;
    Konva?: typeof Konva;
  }
}

/** Install the bridge on `window.__rb`. Called once at app startup. */
export function installTestBridge(): void {
  if (typeof window === 'undefined') return;
  // Expose the same Konva instance react-konva uses so E2E can address the scene graph.
  window.Konva = Konva;
  window.__rb = {
    db,
    createPerson,
    updatePerson,
    deletePerson,
    getPerson,
    listPeople,
    createMap,
    updateMap,
    upsertMarker,
    createGroup,
    createRelationshipLink,
    deleteEntity,
    createFieldDef,
    updateFieldDef,
    reorderFieldDefs,
    softDeleteFieldDef,
    listFieldDefs,
    storeMedia: storeMediaRaw,
    transformMarker: async (id, t) => {
      const existing = await db.markers.get(id);
      if (!existing) throw new Error(`transformMarker: no marker with id ${id}`);
      await upsertMarker({
        id: existing.id,
        mapId: existing.mapId,
        kind: existing.kind,
        personId: existing.personId,
        targetMapId: existing.targetMapId,
        // Thread the marker's layerId through the re-upsert (WR-02): upsertMarker does a full
        // validated put, so an omitted layerId would become undefined and silently move the marker
        // to the default layer — the exact hazard the production transform-persist paths guard
        // against. Preserving it keeps this E2E-driven helper faithful to the real Transformer.
        layerId: existing.layerId,
        x: existing.x,
        y: existing.y,
        width: t.width ?? existing.width,
        height: t.height ?? existing.height,
        rotation: t.rotation ?? existing.rotation,
      });
    },
    setBackgroundTransform: async (mapId, t) => {
      await updateMap(mapId, { backgroundTransform: t });
    },
    visibleObjectIds: async (mapId) => {
      const map = await db.maps.get(mapId);
      if (!map) return [];
      const markers = await db.markers.where('mapId').equals(mapId).toArray();
      // Combined z-order: order ALL objects (shapes + markers) by their resolved layer's order
      // (bottom→top), with markers ranked just ABOVE same-layer shapes (mirroring the MapView L1
      // content layer, which renders shapes then markers). Tag each object with a class rank so the
      // sort is fully deterministic, then reduce to ids. This makes a layer REORDER observable in
      // the returned z-order (a shape on a layer moved below a marker's layer now sorts after it).
      const combined: Array<{ id: string; layerId?: string; classRank: number }> = [
        ...map.shapes.map((s) => ({ id: s.id, layerId: s.layerId, classRank: 0 })),
        ...markers.map((m) => ({ id: m.id, layerId: m.layerId, classRank: 1 })),
      ];
      const orderById = new Map(map.layers.map((l) => [l.id, l.order]));
      return orderObjectsForRender(combined, map.layers)
        .slice()
        .sort((a, b) => {
          const la = resolveLayer({ id: a.object.id, layerId: a.object.layerId }, map.layers);
          const lb = resolveLayer({ id: b.object.id, layerId: b.object.layerId }, map.layers);
          const oa = la ? (orderById.get(la.id) ?? 0) : 0;
          const ob = lb ? (orderById.get(lb.id) ?? 0) : 0;
          if (oa !== ob) return oa - ob;
          // Within a layer, markers (classRank 1) render above shapes (classRank 0).
          return a.object.classRank - b.object.classRank;
        })
        .map((r) => r.object.id);
    },
    lockedObjectIds: async (mapId) => {
      const map = await db.maps.get(mapId);
      if (!map) return [];
      const markers = await db.markers.where('mapId').equals(mapId).toArray();
      const ids: string[] = [];
      for (const s of map.shapes) {
        const layer = resolveLayer({ id: s.id, layerId: s.layerId }, map.layers);
        if (layer?.locked) ids.push(s.id);
      }
      for (const mk of markers) {
        const layer = resolveLayer({ id: mk.id, layerId: mk.layerId }, map.layers);
        if (layer?.locked) ids.push(mk.id);
      }
      return ids;
    },
    connect: {
      markConnected,
      markSyncing,
      markSynced,
      markNeedsReconnect,
      markError,
      markDisconnected,
    },
  };
}
