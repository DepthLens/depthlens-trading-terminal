// Browser-safe footprint aggregation: 1m buckets of bid/ask volume on a fixed tick grid.
export type Cell = { bid: number; ask: number };
export type Segment = [number, number];
export type FootprintStore = { tick: number; minutes: Map<number, Map<number, Cell>>; segments: Segment[]; liveFrom: number | null; dirty: boolean; restored: boolean };
export type FootprintMode = 'bidask' | 'delta' | 'volume';
export type FootprintSettings = { mode: FootprintMode; grouping: 'Auto' | number; imbalance: boolean; ratio: number; totals: boolean; poc: boolean; opacity: number };
export const FOOTPRINT_KEY = 'depthlens.footprint.v1';
export const FOOTPRINT_DEFAULT: FootprintSettings = { mode: 'bidask', grouping: 'Auto', imbalance: true, ratio: 300, totals: true, poc: true, opacity: .8 };
export const GROUPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000] as const;
export const DAY = 86400000;

export function restoreFootprintSettings(raw: string | null): FootprintSettings {
  try {
    const d = JSON.parse(raw ?? 'null') ?? {};
    return {
      mode: ['bidask', 'delta', 'volume'].includes(d.mode) ? d.mode : FOOTPRINT_DEFAULT.mode,
      grouping: (GROUPS as readonly number[]).includes(d.grouping) ? d.grouping : 'Auto',
      imbalance: d.imbalance !== false,
      ratio: Number.isFinite(d.ratio) ? Math.max(150, Math.min(500, d.ratio)) : 300,
      totals: d.totals !== false, poc: d.poc !== false,
      opacity: Number.isFinite(d.opacity) ? Math.max(.1, Math.min(1, d.opacity)) : FOOTPRINT_DEFAULT.opacity,
    };
  } catch { return { ...FOOTPRINT_DEFAULT }; }
}

export const createStore = (tick: number): FootprintStore => ({ tick, minutes: new Map(), segments: [], liveFrom: null, dirty: false, restored: false });
/** Row k covers [k*tick, (k+1)*tick); boundaries never depend on the screen. */
export const rowOf = (price: number, tick: number) => Math.floor(price / tick + 1e-6);

export function addTrade(store: FootprintStore, time: number, price: number, size: number, sellAggressor: boolean) {
  if (!(size > 0) || !(price > 0) || !Number.isFinite(time)) return;
  const minute = Math.floor(time / 60000) * 60000, row = rowOf(price, store.tick);
  let rows = store.minutes.get(minute);
  if (!rows) { rows = new Map(); store.minutes.set(minute, rows); }
  let cell = rows.get(row);
  if (!cell) { cell = { bid: 0, ask: 0 }; rows.set(row, cell); }
  if (sellAggressor) cell.bid += size; else cell.ask += size;
  store.dirty = true;
}
export function addLiveTrade(store: FootprintStore, time: number, price: number, size: number, sell: boolean) {
  addTrade(store, time, price, size, sell);
  if (store.liveFrom === null) { store.liveFrom = time; store.segments = mergeSegments([...store.segments, [time, time]]); }
  const last = store.segments.find(s => s[0] <= store.liveFrom! && s[1] >= store.liveFrom!);
  if (last && time > last[1]) last[1] = time;
}
export function mergeSegments(list: Segment[]): Segment[] {
  const sorted = list.filter(s => s[1] >= s[0]).map(s => [s[0], s[1]] as Segment).sort((a, b) => a[0] - b[0]);
  const out: Segment[] = [];
  for (const s of sorted) { const last = out.at(-1); if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1]); else out.push(s); }
  return out;
}
export function addSegment(store: FootprintStore, from: number, to: number) { store.segments = mergeSegments([...store.segments, [from, to]]); store.dirty = true; }
export const isCovered = (store: FootprintStore, time: number) => store.segments.some(s => time >= s[0] && time <= s[1]);
/** Latest uncovered gap inside [from, to), or null when fully covered. */
export function lastGap(store: FootprintStore, from: number, to: number): Segment | null {
  let cursor = to;
  for (const s of [...store.segments].sort((a, b) => b[1] - a[1])) {
    if (s[0] >= cursor) continue;
    if (s[1] < cursor - 1) { const a = Math.max(from, s[1] + 1); return a < cursor ? [a, cursor] : null; }
    cursor = s[0];
    if (cursor <= from) return null;
  }
  return cursor > from ? [from, cursor] : null;
}
export function prune(store: FootprintStore, now: number) {
  const cut = now - DAY;
  for (const m of store.minutes.keys()) if (m < cut - 60000) store.minutes.delete(m);
  store.segments = store.segments.filter(s => s[1] >= cut).map(s => [Math.max(s[0], cut), s[1]] as Segment);
}
export function coverage(store: FootprintStore, start: number, end: number): 'none' | 'partial' | 'full' {
  let covered = 0;
  for (const [a, b] of store.segments) covered += Math.max(0, Math.min(b, end - 1) - Math.max(a, start));
  if (covered <= 0) return 'none';
  return covered >= end - 1 - start - 1000 ? 'full' : 'partial';
}
export const since = (store: FootprintStore) => store.segments[0]?.[0] ?? null;

export type FootprintRow = { row: number; low: number; high: number; bid: number; ask: number; askImb: boolean; bidImb: boolean };
export type FootprintCandle = { start: number; rows: FootprintRow[]; bid: number; ask: number; poc: number | null; peak: number; coverage: 'none' | 'partial' | 'full' };
/** Sums 1m buckets into one candle; grouping merges g base rows on the same fixed grid. */
export function buildCandle(store: FootprintStore, start: number, minutes: number, group: number, ratio: number): FootprintCandle {
  const end = start + minutes * 60000, merged = new Map<number, Cell>();
  for (let m = start; m < end; m += 60000) {
    const rows = store.minutes.get(m); if (!rows) continue;
    for (const [k, c] of rows) { const g = Math.floor(k / group); const t = merged.get(g); if (t) { t.bid += c.bid; t.ask += c.ask; } else merged.set(g, { bid: c.bid, ask: c.ask }); }
  }
  const size = store.tick * group, keys = [...merged.keys()].sort((a, b) => a - b);
  let bid = 0, ask = 0, poc: number | null = null, peak = 0;
  const rows: FootprintRow[] = keys.map(k => {
    const c = merged.get(k)!; bid += c.bid; ask += c.ask;
    const below = merged.get(k - 1), above = merged.get(k + 1), r = ratio / 100;
    if (c.bid + c.ask > peak) { peak = c.bid + c.ask; poc = k; }
    return { row: k, low: k * size, high: (k + 1) * size, bid: c.bid, ask: c.ask, askImb: !!below && below.bid > 0 && c.ask >= r * below.bid, bidImb: !!above && above.ask > 0 && c.bid >= r * above.ask };
  });
  return { start, rows, bid, ask, poc, peak, coverage: coverage(store, start, end) };
}
/** Smallest grouping whose row is at least minPx tall at the current zoom. */
export function autoGroup(tick: number, pxPerPrice: number, minPx: number) {
  return GROUPS.find(g => g * tick * pxPerPrice >= minPx) ?? GROUPS[GROUPS.length - 1]!;
}
export function formatVolume(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(3);
}
