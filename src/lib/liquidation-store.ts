import { connectionManager, type ConnectionSource } from './market-stream';
import { LIQ_DAY, parseBinanceLiq, parseBybitLiq, restoreLiqEvents, type LiqEvent } from './liquidation-data';
// Module-level per source:symbol liquidation history (24h in memory, IndexedDB every 10s). No backfill, ever.
export type LiqStore = { events: LiqEvent[]; ids: Set<string>; since: number | null; unavailable: boolean; listeners: Set<() => void>; dirty: boolean };
const stores = new Map<string, LiqStore>();
let saver: ReturnType<typeof setInterval> | undefined;
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => { const r = indexedDB.open('depthlens-liquidations', 1); r.onupgradeneeded = () => r.result.createObjectStore('history'); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); });
}
export function addLiq(s: LiqStore, e: LiqEvent, now = Date.now()) {
  if (s.ids.has(e.id)) return false;
  s.ids.add(e.id); s.events.push(e); s.dirty = true;
  if (s.events.length > 1 && e.time < (s.events.at(-2)?.time ?? 0)) s.events.sort((a, b) => a.time - b.time);
  if ((s.events[0]?.time ?? now) < now - LIQ_DAY) { s.events = s.events.filter(x => x.time >= now - LIQ_DAY); s.ids = new Set(s.events.map(x => x.id)); }
  return true;
}
export async function saveLiq(key: string, s: LiqStore) {
  try { const d = await db(); if (!d) return; const tx = d.transaction('history', 'readwrite'); tx.objectStore('history').put({ events: s.events, since: s.since }, key); await new Promise<void>(r => { tx.oncomplete = tx.onerror = () => { d.close(); r(); }; }); s.dirty = false; } catch { /* storage optional */ }
}
export async function loadLiq(key: string, s: LiqStore) {
  try {
    const d = await db(); if (!d) return;
    const saved: any = await new Promise(resolve => { const r = d.transaction('history').objectStore('history').get(key); r.onsuccess = () => { resolve(r.result); d.close(); }; r.onerror = () => { resolve(null); d.close(); }; });
    if (!saved) return;
    for (const e of restoreLiqEvents(saved.events, Date.now())) addLiq(s, e);
    if (Number.isFinite(saved.since) && saved.since >= Date.now() - LIQ_DAY) s.since = Math.min(s.since ?? Infinity, saved.since);
    for (const f of s.listeners) f();
  } catch { /* storage optional */ }
}
export function liqStore(source: ConnectionSource, symbol: string): LiqStore {
  const key = `${source}:${symbol}`; let s = stores.get(key); if (s) return s;
  s = { events: [], ids: new Set(), since: null, unavailable: false, listeners: new Set(), dirty: false }; stores.set(key, s);
  void loadLiq(key, s);
  saver ??= setInterval(() => { for (const [k, v] of stores) if (v.dirty) void saveLiq(k, v); }, 10000);
  return s;
}
/** Multiplexes the liquidation topic onto the existing active socket; never opens a socket. */
export function liquidationFeed(source: ConnectionSource, symbol: string) {
  const s = liqStore(source, symbol); s.unavailable = false; s.since ??= Date.now();
  const notify = () => { for (const f of s.listeners) f(); };
  const topic = source === 'binance' ? `${symbol.toLowerCase()}@forceOrder` : `allLiquidation.${symbol}`;
  return connectionManager.subscribe(source, topic, message => {
    if (message?.success === false) { s.unavailable = true; notify(); return; }
    const events = source === 'binance' ? [parseBinanceLiq(message, symbol)].filter((e): e is LiqEvent => e !== null) : parseBybitLiq(message, symbol);
    let changed = false; for (const e of events) changed = addLiq(s, e) || changed;
    if (changed) notify();
  }, () => {});
}
if (import.meta.hot) import.meta.hot.dispose(() => { clearInterval(saver); saver = undefined; });
