/**
 * Flow Radar v2 core (pure functions, no UI, no network).
 *
 * Built from a 22 month BTCUSDT futures study (2025-01-01 .. 2026-10-31, 12 timeframes, buy/sell delta).
 * What the data supported:
 *  - Flow Momentum with ADAPTIVE (percentile) thresholds has a small positive edge after fees only on
 *    3h / 4h / 12h candles (about +0.13 to +0.21 R per trade, 56-60% target hit at 1R, 3-5 trades per month).
 *  - On 1h and below, no rule survived fees in both years. They get "context" mode, not entries.
 *  - Reversal context (sweep of a 20-bar extreme + close back + absorption) is real but is only a WATCH,
 *    not a trade: about 50% of these (15m, 1h, 4h) were followed by a >=1.5 ATR swing within 12 candles,
 *    versus about 29% for any new 20-bar extreme. That is NOT a trade win rate; the trades were negative after fees.
 * Labels are "Setup" and "Watch", never "Signal". No accuracy claim above the measured numbers.
 */

export interface Candle {
  t: number;      // open time, ms
  o: number; h: number; l: number; c: number;
  v: number;      // volume (base)
  delta: number;  // taker buy volume minus taker sell volume
}

export const FEE_ROUND_TRIP = 0.0008;  // 0.04% taker each side
export const STOP_BUFFER = 0.0003;     // 0.03% beyond the signal candle extreme
export const MIN_RISK_PCT = 0.0003;    // ignore setups with a stop closer than 0.03%
export const RANK_WINDOW = 1000;
export const ATR_RANK_WINDOW = 500;

export type Side = 1 | -1;

export interface Features {
  atr: number[];      // simple mean of true range over 14 bars (NaN until 14 bars)
  atrRank: number[];  // percentile rank of ATR over ATR_RANK_WINDOW bars (NaN until a full window)
  vrk: number[];      // percentile rank of volume / mean(volume of the previous 20 bars)
  drk: number[];      // percentile rank of delta / volume
  cl: number[];       // close location in the candle range, 0..1
  low20: number[];    // lowest low of the previous 20 candles (NaN until available)
  high20: number[];   // highest high of the previous 20 candles
}

/** Percentile rank of x[i] inside the trailing window (includes itself, ties use average rank). */
export function rollingRank(x: number[], window: number, minPeriods: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  for (let i = 0; i < x.length; i++) {
    const start = Math.max(0, i - window + 1);
    let n = 0, less = 0, equal = 0;
    for (let k = start; k <= i; k++) {
      const v = x[k];
      if (Number.isNaN(v)) continue;
      n++;
      if (v < x[i]) less++; else if (v === x[i]) equal++;
    }
    if (n >= minPeriods && !Number.isNaN(x[i])) out[i] = (less + (equal + 1) / 2) / n;
  }
  return out;
}

function rollingMean(x: number[], w: number, shift = 0): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i];
    if (i >= w) sum -= x[i - w];
    if (i >= w - 1 && i + shift < x.length) out[i + shift] = sum / w;
  }
  return out;
}

export function computeFeatures(c: Candle[]): Features {
  const n = c.length;
  const tr = c.map((b, i) => i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - c[i - 1].c), Math.abs(b.l - c[i - 1].c)));
  const atr = rollingMean(tr, 14);
  const vma = rollingMean(c.map(b => b.v), 20, 1);               // previous 20 bars (shifted by one)
  const vr = c.map((b, i) => Number.isNaN(vma[i]) || vma[i] === 0 ? 1 : b.v / vma[i]);
  const dr = c.map(b => (b.v > 0 ? b.delta / b.v : 0));
  const cl = c.map(b => (b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5));
  const low20 = new Array<number>(n).fill(NaN), high20 = new Array<number>(n).fill(NaN);
  for (let i = 20; i < n; i++) {
    let lo = Infinity, hi = -Infinity;
    for (let k = i - 20; k < i; k++) { lo = Math.min(lo, c[k].l); hi = Math.max(hi, c[k].h); }
    low20[i] = lo; high20[i] = hi;
  }
  return {
    atr,
    atrRank: rollingRank(atr, ATR_RANK_WINDOW, ATR_RANK_WINDOW),
    vrk: rollingRank(vr, RANK_WINDOW, 200),
    drk: rollingRank(dr, RANK_WINDOW, 200),
    cl, low20, high20,
  };
}

