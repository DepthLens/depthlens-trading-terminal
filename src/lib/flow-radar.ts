// Browser-safe Flow Radar glue: settings, Binance kline parsing and timeframe bucketing for flow-radar-core.
import type { Candle } from './flow-radar-core';
export type RadarSettings = { q: 0.8 | 0.9 | 0.95; highVolOnly: boolean; rr: number; maxBars: number; watch: boolean };
export const RADAR_DEFAULT: RadarSettings = { q: 0.9, highVolOnly: false, rr: 1, maxBars: 24, watch: true };
export const RADAR_KEY = 'depthlens.flowRadar.v2';
const num = (v: unknown, d: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d;
export function restoreRadarSettings(raw: string | null): RadarSettings {
  try { const d = raw ? JSON.parse(raw) : {};
    return { q: [0.8, 0.9, 0.95].includes(d.q) ? d.q : 0.9, highVolOnly: d.highVolOnly === true, rr: num(d.rr, 1, 0.25, 10), maxBars: Math.round(num(d.maxBars, 24, 1, 500)), watch: d.watch !== false };
  } catch { return { ...RADAR_DEFAULT }; }
}
/** Binance futures kline row → Candle; delta = 2 * takerBuyBase (idx 9) - volume (idx 5). */
export function parseKline(k: (string | number)[]): Candle {
  const v = Number(k[5]);
  return { t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v, delta: 2 * Number(k[9]) - v };
}
const BINANCE: [number, string][] = [[1440, '1d'], [720, '12h'], [480, '8h'], [360, '6h'], [240, '4h'], [120, '2h'], [60, '1h'], [30, '30m'], [15, '15m'], [5, '5m'], [3, '3m'], [1, '1m']];
/** Largest Binance interval that evenly divides the chart timeframe (1m always works for custom timeframes). */
export function baseInterval(minutes: number): [number, string] { return BINANCE.find(([m]) => minutes % m === 0) ?? [1, '1m']; }
/** Bucket candles into chart timeframe using epoch alignment; sums volume and delta. */
export function bucketCandles(rows: Candle[], minutes: number): Candle[] {
  const ms = minutes * 60000, out: Candle[] = [];
  for (const r of rows) {
    const t = Math.floor(r.t / ms) * ms, last = out.at(-1);
    if (last && last.t === t) { last.h = Math.max(last.h, r.h); last.l = Math.min(last.l, r.l); last.c = r.c; last.v += r.v; last.delta += r.delta; }
    else out.push({ ...r, t });
  }
  return out;
}
