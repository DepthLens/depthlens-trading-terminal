// Recorded BTCUSDT footprint: per-minute buy/sell totals per price bin summed on the server from the recorded
// trades (read-only ob_footprint). Pages are fixed UTC time spans so scrolling reuses the same cache keys;
// closed pages stay in a small LRU, the open page refreshes every 20 s, and failures are never cached.
// Live trades are added only at/after the newest recorded second, so recorded and live never overlap.
import { finishCandle, type Cell, type FootprintCandle } from './footprint-data';

export const RECORDED_FOOTPRINT_SYMBOL = 'BTCUSDT';
export const isRecordedFootprint = (symbol: string) => symbol === RECORDED_FOOTPRINT_SYMBOL;
const HOUR = 3600000;
export const MAX_PAGES = 36;
const OPEN_REFRESH_MS = 20000;

/** Server bin size in ticks for a timeframe; every row grouping is rounded up to a multiple of it. */
export function baseTicks(minutes: number) {
  if (minutes <= 1) return 5;
  if (minutes <= 5) return 10;
  if (minutes <= 15) return 20;
  if (minutes <= 30) return 25;
  if (minutes <= 60) return 50;
  if (minutes <= 240) return 100;
  return 250;
}
export const effectiveGroup = (group: number, base: number) => Math.max(base, Math.ceil(Math.max(1, group) / base) * base);
/** Page span grows with the bin so a screen of candles needs only a few pages at any timeframe. */
export function pageSpan(binTicks: number) {
  if (binTicks <= 10) return HOUR;
  if (binTicks <= 20) return 2 * HOUR;
  if (binTicks <= 25) return 3 * HOUR;
  if (binTicks <= 50) return 6 * HOUR;
  return 24 * HOUR;
}

export type MinuteRows = [number, number, number][]; // [bin index, buy coin, sell coin]
export type FootprintPage = { from: number; to: number; at: number; closed: boolean; first: number | null; cutoff: number | null; minutes: Map<number, MinuteRows> };
export type RawFootprint = { first: string | null; cutoff: string | null; minutes: [number, MinuteRows][] };

export function parsePage(raw: RawFootprint, from: number, to: number, now = Date.now()): FootprintPage {
  const minutes = new Map<number, MinuteRows>();
  for (const [m, rows] of raw?.minutes ?? []) minutes.set(Number(m), rows.map(r => [Number(r[0]), Number(r[1]), Number(r[2])]));
  const time = (v: string | null) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
  return { from, to, at: now, closed: to < now - 60000, first: time(raw?.first ?? null), cutoff: time(raw?.cutoff ?? null), minutes };
}

const pages = new Map<string, FootprintPage>();
const inflight = new Map<string, Promise<FootprintPage>>();
let pageUser: string | null = null, version = 0, lastError: { at: number; message: string } | null = null;
const key = (bin: number, index: number) => `${bin}:${index}`;
export const recordedVersion = () => version;
export const recordedError = (now = Date.now()) => lastError && now - lastError.at < 15000 ? lastError.message : null;

export function peekPage(binTicks: number, index: number): FootprintPage | null {
  const k = key(binTicks, index), hit = pages.get(k);
  if (!hit) return null;
  pages.delete(k); pages.set(k, hit); // LRU order
  return hit;
}
export function putPage(binTicks: number, index: number, page: FootprintPage) {
  pages.set(key(binTicks, index), page); version++;
  while (pages.size > MAX_PAGES) { const oldest = pages.keys().next().value; if (oldest === undefined) break; pages.delete(oldest); }
}
export const pageCount = () => pages.size;
export function clearFootprintPages() { pages.clear(); inflight.clear(); pageUser = null; version++; candleCache.clear(); }

/** Fixed page indexes touching [from, to). */
export function pagesFor(from: number, to: number, binTicks: number): number[] {
  const span = pageSpan(binTicks), out: number[] = [];
  for (let i = Math.floor(from / span); i * span < to; i++) out.push(i);
  return out;
}
export const needsLoad = (page: FootprintPage | null, now = Date.now()) => !page || (!page.closed && now - page.at >= OPEN_REFRESH_MS);

export function loadPage(tick: number, binTicks: number, index: number): Promise<FootprintPage> {
  const k = key(binTicks, index), running = inflight.get(k);
  if (running) return running;
  const job = (async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError) throw new Error(authError.message);
    if (!auth.session) throw new Error('Sign in to read recorded trades');
    if (pageUser !== auth.session.user.id) { pages.clear(); candleCache.clear(); pageUser = auth.session.user.id; }
    const span = pageSpan(binTicks), from = index * span, to = from + span;
    const { data, error } = await supabase.rpc('ob_footprint' as never, { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_bin: tick * binTicks } as never);
    if (error) throw new Error((error as { message: string }).message);
    if (!data) throw new Error('Recorded footprint returned no response');
    const page = parsePage(data as RawFootprint, from, to);
    putPage(binTicks, index, page); lastError = null;
    return page;
  })().catch(e => { lastError = { at: Date.now(), message: e instanceof Error ? e.message : String(e) }; throw e; }).finally(() => inflight.delete(k));
  inflight.set(k, job);
  return job;
}
/** Load missing or stale pages, at most 3 in parallel; resolves true when anything new arrived. */
export async function ensurePages(tick: number, binTicks: number, indexes: number[]): Promise<boolean> {
  const todo = indexes.filter(i => needsLoad(peekPage(binTicks, i)) && !inflight.has(key(binTicks, i)));
  if (!todo.length || recordedError()) return false;
  let changed = false;
  for (let i = 0; i < todo.length; i += 3) {
    const results = await Promise.allSettled(todo.slice(i, i + 3).map(index => loadPage(tick, binTicks, index)));
    if (results.some(r => r.status === 'fulfilled')) changed = true;
    if (results.some(r => r.status === 'rejected')) break;
  }
  return changed;
}