export interface SetupOptions {
  q: number;            // percentile threshold, default 0.9 (top 10% volume AND top/bottom 10% delta ratio)
  highVolOnly: boolean; // require ATR rank >= 0.5
}
export const DEFAULT_SETUP: SetupOptions = { q: 0.9, highVolOnly: false };

/** Flow Momentum: volume in the top (1-q) AND delta ratio extreme. +1 buy setup, -1 sell setup, 0 none. */
export function flowMomentum(f: Features, i: number, o: SetupOptions = DEFAULT_SETUP): 0 | Side {
  const vrk = f.vrk[i], drk = f.drk[i];
  if (Number.isNaN(vrk) || Number.isNaN(drk)) return 0;
  if (o.highVolOnly && !(f.atrRank[i] >= 0.5)) return 0;
  if (vrk >= o.q && drk >= o.q) return 1;
  if (vrk >= o.q && drk <= 1 - o.q) return -1;
  return 0;
}

/** Reversal WATCH (not a trade): sweep of the previous 20 bar extreme, close back inside, absorption by delta. */
export function reversalWatch(c: Candle[], f: Features, i: number): 0 | Side {
  const b = c[i];
  if (Number.isNaN(f.low20[i]) || Number.isNaN(f.drk[i]) || Number.isNaN(f.vrk[i])) return 0;
  const sweepLow = b.l < f.low20[i] && b.c > f.low20[i];
  const sweepHigh = b.h > f.high20[i] && b.c < f.high20[i];
  if (sweepLow && f.vrk[i] >= 0.8 && f.drk[i] <= 0.3 && f.cl[i] >= 0.6) return 1;
  if (sweepHigh && f.vrk[i] >= 0.8 && f.drk[i] >= 0.7 && f.cl[i] <= 0.4) return -1;
  return 0;
}

export interface Outcome {
  i: number; side: Side; entry: number; stop: number; target: number;
  riskPct: number; grossR: number; netR: number; hit: boolean;
  exit: 'target' | 'stop' | 'timeout'; exitIndex: number;
}

/** Fee drag expressed in R for a given entry and stop. */
export function feeCostR(entry: number, stop: number, fee = FEE_ROUND_TRIP): number {
  return (fee * entry) / Math.abs(entry - stop);
}

/**
 * Simulate one setup: enter at the next candle open, stop just beyond the signal candle extreme,
 * target = rr * risk, follow up to maxBars candles. If stop and target are hit in the same candle the stop wins.
 */
export function simulate(c: Candle[], f: Features, i: number, side: Side, rr = 1.0, maxBars = 24): Outcome | null {
  const n = c.length;
  if (i + 2 >= n || Number.isNaN(f.atr[i])) return null;
  const e = c[i + 1].o;
  const stop0 = side === 1 ? c[i].l * (1 - STOP_BUFFER) : c[i].h * (1 + STOP_BUFFER);
  const R = Math.abs(e - stop0);
  if (R <= 0 || R / e < MIN_RISK_PCT) return null;
  const stop = e - side * R, target = e + side * rr * R;
  const last = Math.min(n - 1, i + 1 + maxBars);
  let res: number | null = null, exit: Outcome['exit'] = 'timeout', exitIndex = last;
  for (let j = i + 1; j <= last; j++) {
    const b = c[j];
    if (side === 1) {
      if (b.o <= stop) { res = (b.o - e) / R; exit = 'stop'; exitIndex = j; break; }
      if (b.l <= stop) { res = -1; exit = 'stop'; exitIndex = j; break; }
      if (b.h >= target) { res = rr; exit = 'target'; exitIndex = j; break; }
    } else {
      if (b.o >= stop) { res = (e - b.o) / R; exit = 'stop'; exitIndex = j; break; }
      if (b.h >= stop) { res = -1; exit = 'stop'; exitIndex = j; break; }
      if (b.l <= target) { res = rr; exit = 'target'; exitIndex = j; break; }
    }
  }
  const hit = res !== null && res >= rr - 1e-9;
  if (res === null) res = (side * (c[last].c - e)) / R;
  return { i, side, entry: e, stop, target, riskPct: R / e, grossR: res, netR: res - (FEE_ROUND_TRIP * e) / R, hit, exit, exitIndex };
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [NaN, NaN];
  const p = k / n, den = 1 + (z * z) / n, cen = (p + (z * z) / (2 * n)) / den;
  const hw = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [cen - hw, cen + hw];
}

