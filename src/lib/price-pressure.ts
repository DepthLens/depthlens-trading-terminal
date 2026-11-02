import { anchorBucket, CVD_ANCHORS, type CvdAnchor } from './cvd-data';
import type { Bar } from './chart-data';

// Price Pressure: OHLC-only candle-structure indicator. Browser-safe, no sockets, no volume.
export const PP_KEY = 'depthlens.pressure.v1';
export const PP_WEIGHTS = { body: 0.4, close: 0.35, wick: 0.25 } as const;
export const PP_ATR_PERIOD = 14, PP_ATR_WARMUP = 5, PP_ACTIVITY_MIN = 0.25, PP_ACTIVITY_MAX = 3;
export const PP_PAGE_LIMIT = 6;
export const PP_TABS = ['Both', 'Pressure', 'Balance', 'Up', 'Down', 'Ratio', 'Candles'] as const;
export type PpTab = typeof PP_TABS[number];
export type PpPane = 'pressure' | 'balance' | 'up' | 'down' | 'ratio' | 'candles';
export type PpWeights = { body: number; close: number; wick: number };
export type PpSettings = { anchor: CvdAnchor; lookback: number; threshold: number; weights: PpWeights; atr: number; markers: boolean; tab: PpTab; heights: (number | null)[]; collapsed: boolean[] };
export const PP_DEFAULT: PpSettings = { anchor: 'Daily UTC', lookback: 20, threshold: 0.25, weights: { ...PP_WEIGHTS }, atr: PP_ATR_PERIOD, markers: false, tab: 'Both', heights: [null, null], collapsed: [false, false] };