let recordingStart: number | null = null, startLoadedAt = 0;
export const recordingStartMs = () => recordingStart;
export const setRecordingStart = (ms: number | null) => { recordingStart = ms; };
/** Oldest recorded time from ob_retention_stats, refreshed every 5 minutes. */
export async function ensureRecordingStart(): Promise<number | null> {
  if (Date.now() - startLoadedAt < 300000) return recordingStart;
  startLoadedAt = Date.now();
  try {
    const { loadRetentionStats } = await import('./heatmap-recorded');
    const stats = await loadRetentionStats();
    const t = stats?.first ? Date.parse(stats.first) : NaN;
    recordingStart = Number.isFinite(t) ? t : null;
  } catch { startLoadedAt = 0; }
  return recordingStart;
}

export type TailTrade = { time: number; price: number; size: number; sell: boolean };
export type RecordedCandleResult = { kind: 'before' } | { kind: 'loading' } | { kind: 'ok'; candle: FootprintCandle };
type BuildArgs = { start: number; minutes: number; tick: number; group: number; ratio: number; unit: 'coin' | 'USDT'; recStart: number | null; tail: { start: number | null; trades: readonly TailTrade[] }; now?: number };

/** Newest recorded second among loaded open pages (else any page); live trades fill from here on. */
export function liveCutoff(binTicks: number, now = Date.now()): number | null {
  let best: number | null = null;
  for (const [k, p] of pages) if (k.startsWith(`${binTicks}:`) && p.cutoff !== null && p.from <= now && (best === null || p.cutoff > best)) best = p.cutoff;
  return best;
}

// Closed, fully recorded candles are built once and cached (LRU); only the live candle rebuilds.
const candleCache = new Map<string, { version: number; candle: FootprintCandle }>();

export function recordedCandle(a: BuildArgs): RecordedCandleResult {
  const now = a.now ?? Date.now(), end = a.start + a.minutes * 60000, bin = baseTicks(a.minutes);
  if (a.recStart === null || end <= a.recStart) return { kind: 'before' };
  const group = effectiveGroup(a.group, bin), cutoff = liveCutoff(bin, now);
  const closed = cutoff !== null && end <= cutoff;
  const ck = `${a.start}|${a.minutes}|${group}|${a.ratio}|${a.unit}`;
  if (closed) { const hit = candleCache.get(ck); if (hit) { candleCache.delete(ck); candleCache.set(ck, hit); return { kind: 'ok', candle: hit.candle }; } }
  const from = Math.max(a.start, a.recStart), upto = Math.min(end, now);
  const merged = new Map<number, Cell>();
  for (const index of pagesFor(from, Math.max(from + 1, upto), bin)) {
    const page = peekPage(bin, index);
    if (!page) return { kind: 'loading' };
    for (let m = Math.max(a.start, page.from); m < Math.min(end, page.to); m += 60000) {
      const rows = page.minutes.get(m); if (!rows) continue;
      for (const [k, buy, sell] of rows) {
        const tk = k * bin, g = Math.floor(tk / group + 1e-9), price = (tk + bin / 2) * a.tick;
        const bid = a.unit === 'USDT' ? sell * price : sell, ask = a.unit === 'USDT' ? buy * price : buy;
        const t = merged.get(g); if (t) { t.bid += bid; t.ask += ask; } else merged.set(g, { bid, ask });
      }
    }
  }
  let liveCovered = true;
  if (!closed) {
    const liveFrom = Math.max(a.start, cutoff ?? a.start);
    liveCovered = a.tail.start !== null && a.tail.start <= liveFrom + 1000;
    for (const t of a.tail.trades) {
      if (t.time < liveFrom || t.time >= end) continue;
      const g = Math.floor(t.price / a.tick / group + 1e-6), v = a.unit === 'USDT' ? t.size * t.price : t.size;
      let c = merged.get(g); if (!c) { c = { bid: 0, ask: 0 }; merged.set(g, c); }
      if (t.sell) c.bid += v; else c.ask += v;
    }
  }
  const cov: FootprintCandle['coverage'] = merged.size === 0 ? 'none' : a.recStart <= a.start && liveCovered ? 'full' : 'partial';
  const candle = finishCandle(merged, a.tick * group, a.start, a.ratio, cov);
  if (closed) {
    candleCache.set(ck, { version, candle });
    while (candleCache.size > 1500) { const k = candleCache.keys().next().value; if (k === undefined) break; candleCache.delete(k); }
  }
  return { kind: 'ok', candle };
}