export interface Scoreboard {
  n: number; hitPct: number; hitCiLo: number; hitCiHi: number;
  avgGrossR: number; avgNetR: number; sumNetR: number; maxDrawdownR: number; medianRiskPct: number;
  /** honest label shown next to the numbers */
  verdict: 'too few trades' | 'positive after fees' | 'not positive after fees';
}

export function scoreboard(trades: Outcome[]): Scoreboard {
  const n = trades.length;
  if (n === 0) return { n: 0, hitPct: NaN, hitCiLo: NaN, hitCiHi: NaN, avgGrossR: NaN, avgNetR: NaN, sumNetR: 0, maxDrawdownR: 0, medianRiskPct: NaN, verdict: 'too few trades' };
  const k = trades.filter(t => t.hit).length;
  const [lo, hi] = wilson(k, n);
  const sumNet = trades.reduce((s, t) => s + t.netR, 0);
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.netR; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const risks = trades.map(t => t.riskPct).sort((a, b) => a - b);
  const avgNet = sumNet / n;
  return {
    n, hitPct: (100 * k) / n, hitCiLo: 100 * lo, hitCiHi: 100 * hi,
    avgGrossR: trades.reduce((s, t) => s + t.grossR, 0) / n, avgNetR: avgNet, sumNetR: sumNet, maxDrawdownR: dd,
    medianRiskPct: risks[Math.floor(n / 2)],
    verdict: n < 30 ? 'too few trades' : avgNet > 0 ? 'positive after fees' : 'not positive after fees',
  };
}

export type Mode = 'setup' | 'context';
export interface TfPolicy { mode: Mode; measured: boolean; note: string; typicalFeeDragR: number | null; }

/** Median fee drag in R measured on BTCUSDT (stop = median candle range, 0.08% round trip fee). */
const FEE_DRAG_R: Record<number, number> = { 1: 1.69, 5: 0.63, 15: 0.34, 30: 0.24, 60: 0.16, 240: 0.08 };

export function tfPolicy(minutes: number): TfPolicy {
  const drag = FEE_DRAG_R[minutes] ?? null;
  if (minutes < 180) {
    return { mode: 'context', measured: true, typicalFeeDragR: drag,
      note: `No tested rule stayed positive after fees at ${minutes}m (typical fee cost ${drag ?? 'high'} R per trade). Showing context only.` };
  }
  const measured = minutes === 180 || minutes === 240 || minutes === 720;
  return { mode: 'setup', measured, typicalFeeDragR: drag,
    note: measured ? 'Measured on 22 months of BTCUSDT: small positive result after fees, few trades. Not proof.'
      : minutes >= 1440 ? 'Very few setups; the result is not reliable yet.' : 'This timeframe was not measured separately; treat as untested.' };
}

/** Run the whole thing over a history and return setups with their outcomes (for markers + scoreboard). */
export function scan(c: Candle[], minutes: number, opt: SetupOptions = DEFAULT_SETUP, rr = 1.0, maxBars = 24) {
  const f = computeFeatures(c);
  const policy = tfPolicy(minutes);
  const setups: Outcome[] = [];
  const watches: { i: number; side: Side }[] = [];
  for (let i = 0; i < c.length; i++) {
    if (policy.mode === 'setup') {
      const s = flowMomentum(f, i, opt);
      if (s !== 0) { const o = simulate(c, f, i, s, rr, maxBars); if (o) setups.push(o); }
    }
    const w = reversalWatch(c, f, i);
    if (w !== 0) watches.push({ i, side: w });
  }
  return { policy, setups, watches, board: scoreboard(setups) };
}
