// IndexedDB persistence for heatmap buffers. One record per source:symbol.
import type { Column } from './heatmap-data';

const DB_NAME = 'depthlens-heatmap';
const STORE = 'buffers';

export type SavedBuffer = { savedAt: number; bucket: number; columns: Column[] };

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function saveHeatmapBuffer(key: string, bucket: number, columns: readonly Column[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    // Float32Array and Map survive structured clone, so columns are stored as-is.
    tx.objectStore(STORE).put({ savedAt: Date.now(), bucket, columns: [...columns] } satisfies SavedBuffer, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

export async function loadHeatmapBuffer(key: string): Promise<SavedBuffer | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => { db.close(); resolve((req.result as SavedBuffer | undefined) ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
}
