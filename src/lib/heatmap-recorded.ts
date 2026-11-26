// Recorded BTCUSDT order book history (Binance USD-M) saved by the backend recorder every 5 seconds.
// Read-only history fills short-window gaps and extends the 60-minute live buffer.
import { ROWS, type Column, type HeatTrade } from './heatmap-data';

// Volumes are coin quantities; fifth entry is the exchange second offset within the 5s interval.
export type RecordedSnapshot = { ts: string; source: string; mid: number; step: number; base: number; bids: number[]; asks: number[]; trade_levels?: [number, number, number, number, number][]; high?: number | null; low?: number | null; close?: number | null; price_points?: [number, number][] };
export const RECORDED_SYMBOL = 'BTCUSDT';
export const LONG_WINDOWS = [240, 1440, 10080] as const; // 4h, 24h, 7d
const MAX_COLS = 2880;

// Seconds between columns so a window never needs more than MAX_COLS columns (min 5s, the recording rate).
export function recordedEvery(windowMin: number): number {
  return Math.max(5, Math.ceil((windowMin * 60) / MAX_COLS));
}

// Re-bin a 150-row snapshot (USDT notional per row) into the heatmap's own bucket grid.
export function snapshotToColumn(s: RecordedSnapshot, bucket: number, second?: number): Column {
  const origin = Math.floor(s.mid / bucket) - ROWS / 2;
  const data = new Float32Array(ROWS);
  const n = Math.min(s.bids.length, s.asks.length);
  for (let i = 0; i < n; i++) {
    const v = (s.bids[i] ?? 0) + (s.asks[i] ?? 0);
    if (!(v > 0)) continue;
    const t = Math.floor((s.base + (i + 0.5) * s.step) / bucket) - origin;
    if (t >= 0 && t < ROWS) data[t] = (data[t] ?? 0) + v;
  }
  const trades = new Map<number, HeatTrade>();
  for (const [price, buy, sell, count, sec] of s.trade_levels ?? []) {
    if (second !== undefined && sec !== second) continue;
    const key = Math.floor(price / bucket), hit = trades.get(key) ?? { buy: 0, sell: 0, count: 0, buyCoin: 0, sellCoin: 0 };
    const old = hit.buy + hit.sell, added = price * (buy + sell);
    hit.price = old + added > 0 ? ((hit.price ?? price) * old + price * added) / (old + added) : price;
    hit.buy += buy * price; hit.sell += sell * price; hit.count = (hit.count ?? 0) + count;
    hit.buyCoin = (hit.buyCoin ?? 0) + buy; hit.sellCoin = (hit.sellCoin ?? 0) + sell;
    trades.set(key, hit);
  }
  // Responses may split the same second: last arrival owns that second's closing price.
  const points = new Map(s.price_points ?? []);
  const path = [...points].sort((a, b) => a[0] - b[0]).filter(([sec]) => second === undefined || sec <= second).map(([, price]) => price);
  const price = path.at(-1) ?? (s.close === null || s.close === undefined ? s.mid : second === undefined ? s.close : NaN);
  return { time: Date.parse(s.ts) + (second ?? 0) * 1000, origin, data, trades, price, gap: false, ...(n === 0 ? { priceOnly: true } : {}), ...(second === undefined && path.length ? { pricePath: path } : {}) };
}

export function snapshotsToColumns(rows: readonly RecordedSnapshot[], bucket: number, every = 5): Column[] {
  return rows.flatMap(row => every <= 5 && (row.trade_levels?.length || row.price_points?.length)
    ? Array.from({ length: 5 }, (_, second) => snapshotToColumn(row, bucket, second))
    : [snapshotToColumn(row, bucket)]);
}

// Thin columns to one per `everySec` slot (keeps the first in each slot).
export function thinColumns(cols: readonly Column[], everySec: number): Column[] {
  const out: Column[] = []; let last = -1;
  for (const c of cols) { const slot = Math.floor(c.time / 1000 / everySec); if (slot !== last) { out.push(c); last = slot; } }
  return out;
}

