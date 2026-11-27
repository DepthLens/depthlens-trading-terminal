// Module-level footprint buffers keyed by source:symbol, persisted to IndexedDB every 10 s.
import { addLiveTrade, addSegment, addTrade, createStore, isCovered, lastGap, liveCandleExchange, mergeSegments, prune, DAY, type FootprintStore } from './footprint-data';
import { marketStream } from './market-stream';
import type { LivePrice, TradeSource } from './live-price';
import { isRecordedFootprint, type TailTrade } from './footprint-recorded';

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
      const savedCell = c as import('./footprint-data').Cell;
      const price = (k + .5) * store.tick;
      const t = target.get(k);
      if (t) { t.bid += c.bid; t.ask += c.ask; t.bidNotional = (t.bidNotional ?? 0) + (savedCell.bidNotional ?? c.bid * price); t.askNotional = (t.askNotional ?? 0) + (savedCell.askNotional ?? c.ask * price); }
      else target.set(k, { ...c, bidNotional: savedCell.bidNotional ?? c.bid * price, askNotional: savedCell.askNotional ?? c.ask * price });
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
  // The active feed and the dedicated Binance footprint feed can overlap briefly; aggTrade IDs keep each trade once.
  if (tick.exchange === 'binance' && tick.tradeId !== undefined && isRecordedFootprint(symbol) && markSeen(`binance:${symbol}`, tick.tradeId, tick.time)) return;
  if (isRecordedFootprint(symbol)) liveAt.set(`${tick.exchange}:${symbol}`, Date.now());
  addLiveTrade(footprintStore(tick.exchange, symbol, minMove), tick.time, tick.price, tick.size, tick.side === 'Sell');
  if (isRecordedFootprint(symbol)) addTail(`${tick.exchange}:${symbol}`, { time: tick.time, price: tick.price, size: tick.size, sell: tick.side === 'Sell' });
}
// Raw live trades of the recorded symbol (15 minutes, capped) so the forming candle can start exactly at the
// newest recorded second without double counting.
const TAIL_MS = 900000, TAIL_MAX = 300000;
const tails = new Map<string, { start: number; trades: TailTrade[] }>();
function addTail(key: string, t: TailTrade) {
  let tail = tails.get(key);
  if (!tail) { tail = { start: t.time, trades: [] }; tails.set(key, tail); }
  tail.trades.push(t);
  const first = tail.trades[0];
  if (tail.trades.length > TAIL_MAX || (first && first.time < t.time - TAIL_MS - 60000)) {
    const cut = t.time - TAIL_MS; let i = 0;
    while (i < tail.trades.length && ((tail.trades[i]?.time ?? 0) < cut || tail.trades.length - i > TAIL_MAX)) i++;
    tail.trades.splice(0, i); tail.start = Math.max(tail.start, cut);
  }
}
const seenIds = new Map<string, Map<string, number>>(), liveAt = new Map<string, number>(), feedStarted = new Map<string, number>();
function markSeen(key: string, id: string, time: number) {
  let ids = seenIds.get(key); if (!ids) { ids = new Map(); seenIds.set(key, ids); }
  if (ids.has(id)) return true;
  ids.set(id, time);
  if (ids.size > TAIL_MAX * 1.2) for (const [k, t] of ids) { if (t < time - TAIL_MS - 60000) ids.delete(k); else break; }
  return false;
}
/** Exchange whose trades build the BTCUSDT forming candle next to recorded (Binance) candles. */
export function footprintLiveExchange(active: TradeSource, symbol: string, now = Date.now()): TradeSource {
  return liveCandleExchange(active, liveAt.get(`binance:${symbol}`) ?? null, feedStarted.get(symbol) ?? null, now);
}
/** While the active price source is not Binance, the recorded symbol's forming candle still needs Binance trades:
 * one dedicated aggTrade socket through the connection manager, plus a one-off REST fill of the last 90 s. */
