// Browser-safe rules for the professional heatmap: colour scaling, ladder/profile rows,
// lower-panel series (volume, CVD, imbalance) and saved settings. No sockets, no React.
import { percentile, type Column } from './heatmap-data';

export type ProSettings = {
  lowCut: number; highCut: number; autoFit: boolean;
  ladder: boolean; svp: boolean; tape: boolean; tapeMin: number; tapeBig: number;
  volume: boolean; cvd: boolean; imbalance: boolean; panelH: number; cvdSession: boolean; imbPct: number;
  pulled: boolean; iceberg: boolean; absorption: boolean; bubbleText: number;
};
export const DEFAULT_PRO: ProSettings = {
  lowCut: 5, highCut: 99.5, autoFit: true,
  ladder: true, svp: true, tape: false, tapeMin: 0, tapeBig: 100000,
  volume: true, cvd: true, imbalance: true, panelH: 150, cvdSession: true, imbPct: 0.1,
  pulled: true, iceberg: true, absorption: true, bubbleText: 250000,
};
export const HEATMAP_PRO_KEY = 'depthlens.heatmap.pro';
export const IMB_PCTS = [0.05, 0.1, 0.25, 0.5] as const;
export const DEPTH_NOTE = 'Depth is limited to what the exchange provides (about 1000 price levels on Binance). Markers show order-book behaviour; they are context, not signals.';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function restoreProSettings(raw: string | null): ProSettings {
  try {
    const v = raw ? JSON.parse(raw) as Partial<ProSettings> : {};
    const out = { ...DEFAULT_PRO };
    for (const k of Object.keys(DEFAULT_PRO) as (keyof ProSettings)[]) {
      const d = DEFAULT_PRO[k], x = v[k];
      if (typeof x === typeof d && (typeof x !== 'number' || Number.isFinite(x))) (out as Record<string, unknown>)[k] = x;
    }
    out.lowCut = clamp(out.lowCut, 0, 50); out.highCut = clamp(out.highCut, 80, 99.9);
    out.panelH = clamp(out.panelH, 60, 400); out.imbPct = clamp(out.imbPct, 0.05, 0.5);
    return out;
  } catch { return { ...DEFAULT_PRO }; }
}

// Percentile scale: lower/upper cut-offs of visible sizes, so a few huge orders never darken the rest.
export function scaleRange(values: number[], lowCut: number, highCut: number): { lo: number; hi: number } {
  if (!values.length) return { lo: 0, hi: 1 };
  const lo = percentile(values, Math.max(0.0001, lowCut)), hi = Math.max(lo * 1.0001 + 1e-9, percentile(values, highCut));
  return { lo, hi };
}
// 0..1 colour position; contrast > 1 brightens mid sizes, < 1 darkens them.
export function scalePos(value: number, lo: number, hi: number, contrast: number): number {
  if (!(value > 0)) return 0;
  const t = clamp((Math.log1p(value) - Math.log1p(lo)) / Math.max(1e-9, Math.log1p(hi) - Math.log1p(lo)), 0, 1);
  return Math.pow(t, 1 / clamp(contrast, 0.2, 3));
}

export type ColumnFlow = { time: number; buy: number; sell: number; cvd: number; imbalance: number | null; empty: boolean };
// Per-column traded volume, running CVD (optional reset at 00:00 UTC) and book imbalance within ±pct% of price.
export function columnFlows(cols: readonly Column[], bucket: number, imbPct: number, sessionReset: boolean): ColumnFlow[] {
  const out: ColumnFlow[] = []; let cvd = 0, day = -1;
  for (const c of cols) {
    let buy = 0, sell = 0;
    for (const t of c.trades.values()) { buy += t.buy; sell += t.sell; }
    const d = Math.floor(c.time / 86400000);
    if (sessionReset && d !== day) { cvd = 0; day = d; }
    if (!c.empty && !c.gap) cvd += buy - sell;
    out.push({ time: c.time, buy, sell, cvd, imbalance: c.empty || c.gap || c.priceOnly ? null : bookImbalance(c, bucket, imbPct), empty: Boolean(c.empty || c.gap) });
  }
  return out;
}
export function bookImbalance(c: Column, bucket: number, imbPct: number): number | null {
  if (!Number.isFinite(c.price) || !c.data.length) return null;
  const pi = Math.floor(c.price / bucket), span = Math.max(1, Math.round(c.price * imbPct / 100 / bucket));
  let bid = 0, ask = 0;
  for (let i = pi - span; i <= pi + span; i++) {
    const k = i - c.origin; if (k < 0 || k >= c.data.length) continue;
    const v = c.data[k] ?? 0;
    if (i < pi) bid += v; else if (i > pi) ask += v;
  }
  return bid + ask > 0 ? (bid - ask) / (bid + ask) : null;
}

// Session volume profile (from 00:00 UTC) over the given columns, keyed by absolute bucket index.
export function sessionProfile(cols: readonly Column[], bucket: number, now: number): { bins: Map<number, number>; poc: number | null; from: number | null } {
  const start = Math.floor(now / 86400000) * 86400000, bins = new Map<number, number>();
  let from: number | null = null;
  for (const c of cols) {
    if (c.time < start || c.gap) continue;
    for (const [i, t] of c.trades) { const v = t.buy + t.sell; if (v > 0) { const k = Math.floor((t.price ?? (i + .5) * bucket) / bucket); bins.set(k, (bins.get(k) ?? 0) + v); from ??= c.time; } }
  }
  let poc: number | null = null, best = 0;
  for (const [k, v] of bins) if (v > best) { best = v; poc = k; }
  return { bins, poc, from };
}

// Ladder sides for one book column: below the column's price = bids, above = asks.
export function ladderSide(bucketIndex: number, priceIndex: number): 'bid' | 'ask' | 'mid' {
  return bucketIndex < priceIndex ? 'bid' : bucketIndex > priceIndex ? 'ask' : 'mid';
}

export const REPLAY_SPEEDS = [1, 5, 20, 60] as const;
export function replayAdvance(t: number, dtMs: number, speed: number, end: number): { t: number; done: boolean } {
  const next = t + dtMs * speed;
  return next >= end ? { t: end, done: true } : { t: next, done: false };
}