const cache = new Map<string, { at: number; rows: RecordedSnapshot[] }>();
// Fetch recorded snapshots older than `before`, thinned on the server. Cached for 60 seconds.
export async function loadRecorded(windowMin: number, before: number): Promise<RecordedSnapshot[]> {
  const every = recordedEvery(windowMin);
  const { supabase } = await import('@/integrations/supabase/client');
  // Wait for persisted auth to hydrate before asking an authenticated-only RPC.
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError) throw new Error(authError.message);
  if (!auth.session) throw new Error('Sign in to read recorded history');
  const k = `${auth.session.user.id}:${windowMin}:${Math.floor(before / 60000)}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 60000) return hit.rows;
  const from = new Date(Date.now() - windowMin * 60000).toISOString(), to = new Date(before).toISOString();
  const rows: RecordedSnapshot[] = [];
  for (let off = 0; off < MAX_COLS + 1000; off += 1000) {
    const { data, error } = await supabase.rpc('ob_history', { p_from: from, p_to: to, p_every: every }).range(off, off + 999);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('History returned no response');
    rows.push(...(data as RecordedSnapshot[]));
    if (data.length < 1000) break;
  }
  for (const [key, value] of cache) if (Date.now() - value.at >= 60000) cache.delete(key);
  if (rows.length) cache.set(k, { at: Date.now(), rows });
  return rows;
}

export type RecorderStatus = { last: string | null; lastHour: number; gaps: number; maxGapSec: number; lastSource: string | null };
export async function loadRecorderStatus(): Promise<RecorderStatus | null> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError) throw new Error(authError.message);
  if (!auth.session) throw new Error('Sign in to read recorder status');
  const { data, error } = await supabase.rpc('ob_recorder_status');
  if (error) throw new Error(error.message);
  return data as RecorderStatus | null;
}

export function historyRange(rows: readonly RecordedSnapshot[]): { from: number; to: number; count: number } | null {
  const times = rows.map(row => Date.parse(row.ts)).filter(Number.isFinite);
  return times.length ? { from: Math.min(...times), to: Math.max(...times), count: times.length } : null;
}

// Fill the holes of a short (≤60 min) live window with recorded snapshots, one column per second.
// Live order book columns always win; a recorded snapshot only covers seconds where the live buffer has
// a gap, price-only backfill, or nothing at all (no live book column within 2 s). Trades and price from
// the live column are kept so bubbles and the price line stay real.
export function fillGaps(live: readonly Column[], recorded: readonly Column[], fromMs: number, toMs: number): { cols: Column[]; filled: number } {
  const bySec = new Map<number, Column>();
  for (const c of live) if (c.time >= fromMs && c.time <= toMs) bySec.set(Math.floor(c.time / 1000), c);
  const isBook = (c: Column | undefined) => !!c && !c.gap && !c.priceOnly;
  const rec = recorded.filter(c => Number.isFinite(c.time)).sort((a, b) => a.time - b.time);
  const out: Column[] = [];
  let j = -1, filled = 0;
  for (let s = Math.floor(fromMs / 1000); s <= Math.floor(toMs / 1000); s++) {
    const own = bySec.get(s);
    if (own && isBook(own)) { out.push(own); continue; }
    if (!own && (isBook(bySec.get(s - 1)) || isBook(bySec.get(s + 1)) || isBook(bySec.get(s - 2)) || isBook(bySec.get(s + 2)))) continue;
    while (j + 1 < rec.length) { const next = rec[j + 1]; if (!next || next.time > s * 1000) break; j++; }
    const hit = j >= 0 ? rec[j] : undefined;
    if (hit && s * 1000 - hit.time < 10000) {
      const exact = Math.floor(hit.time / 1000) === s;
      out.push({ ...hit, time: s * 1000, trades: own?.trades.size ? own.trades : exact ? hit.trades : new Map(), price: own && Number.isFinite(own.price) ? own.price : hit.price, gap: false, priceOnly: hit.priceOnly ?? false });
      filled++;
      continue;
    }
    if (own) out.push(own);
  }
  return { cols: out, filled };
}

// ---- Time navigation (paged history) ----
// The backend cleanup job deletes snapshots older than 7 days.
export const RECORDED_RETENTION_MS = 7 * 86400000;
export const RECORDED_PAGE_ROWS = 1000;
// Server thinning used while browsing back: 5s (the recording rate) up to 60 min windows, else the long-window rate.
export const pageEvery = (windowMin: number) => windowMin <= 60 ? 5 : recordedEvery(windowMin);
export const pageSpanMs = (every: number) => every * 1000 * RECORDED_PAGE_ROWS;

// Fixed time pages so going back and forth reuses the same cache keys. Closed pages are kept (LRU, 160 pages);
// pages touching the last minute expire after 30 seconds. Failures are never cached.
const pages = new Map<string, { at: number; closed: boolean; rows: RecordedSnapshot[] }>();
const inflight = new Map<string, Promise<RecordedSnapshot[]>>();
let pageUser: string | null = null;
const pageKey = (every: number, page: number) => `${every}:${page}`;
export function peekRecordedPage(every: number, page: number, now = Date.now()): RecordedSnapshot[] | null {
  const hit = pages.get(pageKey(every, page));
  if (!hit) return null;
  if (!hit.closed && now - hit.at >= 30000) return null;
  pages.delete(pageKey(every, page)); pages.set(pageKey(every, page), hit); // refresh LRU order
  return hit.rows;
}
export function loadRecordedPage(every: number, page: number): Promise<RecordedSnapshot[]> {
  const k = pageKey(every, page);
  const running = inflight.get(k);
  if (running) return running;
  const job = (async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError) throw new Error(authError.message);
    if (!auth.session) throw new Error('Sign in to read recorded history');
    if (pageUser !== auth.session.user.id) { pages.clear(); pageUser = auth.session.user.id; }
    const span = pageSpanMs(every), from = page * span, to = from + span;
    const { data, error } = await supabase.rpc('ob_history', { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_every: every }).range(0, RECORDED_PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('History returned no response');
    const rows = data as RecordedSnapshot[];
    pages.set(k, { at: Date.now(), closed: to < Date.now() - 60000, rows });
    while (pages.size > 160) { const oldest = pages.keys().next().value; if (oldest === undefined) break; pages.delete(oldest); }
    return rows;
  })().finally(() => inflight.delete(k));
  inflight.set(k, job);
  return job;
}
export function clearRecordedPages() { pages.clear(); inflight.clear(); pageUser = null; }

// A time-linear grid of columns for a past range: one slot per `stepSec`. Live book columns win, then
// recorded snapshots, then live price-only/gap columns. Slots with nothing stay `empty` (drawn blank,
// labelled "No data recorded") so missing time is never filled with made-up liquidity.
export function buildNavColumns(live: readonly Column[], recorded: readonly Column[], fromMs: number, toMs: number, stepSec: number): Column[] {
  const step = Math.max(1, Math.round(stepSec)) * 1000;
  const start = Math.floor(fromMs / step) * step, slots = Math.max(0, Math.ceil((toMs - start) / step));
  const isBook = (c: Column | undefined) => !!c && !c.gap && !c.priceOnly && !c.empty;
  const inRange = live.filter(c => c.time >= start && c.time < start + slots * step);
  const base = step === 1000 ? fillGaps(inRange, recorded, start, start + slots * step - 1).cols : [];
  const bySlot = new Map<number, Column>();
  const put = (c: Column, rank: number, ranks: Map<number, number>) => {
    const s = Math.floor((c.time - start) / step);
    if (s < 0 || s >= slots) return;
    const r = ranks.get(s);
    if (r !== undefined && r <= rank) return;
    ranks.set(s, rank); bySlot.set(s, c);
  };
  const ranks = new Map<number, number>();
  if (step === 1000) for (const c of base) put(c, isBook(c) ? 0 : 2, ranks);
  else {
    for (const c of inRange) put(c, isBook(c) ? 0 : 2, ranks);
    for (const c of recorded) put(c, 1, ranks);
  }
  const out: Column[] = [];
  for (let s = 0; s < slots; s++) {
    const time = start + s * step, c = bySlot.get(s);
    out.push(c ? { ...c, time } : { time, origin: 0, data: new Float32Array(0), trades: new Map(), price: NaN, gap: false, empty: true });
  }
  // One-second holes right next to live book columns are sampling jitter, not missing history.
  if (step === 1000) for (let s = 1; s < out.length; s++) {
    const cur = out[s], prev = out[s - 1];
    if (cur?.empty && prev && isBook(prev) && (isBook(out[s + 1]) || isBook(out[s + 2]))) out[s] = { ...prev, time: cur.time, trades: new Map() };
  }
  return out;
}