// Footprint and CVD share one feed per symbol (reference counted), so both tools never open two sockets.
const sharedFeeds = new Map<string, { users: number; stop: () => void }>();
export function binanceFootprintFeed(symbol: string, minMove: number) {
  let feed = sharedFeeds.get(symbol);
  if (!feed) { feed = { users: 0, stop: openBinanceFeed(symbol, minMove) }; sharedFeeds.set(symbol, feed); }
  feed.users++;
  let done = false;
  return () => { if (done) return; done = true; const f = sharedFeeds.get(symbol); if (f && --f.users <= 0) { sharedFeeds.delete(symbol); f.stop(); } };
}
function openBinanceFeed(symbol: string, minMove: number) {
  const lower = symbol.toLowerCase(), abort = new AbortController();
  feedStarted.set(symbol, Date.now());
  const stop = marketStream(`wss://fstream.binance.com/market/stream?streams=${lower}@aggTrade`, message => {
    const d = message?.data ?? message;
    if (!d || d.e !== 'aggTrade' || d.s !== symbol) return;
    const price = Number(d.p), time = Number(d.T), size = Number(d.q);
    if (!(price > 0) || !Number.isFinite(time) || !(size > 0)) return;
    addFootprintTrade(symbol, { price, time, direction: 0, size, side: d.m ? 'Sell' : 'Buy', exchange: 'binance', source: 'trade', ...(d.a === undefined ? {} : { tradeId: String(d.a) }) }, minMove);
  }, undefined, { exchange: 'binance', purpose: 'footprint' });
  void fillBinanceTail(symbol, abort.signal);
  return () => { abort.abort(); stop(); feedStarted.delete(symbol); };
}
async function fillBinanceTail(symbol: string, signal: AbortSignal) {
  if (Date.now() < pausedUntil) return;
  const key = `binance:${symbol}`, prior = tails.get(key);
  const priorStart = prior?.start ?? null, priorLast = prior?.trades.at(-1)?.time ?? null;
  const startedAt = Date.now(), from = startedAt - 90000;
  let url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&startTime=${from}&limit=1000`;
  try {
    for (let page = 0; page < 4; page++) {
      const r = await fetch(url, { signal });
      if (r.status === 429 || r.status === 418) { pausedUntil = Date.now() + 60000; return; }
      if (!r.ok) return;
      const list = await r.json();
      if (!Array.isArray(list) || !list.length || signal.aborted) break;
      for (const t of list) {
        const time = Number(t.T), price = Number(t.p), size = Number(t.q);
        if (!(price > 0) || !(size > 0) || !Number.isFinite(time) || markSeen(key, String(t.a), time)) continue;
        addTail(key, { time, price, size, sell: t.m === true });
      }
      if (list.length < 1000 || Number(list.at(-1).T) >= startedAt) break;
      url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&fromId=${Number(list.at(-1).a) + 1}&limit=1000`;
    }
    const tail = tails.get(key); if (!tail || signal.aborted) return;
    tail.trades.sort((a, b) => a.time - b.time);
    // Contiguous since the older start only if the previous tail reaches into the filled window.
    tail.start = priorStart !== null && priorLast !== null && priorLast >= from ? Math.min(priorStart, from) : from;
  } catch { /* honest partial candle: the tail start stays at the first live trade */ }
}
export function footprintTail(source: TradeSource, symbol: string): { start: number | null; trades: readonly TailTrade[] } {
  const tail = tails.get(`${source}:${symbol}`);
  return tail ? tail : { start: null, trades: [] };
}
export const footprintPaused = () => Date.now() < pausedUntil;
/** Fill the latest uncovered gap in [from, now) with real trades; at most 20 requests per pair per 5 minutes. */
export async function backfillFootprint(source: TradeSource, symbol: string, tick: number, from: number, signal?: AbortSignal): Promise<boolean> {
  const key = `${source}:${symbol}`, store = footprintStore(source, symbol, tick), now = Date.now();
  if (Date.now() < pausedUntil || !store.restored) return false;
  let run = backfillRuns.get(key);
  if (!run || now - run.at > 300000) { run = { at: now, requests: 0 }; backfillRuns.set(key, run); }
  const max = source === 'binance' ? 20 : 1;
  if (run.requests >= max) return false;
  const end = store.liveFrom ?? now, found = lastGap(store, Math.max(from, now - DAY), end);
  if (!found) return false;
  // Fill the newest part of the gap first so the latest visible candles complete before older ones.
  const gap: [number, number] = source === 'binance' ? [Math.max(found[0], found[1] - 600000), found[1]] : found;
  const get = async (url: string) => {
    run!.requests++;
    const r = await fetch(url, { signal: signal ?? null });
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
