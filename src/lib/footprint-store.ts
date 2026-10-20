// Module-level footprint buffers keyed by source:symbol, persisted to IndexedDB every 10 s.
import { addLiveTrade, addSegment, addTrade, createStore, isCovered, lastGap, mergeSegments, prune, DAY, type FootprintStore } from './footprint-data';
import type { LivePrice, TradeSource } from './live-price';

const DB_NAME = 'depthlens-footprint', DB_STORE = 'buffers';
const stores = new Map<string, FootprintStore>();
const backfillRuns = new Map<string, { at: number; requests: number }>();
let pausedUntil = 0, saver: ReturnType<typeof setInterval> | undefined;
type Saved = { savedAt: number; tick: number; minutes: Map<number, Map<number, { bid: number; ask: number }>>; segments: [number, number][] };

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => { const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); }; req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); });
}
async function save(key: string, store: FootprintStore) {
  const db = await openDb(); if (!db) return;
  const tx = db.transaction(DB_STORE, 'readwrite');
  tx.objectStore(DB_STORE).put({ savedAt: Date.now(), tick: store.tick, minutes: store.minutes, segments: store.segments } satisfies Saved, key);
  tx.oncomplete = tx.onerror = () => db.close();
}
async function restore(key: string, store: FootprintStore) {
  try {
    const db = await openDb(); if (!db) return;
    const saved = await new Promise<Saved | null>(resolve => { const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key); req.onsuccess = () => { db.close(); resolve(req.result ?? null); }; req.onerror = () => { db.close(); resolve(null); }; });
    if (!saved || saved.tick !== store.tick || Date.now() - saved.savedAt > DAY) return;
    for (const [m, rows] of saved.minutes) for (const [k, c] of rows) {
      let target = store.minutes.get(m); if (!target) { target = new Map(); store.minutes.set(m, target); }
      const t = target.get(k); if (t) { t.bid += c.bid; t.ask += c.ask; } else target.set(k, { bid: c.bid, ask: c.ask });
    }
    store.segments = mergeSegments([...saved.segments, ...store.segments]);
    prune(store, Date.now());
  } finally { store.restored = true; store.dirty = true; }
}
function startSaver() {
  if (saver) return;
  saver = setInterval(() => { const now = Date.now(); for (const [key, s] of stores) if (s.restored && s.dirty) { prune(s, now); s.dirty = false; void save(key, s); } }, 10000);
}
export function footprintStore(source: TradeSource, symbol: string, tick: number) {
  const key = `${source}:${symbol}`;
  let store = stores.get(key);
  if (!store || store.tick !== tick) { store = createStore(tick); stores.set(key, store); void restore(key, store); startSaver(); }
  return store;
}
export function peekFootprint(source: TradeSource, symbol: string) { return stores.get(`${source}:${symbol}`) ?? null; }
export function addFootprintTrade(symbol: string, tick: LivePrice, minMove: number) {
  if (!tick.exchange || tick.size === undefined || !tick.side) return;
  addLiveTrade(footprintStore(tick.exchange, symbol, minMove), tick.time, tick.price, tick.size, tick.side === 'Sell');
}
export const footprintPaused = () => Date.now() < pausedUntil;
/** Fill the latest uncovered gap in [from, now) with real trades; at most 20 requests per pair per 5 minutes. */
export async function backfillFootprint(source: TradeSource, symbol: string, tick: number, from: number, signal?: AbortSignal): Promise<boolean> {
  const key = `${source}:${symbol}`, store = footprintStore(source, symbol, tick), now = Date.now();
  if (Date.now() < pausedUntil) return false;
  let run = backfillRuns.get(key);
  if (!run || now - run.at > 300000) { run = { at: now, requests: 0 }; backfillRuns.set(key, run); }
  const max = source === 'binance' ? 20 : 1;
  if (run.requests >= max) return false;
  const end = store.liveFrom ?? now, gap = lastGap(store, Math.max(from, now - DAY), end);
  if (!gap) return false;
  const get = async (url: string) => {
    run!.requests++;
    const r = await fetch(url, { signal });
    if (r.status === 429 || r.status === 418) { pausedUntil = Date.now() + 60000; throw new Error('rate limited'); }
    if (!r.ok) throw new Error('backfill failed');
    return r.json();
  };
  try {
    if (source === 'binance') {
      let url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&startTime=${gap[0]}&limit=1000`, reached = gap[0];
      while (run.requests < max) {
        const list = await get(url);
        if (!Array.isArray(list) || !list.length) { reached = gap[1]; break; }
        let done = false;
        for (const t of list) { const time = Number(t.T); if (time >= gap[1]) { done = true; break; } if (!isCovered(store, time)) addTrade(store, time, Number(t.p), Number(t.q), t.m === true); reached = time; }
        if (done || list.length < 1000) { reached = gap[1]; break; }
        url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&fromId=${Number(list.at(-1).a) + 1}&limit=1000`;
      }
      addSegment(store, gap[0], reached);
    } else {
      const body = await get(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${symbol}&limit=1000`);
      const list: any[] = body?.result?.list ?? [];
      if (!list.length) return false;
      let oldest = Infinity;
      for (const t of list) { const time = Number(t.time); oldest = Math.min(oldest, time); if (time >= gap[0] && time < gap[1] && !isCovered(store, time)) addTrade(store, time, Number(t.price), Number(t.size), t.side === 'Sell'); }
      addSegment(store, Math.max(gap[0], oldest), gap[1]);
    }
    return true;
  } catch { return false; }
}
