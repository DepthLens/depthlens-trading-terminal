// Browser-safe Wall lines: large resting orders that persisted, with their live outcome.
// Pure rules over heatmap columns, so live and recorded history are judged identically.
import { percentile, type Column } from './heatmap-data';

export type WallStatus = 'active' | 'held' | 'pulled' | 'broken';
export type WallSide = 'bid' | 'ask';
export type Wall = { index: number; price: number; side: WallSide; start: number; lastSeen: number; size: number; peak: number; status: WallStatus; touched: boolean; endedAt: number | null };
export type WallSettings = { on: boolean; percentile: number; minMs: number; fadeMs: number; showPulled: boolean; showBroken: boolean };

export const WALL_PERCENTILES = [0.5, 1, 2] as const; // top % of visible resting sizes
export const WALL_MIN_TIMES = [30000, 120000, 300000] as const;
export const WALL_FADES = [900000, 3600000, 14400000] as const;
export const DEFAULT_WALLS: WallSettings = { on: true, percentile: 1, minMs: 120000, fadeMs: 3600000, showPulled: true, showBroken: true };
export const HEATMAP_WALLS_KEY = 'depthlens.heatmap.walls';
export const WALL_INFO = 'Walls show where large orders are resting. They can be pulled or broken; they are context, not signals.';
const HELD_AWAY_BUCKETS = 3;

export function restoreWallSettings(raw: string | null): WallSettings {
  try {
    const v = raw ? JSON.parse(raw) as Partial<WallSettings> : {};
    const pick = <T extends number>(list: readonly T[], x: unknown, d: T) => (list as readonly number[]).includes(x as number) ? x as T : d;
    return {
      on: typeof v.on === 'boolean' ? v.on : DEFAULT_WALLS.on,
      percentile: pick(WALL_PERCENTILES, v.percentile, 1),
      minMs: pick(WALL_MIN_TIMES, v.minMs, 120000),
      fadeMs: pick(WALL_FADES, v.fadeMs, 3600000),
      showPulled: typeof v.showPulled === 'boolean' ? v.showPulled : true,
      showBroken: typeof v.showBroken === 'boolean' ? v.showBroken : true,
    };
  } catch { return { ...DEFAULT_WALLS }; }
}

const usable = (c: Column) => !c.gap && !c.empty && !c.priceOnly && c.data.length > 0;
const cellOf = (c: Column, i: number) => { const k = i - c.origin; return k >= 0 && k < c.data.length ? (c.data[k] ?? 0) : 0; };

// Lowest/highest traded price inside one column (price path, last price and trade prices).
function extremes(c: Column): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const take = (p: number | undefined) => { if (p !== undefined && Number.isFinite(p)) { lo = Math.min(lo, p); hi = Math.max(hi, p); } };
  take(c.price); for (const p of c.pricePath ?? []) take(p); for (const t of c.trades.values()) if (t.buy + t.sell > 0) take(t.price);
  return [lo, hi];
}

// Size threshold: the top `pct`% of non-empty resting sizes in rows lo..hi, sampled over up to 120 columns.
export function wallThreshold(cols: readonly Column[], lo: number, hi: number, pct: number): number {
  const book = cols.filter(usable), values: number[] = [];
  const every = Math.max(1, Math.floor(book.length / 120));
  for (let ci = 0; ci < book.length; ci += every) { const c = book[ci]!; for (let i = lo; i <= hi; i++) { const v = cellOf(c, i); if (v > 0) values.push(v); } }
  return values.length ? percentile(values, 100 - pct) : 0;
}