const num = (v: unknown, d: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
export function restorePressure(raw: string | null): PpSettings {
  try {
    const v = JSON.parse(raw ?? '{}') ?? {};
    const w = v.weights ?? {};
    const h = Array.isArray(v.heights) ? v.heights : [];
    const c = Array.isArray(v.collapsed) ? v.collapsed : [];
    return {
      anchor: CVD_ANCHORS.includes(v.anchor) ? v.anchor : PP_DEFAULT.anchor,
      lookback: Math.round(num(v.lookback, 20, 2, 500)),
      threshold: num(v.threshold, 0.25, 0.01, 3),
      weights: { body: num(w.body, PP_WEIGHTS.body, 0, 1), close: num(w.close, PP_WEIGHTS.close, 0, 1), wick: num(w.wick, PP_WEIGHTS.wick, 0, 1) },
      atr: Math.round(num(v.atr, PP_ATR_PERIOD, 2, 200)),
      markers: v.markers === true,
      tab: PP_TABS.includes(v.tab) ? v.tab : 'Both',
      heights: [0, 1].map(i => typeof h[i] === 'number' && Number.isFinite(h[i]) ? Math.max(0.05, Math.min(0.55, h[i])) : null),
      collapsed: [0, 1].map(i => c[i] === true),
    };
  } catch { return { ...PP_DEFAULT, weights: { ...PP_WEIGHTS }, heights: [null, null], collapsed: [false, false] }; }
}

export type PpScores = { range: number; body: number; close: number; wick: number; activity: number; pressure: number; upperWick: number; lowerWick: number; up: number; down: number; delta: number; direction: number };
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const trueRange = (b: Bar, prevClose?: number) => prevClose === undefined ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
/** Simple average true range of the closed candles before index i; null during warm-up (< 5 previous). */
export function atrBefore(bars: Bar[], i: number, period = PP_ATR_PERIOD): number | null {
  const from = Math.max(0, i - period);
  if (i - from < PP_ATR_WARMUP) return null;
  let sum = 0;
  for (let k = from; k < i; k++) sum += trueRange(bars[k]!, k > 0 ? bars[k - 1]!.close : undefined);
  return sum / (i - from);
}
export function activity(range: number, atr: number | null) { return atr === null || !(atr > 0) ? 1 : clamp(range / atr, PP_ACTIVITY_MIN, PP_ACTIVITY_MAX); }
export function scoreBar(b: Bar, a: number, weights: PpWeights = PP_WEIGHTS): PpScores {
  const range = b.high - b.low, direction = b.close > b.open ? 1 : b.close < b.open ? -1 : 0;
  const up = direction > 0 ? 1 : direction < 0 ? 0 : 0.5, down = 1 - up;
  const lowerWick = Math.min(b.open, b.close) - b.low, upperWick = b.high - Math.max(b.open, b.close);
  if (!(range > 0)) return { range: 0, body: 0, close: 0, wick: 0, activity: a, pressure: 0, upperWick: 0, lowerWick: 0, up, down, delta: up - down, direction };
  const body = (b.close - b.open) / range, close = (2 * b.close - b.high - b.low) / range, wick = (lowerWick - upperWick) / range;
  return { range, body, close, wick, activity: a, pressure: a * (weights.body * body + weights.close * close + weights.wick * wick), upperWick, lowerWick, up, down, delta: up - down, direction };
}

export type PpRow = { time: number; bar: Bar; s: PpScores; reset: boolean; provisional: boolean;
  pressure: { open: number; high: number; low: number; close: number }; balance: { open: number; high: number; low: number; close: number };
  upTotal: number; downTotal: number; ratio: number | null };
type Totals = { S: number; B: number; U: number; D: number; key: number | undefined };
function makeRow(bar: Bar, s: PpScores, t: Totals, anchor: CvdAnchor, provisional: boolean): { row: PpRow; next: Totals } {
  const key = anchorBucket(bar.time, anchor), reset = t.key === undefined || key !== t.key;
  const S = reset ? 0 : t.S, B = reset ? 0 : t.B, U = reset ? 0 : t.U, D = reset ? 0 : t.D;
  const pc = S + s.pressure, bc = B + s.direction;
  const uw = s.range > 0 ? s.upperWick / s.range : 0, lw = s.range > 0 ? s.lowerWick / s.range : 0;
  const nu = U + Math.max(s.pressure, 0), nd = D + Math.max(-s.pressure, 0);
  return {
    row: { time: bar.time, bar, s, reset, provisional,
      pressure: { open: S, close: pc, high: Math.max(S, pc) + 0.5 * s.activity * uw, low: Math.min(S, pc) - 0.5 * s.activity * lw },
      balance: { open: B, close: bc, high: Math.max(B, bc), low: Math.min(B, bc) },
      upTotal: nu, downTotal: nd, ratio: upDownRatio(nu, nd) },
    next: { S: pc, B: bc, U: nu, D: nd, key },
  };
}
export const upDownRatio = (up: number, down: number) => down > 0 ? up / down : null;
export const formatRatio = (r: number | null) => r === null ? '-' : r.toFixed(2);

/**
 * Incremental engine. Closed candles are computed once, cached and never change; only the
 * last (live) candle is recomputed on each sync and flagged provisional.
 * `history` holds extra closed bars before the chart's first candle (ATR warm-up and anchor start).
 */
export class PressureEngine {
  private closed: PpRow[] = [];
  private totals: Totals = { S: 0, B: 0, U: 0, D: 0, key: undefined };
  private all: Bar[] = [];
  private config = '';
  live: PpRow | null = null;
  sync(history: Bar[], bars: Bar[], s: Pick<PpSettings, 'anchor' | 'weights' | 'atr'>, visibleFrom = -Infinity): PpRow[] {
    const config = JSON.stringify([s.anchor, s.weights, s.atr, s.anchor === 'Visible start' ? visibleFrom : 0, history.length ? history[0]!.time : 0, bars[0]?.time ?? 0]);
    if (config !== this.config) { this.config = config; this.closed = []; this.totals = { S: 0, B: 0, U: 0, D: 0, key: undefined }; }
    const first = bars[0]?.time ?? Infinity;
    const merged = [...history.filter(b => b.time < first), ...bars];
    this.all = merged;
    const lastClosed = merged.length - 1, done = this.closed.length ? this.closed.at(-1)!.time : -Infinity;
    for (let i = 0; i < lastClosed; i++) {
      const b = merged[i]!;
      if (b.time <= done) continue;
      if (s.anchor === 'Visible start' && b.time < visibleFrom) continue;
      const { row, next } = makeRow(b, scoreBar(b, activity(b.high - b.low, atrBefore(merged, i, s.atr)), s.weights), this.totals, s.anchor, false);
      this.closed.push(row); this.totals = next;
    }
    const lb = merged[lastClosed];
    this.live = lb && !(s.anchor === 'Visible start' && lb.time < visibleFrom) && lb.time > done
      ? makeRow(lb, scoreBar(lb, activity(lb.high - lb.low, atrBefore(merged, lastClosed, s.atr)), s.weights), this.totals, s.anchor, true).row : null;
    return this.rows();
  }
  rows(): PpRow[] { return this.live ? [...this.closed, this.live] : [...this.closed]; }
  closedRows(): readonly PpRow[] { return this.closed; }
}
export function buildPressure(bars: Bar[], s: Pick<PpSettings, 'anchor' | 'weights' | 'atr'> = PP_DEFAULT, history: Bar[] = [], visibleFrom = -Infinity) {
  return new PressureEngine().sync(history, bars, s, visibleFrom);
}

export type Control = 'BUYERS' | 'SELLERS' | 'BALANCED';
export type Attack = 'BUYERS' | 'SELLERS' | 'NONE';
export type Signal = 'BULLISH ABSORPTION' | 'BEARISH ABSORPTION' | 'NONE';
export type Verdict = { control: Control; attack: Attack; signal: Signal };
/** Control compares the net change of cumulative pressure and balance across the last N candles (anchor resets ignored). */
export function controlOf(rows: PpRow[], end: number, n: number): Control {
  if (end < 0) return 'BALANCED';
  let p = 0, d = 0;
  for (let i = Math.max(0, end - n + 1); i <= end; i++) { p += rows[i]!.s.pressure; d += rows[i]!.s.direction; }
  return p > 0 && d > 0 ? 'BUYERS' : p < 0 && d < 0 ? 'SELLERS' : 'BALANCED';
}
export const attackOf = (p: number, threshold: number): Attack => p >= threshold ? 'BUYERS' : p <= -threshold ? 'SELLERS' : 'NONE';
export function signalOf(control: Control, attack: Attack, s: Pick<PpScores, 'close' | 'wick'>): Signal {
  if (control === 'BUYERS' && attack === 'SELLERS' && (s.close >= 0 || s.wick >= 0.2)) return 'BULLISH ABSORPTION';
  if (control === 'SELLERS' && attack === 'BUYERS' && (s.close <= 0 || s.wick <= -0.2)) return 'BEARISH ABSORPTION';
  return 'NONE';
}
export function verdictAt(rows: PpRow[], i: number, s: Pick<PpSettings, 'lookback' | 'threshold'>): Verdict {
  const r = rows[i];
  if (!r) return { control: 'BALANCED', attack: 'NONE', signal: 'NONE' };
  const control = controlOf(rows, i, s.lookback), attack = attackOf(r.s.pressure, s.threshold);
  return { control, attack, signal: signalOf(control, attack, r.s) };
}

export function tabPanes(tab: PpTab, mobile: boolean): PpPane[] {
  if (tab === 'Both') return mobile ? ['pressure'] : ['pressure', 'balance'];
  return [({ Pressure: 'pressure', Balance: 'balance', Up: 'up', Down: 'down', Ratio: 'ratio', Candles: 'candles' } as const)[tab]];
}
export const visibleTabs = (mobile: boolean): PpTab[] => mobile ? PP_TABS.filter(t => t !== 'Both') : [...PP_TABS];

export const PP_COLLAPSED = 28, PP_MIN = 80;
/**
 * Sub-pane heights: each Price Pressure pane gets its ratio (16% desktop / 25% mobile) of the chart area;
 * all sub-panes (including CVD) are capped at 55% together, shrinking proportionally, minimum 80px each.
 */
export function subPaneHeights(total: number, pp: { ratio: number | null; collapsed: boolean }[], cvd: number | null, mobile: boolean, cap = 0.55) {
  const want = pp.map(p => p.collapsed ? PP_COLLAPSED : Math.max(PP_MIN, total * (p.ratio ?? (mobile ? 0.25 : 0.16))));
  const all = cvd === null ? want : [cvd, ...want];
  const sum = all.reduce((a, b) => a + b, 0), max = total * cap;
  const scale = sum > max ? max / sum : 1;
  const out = all.map((h, i) => { const collapsed = cvd === null ? pp[i]!.collapsed : i > 0 && pp[i - 1]!.collapsed; return collapsed ? PP_COLLAPSED : Math.max(PP_MIN, Math.round(h * scale)); });
  return { cvd: cvd === null ? null : out[0]!, pp: cvd === null ? out : out.slice(1) };
}

export function formatK(v: number, digits = 2) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v), sign = v < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}K`;
  return `${sign}${abs.toFixed(digits)}`;
}
export function formatTooltipTime(ms: number) {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
