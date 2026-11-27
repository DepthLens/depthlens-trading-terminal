// Module-level heatmap history store. Buffers live here, keyed by source:symbol, so
// window/grouping/intensity changes, tool toggles, tab switches and remounts never
// clear history. Only a source change clears everything. Persisted to IndexedDB.
import { HeatmapBuffer, COLUMN_MS, MAX_COLUMNS, type Column, type HeatTrade } from './heatmap-data';
import { loadHeatmapBuffer, saveHeatmapBuffer } from './heatmap-persist';
import { depthRowSize } from './tool-layout';

export type HeatSource = 'binance' | 'bybit' | 'poll';

type Entry = { buffer: HeatmapBuffer; restored: boolean; calibrated: boolean; depthSpan: number };
const entries = new Map<string, Entry>();
let currentSource: HeatSource | null = null;

const key = (source: HeatSource, symbol: string) => `${source}:${symbol}`;
export const BTC_DEPTH_CAP = 500;
export const BTC_INITIAL_BUCKET = 2;
export const heatDepthSpan = (symbol: string, span: number) => symbol === 'BTCUSDT' ? Math.min(span, BTC_DEPTH_CAP) : span;

// Source change is the ONLY event that clears history.
export function setHeatSource(source: HeatSource) {
  if (currentSource !== null && currentSource !== source) entries.clear();
  currentSource = source;
}

const RESTORE_MAX_AGE = 60 * 60 * 1000; // restore only if saved less than 60 minutes ago
const BACKFILL_EVERY = 5 * 60 * 1000; // at most one backfill per pair+source every 5 minutes
const RATE_LIMIT_PAUSE = 60 * 1000; // 429/418 stops backfill for 60 seconds
const lastBackfill = new Map<string, number>();
let blockedUntil = 0;

export function getHeatmapEntry(source: HeatSource, symbol: string, price: number): Entry {
  setHeatSource(source);
  const k = key(source, symbol);
  let entry = entries.get(k);
  if (!entry) {
    entry = { buffer: new HeatmapBuffer(price, symbol === 'BTCUSDT' ? BTC_INITIAL_BUCKET : undefined), restored: false, calibrated: false, depthSpan: 0 };
    entries.set(k, entry);
    void restoreAndBackfill(k, source, symbol, entry);
  }
  return entry;
}

async function restoreAndBackfill(k: string, source: HeatSource, symbol: string, entry: Entry) {
  // Restore from IndexedDB; a dim gap stripe marks when the page was closed.
  const saved = await loadHeatmapBuffer(k);
  const savedSpan = saved?.depthSpan ?? (saved?.bucket ?? 0) * 150;
  const validCalibration = saved?.calibrated && saved.bucket > 0 && Number.isFinite(savedSpan) && savedSpan > 0 && (symbol !== 'BTCUSDT' || (savedSpan <= BTC_DEPTH_CAP && saved.bucket <= BTC_INITIAL_BUCKET));
  if (validCalibration && saved) {
    entry.buffer.configureBucket(saved.bucket); entry.calibrated = true; entry.depthSpan = saved.depthSpan ?? saved.bucket * 150;
  }
  if (validCalibration && saved && Date.now() - saved.savedAt < RESTORE_MAX_AGE) {
    const cutoff = Date.now() - RESTORE_MAX_AGE;
    const cols = saved.columns.filter(c => c.time >= cutoff);
    if (cols.length) {
      const gapPrice = cols.at(-1)?.price ?? NaN;
      const origin = entry.buffer.index(gapPrice) - 512;
      cols.push({ time: saved.savedAt, origin, data: new Float32Array(0) as unknown as Float32Array, trades: new Map(), price: gapPrice, gap: true });
      entry.buffer.merge(cols);
    }
  }
  entry.restored = true;
  // Replace only the broken browser cache; the recording and valid history are untouched.
  if (saved?.calibrated && !validCalibration && symbol === 'BTCUSDT') {
    await saveHeatmapBuffer(k, entry.buffer.bucket, entry.buffer.columns, false, 0);
  }
  await backfill(source, symbol, entry.buffer);
}

// Liquidity band the heatmap fits to: the nearest `levels` price levels on each side of the book. Far-away
// resting orders that diff streams add over time (or levels an exchange never deletes) must not widen it.
export const MAX_DEPTH_SPAN_RATIO = .02;
export function bookDepthSpan(bids: Iterable<number>, asks: Iterable<number>, price: number, levels = 1000): number {
  const b = [...bids].filter(p => p > 0 && p <= price).sort((x, y) => y - x);
  const a = [...asks].filter(p => p >= price).sort((x, y) => x - y);
  const lo = b[Math.min(b.length, levels) - 1], hi = a[Math.min(a.length, levels) - 1];
  if (lo === undefined || hi === undefined || !(price > 0)) return 0;
  return Math.min(hi - lo, price * MAX_DEPTH_SPAN_RATIO);
}
// A saved calibration wider than the cap came from a broken band; the entry recalibrates from the live book.
export function dropInsaneCalibration(entry: Entry, price: number, symbol = ''): boolean {
  const cap = heatDepthSpan(symbol, price * MAX_DEPTH_SPAN_RATIO * 1.01);
  if (!entry.calibrated || !(price > 0) || (entry.depthSpan <= cap && (symbol !== 'BTCUSDT' || entry.buffer.bucket <= BTC_INITIAL_BUCKET))) return false;
  entry.calibrated = false; entry.depthSpan = 0; entry.buffer.clear();
  if (symbol === 'BTCUSDT') entry.buffer.configureBucket(BTC_INITIAL_BUCKET);
  return true;
}

