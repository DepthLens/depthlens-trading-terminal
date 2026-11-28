// Browser-safe drawing rules: models, time/logical conversion, magnet snap, stats and storage.
// Drawings are anchored to { time (unix seconds), price } only; pixels are derived on every draw.
export type DrawKind = 'trend' | 'hray' | 'hline' | 'rect' | 'fib' | 'text' | 'long' | 'short';
export type ToolId = 'cursor' | 'eraser' | 'measure' | DrawKind;
export type Pt = { t: number; p: number };
export type Drawing = { id: string; kind: DrawKind; a: Pt; b?: Pt; c?: Pt; color: string; text?: string };
export type DrawPrefs = { magnet: boolean; hidden: boolean; locked: boolean };
export type Bar4 = { open: number; high: number; low: number; close: number };

export const DRAW_KINDS: readonly DrawKind[] = ['trend', 'hray', 'hline', 'rect', 'fib', 'text', 'long', 'short'];
export const ONE_POINT: readonly DrawKind[] = ['hray', 'hline', 'text'];
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const DRAW_COLORS = ['#2962FF', '#F5C518', '#22C55E', '#EF4444', '#E5E7EB'] as const;
export const DEFAULT_PREFS: DrawPrefs = { magnet: false, hidden: false, locked: false };

/** Fractional logical index of a time; times outside the loaded bars extrapolate by the bar step. */
export function timeToLogical(times: readonly number[], t: number, step: number): number {
  const n = times.length;
  if (!n) return 0;
  const first = times[0]!, last = times[n - 1]!;
  if (t <= first) return (t - first) / step;
  if (t >= last) return n - 1 + (t - last) / step;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid]! <= t) lo = mid; else hi = mid; }
  const a = times[lo]!, b = times[hi]!;
  return lo + (b === a ? 0 : (t - a) / (b - a));
}

export function logicalToTime(times: readonly number[], l: number, step: number): number {
  const n = times.length;
  if (!n) return 0;
  const first = times[0]!, last = times[n - 1]!;
  if (l <= 0) return first + l * step;
  if (l >= n - 1) return last + (l - (n - 1)) * step;
  const lo = Math.floor(l), a = times[lo]!, b = times[lo + 1] ?? a;
  return a + (l - lo) * (b - a);
}

/** Magnet: the nearest of the bar's open, high, low and close. */
export function snapPrice(bar: Bar4 | undefined, price: number): number {
  if (!bar) return price;
  let best = price, dist = Infinity;
  for (const v of [bar.open, bar.high, bar.low, bar.close]) { const d = Math.abs(v - price); if (d < dist) { dist = d; best = v; } }
  return best;
}

export function measureStats(a: Pt, b: Pt, minutes: number) {
  const delta = b.p - a.p;
  return { delta, pct: a.p ? (delta / a.p) * 100 : 0, bars: Math.round((b.t - a.t) / (minutes * 60)) };
}

/** Long/short position: entry a.p, target b.p, stop c.p. */
export function riskReward(entry: number, target: number, stop: number) {
  const reward = Math.abs(target - entry), risk = Math.abs(entry - stop);
  return { reward, risk, ratio: risk ? reward / risk : 0, targetPct: entry ? ((target - entry) / entry) * 100 : 0, stopPct: entry ? ((stop - entry) / entry) * 100 : 0 };
}

/** New positions start at 2:1 — the stop sits half the target distance on the losing side. */
export function defaultPosition(kind: 'long' | 'short', entry: number, dragged: number) {
  const dist = Math.abs(dragged - entry) || Math.abs(entry) * 0.005;
  return kind === 'long' ? { target: entry + dist, stop: entry - dist / 2 } : { target: entry - dist, stop: entry + dist / 2 };
}

export function fibPrice(a: Pt, b: Pt, level: number) { return b.p + (a.p - b.p) * level; }

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}

export function shiftPoint(times: readonly number[], step: number, pt: Pt, dl: number, dp: number): Pt {
  return { t: logicalToTime(times, timeToLogical(times, pt.t, step) + dl, step), p: pt.p + dp };
}

const isPt = (v: unknown): v is Pt => typeof v === 'object' && v !== null && Number.isFinite((v as Pt).t) && Number.isFinite((v as Pt).p);
export function validDrawing(v: unknown): v is Drawing {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Drawing;
  if (typeof d.id !== 'string' || !DRAW_KINDS.includes(d.kind) || !isPt(d.a) || typeof d.color !== 'string') return false;
  if (!ONE_POINT.includes(d.kind) && !isPt(d.b)) return false;
  if ((d.kind === 'long' || d.kind === 'short') && !isPt(d.c)) return false;
  return true;
}

export const drawingsKey = (symbol: string) => `depthlens-drawings-${symbol}`;
const PREFS_KEY = 'depthlens-drawing-prefs';
export function loadDrawings(symbol: string): Drawing[] {
  try { const raw = localStorage.getItem(drawingsKey(symbol)); const list: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list.filter(validDrawing) : []; } catch { return []; }
}
export function saveDrawings(symbol: string, list: Drawing[]) {
  try { if (list.length) localStorage.setItem(drawingsKey(symbol), JSON.stringify(list)); else localStorage.removeItem(drawingsKey(symbol)); } catch { /* storage full or blocked */ }
}
export function loadPrefs(): DrawPrefs {
  try { const raw = localStorage.getItem(PREFS_KEY); const v = raw ? JSON.parse(raw) as Partial<DrawPrefs> : {}; return { magnet: v.magnet === true, hidden: v.hidden === true, locked: v.locked === true }; } catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p: DrawPrefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
