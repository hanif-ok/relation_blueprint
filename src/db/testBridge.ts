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
  upsertMarker,
} from './repository';
import { storeMedia } from './media';

export interface TestBridge {
  db: typeof db;
  createPerson: typeof createPerson;
  updatePerson: typeof updatePerson;
  deletePerson: typeof deletePerson;
  getPerson: typeof getPerson;
  listPeople: typeof listPeople;
  createMap: typeof createMap;
  upsertMarker: typeof upsertMarker;
  storeMedia: typeof storeMedia;
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
    upsertMarker,
    storeMedia,
  };
}
