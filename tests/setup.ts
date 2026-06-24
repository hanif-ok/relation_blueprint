// Wire a fake IndexedDB into the global scope so Dexie can open a real in-memory
// database under node/jsdom during Vitest runs. Importing the `/auto` entry point
// patches the globals (indexedDB, IDBKeyRange, …) on import — no further setup needed.
import 'fake-indexeddb/auto';