export function calibrateHeatmap(source: HeatSource, symbol: string, entry: Entry, depthSpan: number, tick: number) {
  if (!entry.restored || entry.calibrated || !(depthSpan > 0)) return;
  depthSpan = heatDepthSpan(symbol, depthSpan);
  entry.depthSpan = depthSpan; entry.buffer.configureBucket(depthRowSize(depthSpan, tick)); entry.calibrated = true;
  void saveHeatmapBuffer(key(source, symbol), entry.buffer.bucket, entry.buffer.columns, true, depthSpan);
}

type RawTrade = { time: number; price: number; size: number; side: 'Buy' | 'Sell'; count?: number };

async function fetchJson(url: string): Promise<any | null> {
  if (Date.now() < blockedUntil) return null;
  try {
    const res = await fetch(url);
    if (res.status === 429 || res.status === 418) { blockedUntil = Date.now() + RATE_LIMIT_PAUSE; return null; }
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Backfill the last 60 minutes: 1m klines for the price line, recent trades for bubbles.
export async function backfill(source: HeatSource, symbol: string, buffer: HeatmapBuffer): Promise<void> {
  if (source === 'poll') return;
  const k = key(source, symbol);
  const last = lastBackfill.get(k) ?? 0;
  if (Date.now() - last < BACKFILL_EVERY || Date.now() < blockedUntil) return;
  lastBackfill.set(k, Date.now());

  const now = Date.now();
  const from = now - RESTORE_MAX_AGE;
  const columns: Column[] = [];

  // Price line from 1m klines: one price-only column per second, priced at the minute close.
  const klines: { time: number; close: number }[] = [];
  if (source === 'binance') {
    const data = await fetchJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${from}&limit=60`);
    if (Array.isArray(data)) for (const k of data) klines.push({ time: Number(k[0]), close: Number(k[4]) });
  } else {
    const data = await fetchJson(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=1&start=${from}&limit=60`);
    const list = data?.result?.list;
    if (Array.isArray(list)) for (const k of list) klines.push({ time: Number(k[0]), close: Number(k[4]) });
    klines.sort((a, b) => a.time - b.time);
  }

  // Trade bubbles from recent aggregate trades.
  const trades: RawTrade[] = [];
  if (source === 'binance') {
    let start = from;
    for (let i = 0; i < 10; i++) { // maximum 10 requests
      const data = await fetchJson(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&startTime=${start}&endTime=${now}&limit=1000`);
      if (!Array.isArray(data) || !data.length) break;
      for (const t of data) trades.push({ time: Number(t.T), price: Number(t.p), size: Number(t.q), side: t.m ? 'Sell' : 'Buy', count: Math.max(1, Number(t.l) - Number(t.f) + 1) || 1 });
      const lastT = Number(data[data.length - 1].T);
      if (data.length < 1000 || lastT >= now - 1000) break;
      start = lastT + 1;
    }
  } else {
    const data = await fetchJson(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${symbol}&limit=1000`);
    const list = data?.result?.list;
    if (Array.isArray(list)) for (const t of list) trades.push({ time: Number(t.time), price: Number(t.price), size: Number(t.size), side: t.side === 'Sell' ? 'Sell' : 'Buy' });
  }

  // Bucket trades per second.
  const tradesBySec = new Map<number, Map<number, HeatTrade>>();
  for (const t of trades) {
    if (t.time < from) continue;
    const sec = Math.floor(t.time / COLUMN_MS) * COLUMN_MS;
    let m = tradesBySec.get(sec);
    if (!m) { m = new Map(); tradesBySec.set(sec, m); }
    const bi = buffer.index(t.price);
    const agg = m.get(bi) ?? { buy: 0, sell: 0 };
    const notional = t.price * t.size;
    const total = agg.buy + agg.sell;
    agg.price = ((agg.price ?? t.price) * total + t.price * notional) / (total + notional);
    agg.count = (agg.count ?? 0) + (t.count ?? 1);
    if (t.side === 'Sell') { agg.sell += notional; agg.sellCoin = (agg.sellCoin ?? 0) + t.size; }
    else { agg.buy += notional; agg.buyCoin = (agg.buyCoin ?? 0) + t.size; }
    m.set(bi, agg);
  }

  // One price-only column per second for minutes covered by the klines.
  for (const kl of klines) {
    if (kl.time < from) continue;
    for (let s = 0; s < 60; s++) {
      const t = kl.time + s * COLUMN_MS;
      if (t >= now) break;
      const origin = buffer.index(kl.close) - 512;
      columns.push({ time: t, origin, data: new Float32Array(0) as unknown as Float32Array, trades: tradesBySec.get(t) ?? new Map(), price: kl.close, gap: false, priceOnly: true });
    }
  }
  // Trades outside kline coverage still get a column so bubbles show.
  for (const [sec, m] of tradesBySec) {
    if (columns.some(c => c.time === sec)) continue;
    let price = 0;
    for (const t of trades) if (Math.floor(t.time / COLUMN_MS) * COLUMN_MS === sec) { price = t.price; break; }
    if (!price) continue;
    columns.push({ time: sec, origin: buffer.index(price) - 512, data: new Float32Array(0) as unknown as Float32Array, trades: m, price, gap: false, priceOnly: true });
  }
  buffer.merge(columns);
}

// Write every buffer to IndexedDB. Called on a 10 second interval by the Heatmap view.
export function persistHeatmaps() {
  for (const [k, entry] of entries) if (entry.calibrated) void saveHeatmapBuffer(k, entry.buffer.bucket, entry.buffer.columns, true, entry.depthSpan);
}

export function heatmapColumns(source: HeatSource, symbol: string): readonly Column[] {
  return entries.get(key(source, symbol))?.buffer.columns ?? [];
}
