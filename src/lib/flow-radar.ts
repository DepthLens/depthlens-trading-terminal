// Browser-only adapter; the uploaded core is the sole owner of detection/scoring rules.
import type { Candle, SetupOptions } from './flow-radar-core';
export type RadarSettings = SetupOptions & { rr: number; maxBars: number; showWatch: boolean };
export const RADAR_KEY = 'depthlens.flowRadar.v2';
export const RADAR_DEFAULT: RadarSettings = { q: 0.9, highVolOnly: false, rr: 1, maxBars: 24, showWatch: true };
export function restoreRadarSettings(raw: string | null): RadarSettings {
  try {
    const d = raw ? JSON.parse(raw) : {};
    return { q: [0.8, 0.9, 0.95].includes(d.q) ? d.q : 0.9, highVolOnly: d.highVolOnly === true,
      rr: typeof d.rr === 'number' && Number.isFinite(d.rr) && d.rr > 0 ? d.rr : 1,
      maxBars: Number.isInteger(d.maxBars) && d.maxBars > 0 ? d.maxBars : 24, showWatch: d.showWatch !== false };
  } catch { return { ...RADAR_DEFAULT }; }
}
export const radarInterval = (minutes: number) => ({ 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 120: '2h', 180: '3h', 240: '4h', 720: '12h', 1440: '1d' } as Record<number, string>)[minutes] ?? '1m';
export const parseKline = (k: (string | number)[]): Candle => ({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]), delta: 2 * Number(k[9]) - Number(k[5]) });
export function aggregateRadar(bars: Candle[], minutes: number): Candle[] {
  const out: Candle[] = [], ms = minutes * 60000;
  for (const b of bars) {
    const t = Math.floor(b.t / ms) * ms, last = out.at(-1);
    if (last?.t === t) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.v += b.v; last.delta += b.delta; }
    else out.push({ ...b, t });
  }
  return out;
}