// Walk columns oldest → newest: confirm walls after minMs of continuous presence, then track Held / Pulled / Broken.
export function detectWalls(cols: readonly Column[], bucket: number, lo: number, hi: number, s: WallSettings, now: number): { walls: Wall[]; threshold: number } {
  const book = cols.filter(usable);
  if (book.length < 2 || !(bucket > 0) || hi < lo) return { walls: [], threshold: 0 };
  const threshold = wallThreshold(book, lo, hi, s.percentile);
  if (!(threshold > 0)) return { walls: [], threshold: 0 };
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(book.length, 60); i++) diffs.push(book[i]!.time - book[i - 1]!.time);
  const tol = Math.max(5000, percentile(diffs, 50) * 2.5), release = threshold * 0.5;
  const candidates = new Map<number, { start: number; lastSeen: number; side: WallSide }>();
  const live = new Map<number, Wall>(), done: Wall[] = [];
  let prevTime = -Infinity, lastPrice = NaN;
  const finish = (w: Wall, status: WallStatus, at: number) => { w.status = status; w.endedAt = at; live.delete(w.index); done.push(w); };
  for (const c of book) {
    const t = c.time;
    if (t - prevTime > tol) { candidates.clear(); for (const w of [...live.values()]) finish(w, w.status, w.lastSeen); }
    prevTime = t;
    if (Number.isFinite(c.price)) lastPrice = c.price;
    if (!Number.isFinite(lastPrice)) continue;
    const [low, high] = extremes(c), traded = Number.isFinite(low);
    for (const w of [...live.values()]) {
      const lowEdge = w.index * bucket, highEdge = lowEdge + bucket, v = cellOf(c, w.index);
      if (traded && (w.side === 'bid' ? low < lowEdge : high > highEdge)) { finish(w, 'broken', t); continue; }
      const touching = traded && (w.side === 'bid' ? low <= highEdge : high >= lowEdge);
      if (touching) w.touched = true;
      if (v >= release) { w.lastSeen = t; w.size = v; w.peak = Math.max(w.peak, v); }
      else if (t - w.lastSeen > tol) {
        const near = w.side === 'bid' ? lastPrice - highEdge <= bucket : lowEdge - lastPrice <= bucket;
        if (near) finish(w, 'broken', t); // absorbed at the touch
        else if (!w.touched) finish(w, 'pulled', t);
        else finish(w, w.status, w.lastSeen);
        continue;
      }
      if (w.touched && w.status === 'active' && traded) {
        const away = w.side === 'bid' ? low - highEdge : lowEdge - high;
        if (away >= HELD_AWAY_BUCKETS * bucket) w.status = 'held';
      }
    }
    const priceIndex = Math.floor(lastPrice / bucket);
    for (let i = lo; i <= hi; i++) {
      if (i === priceIndex || live.has(i)) continue;
      const v = cellOf(c, i);
      if (v < threshold) continue;
      const side: WallSide = i < priceIndex ? 'bid' : 'ask';
      let cand = candidates.get(i);
      if (cand && t - cand.lastSeen <= tol && cand.side === side) cand.lastSeen = t;
      else { cand = { start: t, lastSeen: t, side }; candidates.set(i, cand); }
      if (t - cand.start >= s.minMs) {
        candidates.delete(i);
        live.set(i, { index: i, price: (i + 0.5) * bucket, side, start: cand.start, lastSeen: t, size: v, peak: v, status: 'active', touched: false, endedAt: null });
      }
    }
    for (const [i, cand] of candidates) if (t - cand.lastSeen > tol) candidates.delete(i);
  }
  return { walls: [...done.filter(w => now - (w.endedAt ?? now) <= s.fadeMs), ...live.values()], threshold };
}

// 0..1 opacity: active walls stay solid; ended walls fade out across the fade time.
export function wallAlpha(w: Wall, now: number, fadeMs: number): number {
  if (w.endedAt === null) return 1;
  const left = 1 - (now - w.endedAt) / fadeMs;
  return Math.max(0, Math.min(1, left)) * (w.status === 'pulled' ? 0.55 : 0.85);
}

export function wallAge(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function wallWidth(size: number, threshold: number): number {
  return Math.round(1 + Math.min(3, Math.max(0, Math.log2(size / Math.max(1e-9, threshold)))));
}

export const WALL_STATUS_LABEL: Record<WallStatus, string> = { active: '', held: 'Held', pulled: 'Pulled', broken: 'Broken' };
