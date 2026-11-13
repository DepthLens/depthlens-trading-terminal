// Browser-safe Flow Radar rules: per-candle delta ratio / volume z, setups and outcome scoring.
export type RadarBar = { time: number; open: number; high: number; low: number; close: number; volume: number; takerBuy: number };
export type RadarSettings = { tf: string; r: number; fee: number; dr: number; vz: number; hold: number; momentum: boolean; sweep: boolean };
export type SetupKind = 'momentum' | 'sweep';
export type Outcome = 'open' | 'win' | 'loss' | 'expired';
export type RadarSetup = { kind: SetupKind; side: 'buy' | 'sell'; time: number; entry: number; stop: number; target: number; outcome: Outcome; exitTime?: number; exitPrice?: number; resultR?: number };
export const RADAR_TFS = ['5m', '15m', '30m', '1h', '2h', '4h', '1d'] as const;
export const RADAR_MINUTES: Record<string, number> = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '1d': 1440 };
export const RADAR_DEFAULT: RadarSettings = { tf: '1h', r: 2, fee: 0.04, dr: 0.2, vz: 1.5, hold: 24, momentum: true, sweep: false };
export const RADAR_KEY = 'depthlens.flowRadar.v1';
export const STOP_BUFFER = 0.0003, MIN_STOP = 0.0015, MAX_STOP = 0.02;
const num = (v: unknown, d: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d;
export function restoreRadarSettings(raw: string | null): RadarSettings {
  try { const d = raw ? JSON.parse(raw) : {};
    return { tf: RADAR_TFS.includes(d.tf) ? d.tf : RADAR_DEFAULT.tf, r: num(d.r, 2, 0.5, 10), fee: num(d.fee, 0.04, 0, 1), dr: num(d.dr, 0.2, 0.01, 1), vz: num(d.vz, 1.5, 1, 10), hold: Math.round(num(d.hold, 24, 1, 200)), momentum: d.momentum !== false, sweep: d.sweep === true };
  } catch { return { ...RADAR_DEFAULT }; }
}
export const deltaRatio = (b: RadarBar) => b.volume > 0 ? (2 * b.takerBuy - b.volume) / b.volume : 0;
export const breakeven = (r: number) => 100 / (1 + r);
export const shortTfWarning = (tf: string) => (RADAR_MINUTES[tf] ?? 60) <= 15;
const day = (t: number) => Math.floor(t / 86400000);

export function findSetups(bars: RadarBar[], s: RadarSettings): RadarSetup[] {
  const out: RadarSetup[] = [], dayHL = new Map<number, { h: number; l: number }>(), used = new Set<string>();
  for (const b of bars) { const d = day(b.time), e = dayHL.get(d); dayHL.set(d, e ? { h: Math.max(e.h, b.high), l: Math.min(e.l, b.low) } : { h: b.high, l: b.low }); }
  const add = (kind: SetupKind, side: 'buy' | 'sell', i: number) => {
    const b = bars[i]!, entry = b.close, stop = side === 'buy' ? b.low * (1 - STOP_BUFFER) : b.high * (1 + STOP_BUFFER), risk = Math.abs(entry - stop);
    if (risk / entry < MIN_STOP || risk / entry > MAX_STOP) return;
    out.push(resolve({ kind, side, time: b.time, entry, stop, target: side === 'buy' ? entry + s.r * risk : entry - s.r * risk, outcome: 'open' }, bars, i, s));
  };
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!, dr = deltaRatio(b);
    if (s.momentum && i >= 24) {
      let avg = 0; for (let j = i - 24; j < i; j++) avg += bars[j]!.volume; avg /= 24;
      const vz = avg > 0 ? b.volume / avg : 0;
      if (vz >= s.vz && dr >= s.dr) add('momentum', 'buy', i); else if (vz >= s.vz && dr <= -s.dr) add('momentum', 'sell', i);
    }
    const prev = dayHL.get(day(b.time) - 1);
    if (s.sweep && prev) {
      const d = day(b.time);
      if (b.high > prev.h && b.close < prev.h && dr > 0.05 && !used.has(d + 's')) { used.add(d + 's'); add('sweep', 'sell', i); }
      if (b.low < prev.l && b.close > prev.l && dr < -0.05 && !used.has(d + 'b')) { used.add(d + 'b'); add('sweep', 'buy', i); }
    }
  }
  return out;
}

function resolve(x: RadarSetup, bars: RadarBar[], i: number, s: RadarSettings): RadarSetup {
  const risk = Math.abs(x.entry - x.stop), feeR = (2 * s.fee / 100) * x.entry / risk, buy = x.side === 'buy';
  for (let j = i + 1; j < bars.length && j <= i + s.hold; j++) {
    const b = bars[j]!, hitStop = buy ? b.low <= x.stop : b.high >= x.stop, hitTarget = buy ? b.high >= x.target : b.low <= x.target;
    if (hitStop) return { ...x, outcome: 'loss', exitTime: b.time, exitPrice: x.stop, resultR: -1 - feeR }; // stop first when both touch (conservative)
    if (hitTarget) return { ...x, outcome: 'win', exitTime: b.time, exitPrice: x.target, resultR: s.r - feeR };
  }
  if (i + s.hold < bars.length) { const b = bars[i + s.hold]!; return { ...x, outcome: 'expired', exitTime: b.time, exitPrice: b.close, resultR: (buy ? b.close - x.entry : x.entry - b.close) / risk - feeR }; }
  return x;
}

export type Score = { setups: number; perMonth: number; wins: number; losses: number; accuracy: number | null; breakeven: number; avgR: number | null };
export function scoreSetups(list: RadarSetup[], kind: SetupKind, s: RadarSettings, spanMs: number): Score {
  const k = list.filter(x => x.kind === kind), wins = k.filter(x => x.outcome === 'win').length, losses = k.filter(x => x.outcome === 'loss').length;
  const closed = k.filter(x => x.resultR !== undefined), months = spanMs / (30 * 86400000);
  return { setups: k.length, perMonth: months > 0 ? k.length / months : 0, wins, losses, accuracy: wins + losses ? 100 * wins / (wins + losses) : null, breakeven: breakeven(s.r), avgR: closed.length ? closed.reduce((a, x) => a + (x.resultR ?? 0), 0) / closed.length : null };
}
// Binance futures kline row -> bar; index 9 is taker buy base volume.
export const parseKline = (k: (string | number)[]): RadarBar => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], takerBuy: +k[9] });
