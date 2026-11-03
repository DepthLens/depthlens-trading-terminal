// Browser-safe Control & Attack bar rules. Reuses Price Pressure scoring; no sockets, no state.
import { activity, atrBefore, attackOf, clamp, scoreBar, type Attack, type Control, type PpScores } from '@/lib/price-pressure';
import type { Bar } from '@/lib/chart-data';

export const FB_KEY = 'depthlens.flowbars.v1';
export type FbSettings = { lookback: number; threshold: number; sentences: boolean; collapsed: [boolean, boolean] };
export const FB_DEFAULT: FbSettings = { lookback: 20, threshold: 0.25, sentences: true, collapsed: [false, false] };
export const FB_HEIGHT = 36, FB_HEIGHT_MOBILE = 40, FB_COLLAPSED = 20, FB_LIVE_FRACTION = 0.2, FB_HOLD = 2, FB_HOLD_MS = 2000;

export function restoreFlowBars(raw: string | null): FbSettings {
  try {
    const d = JSON.parse(raw ?? '{}') ?? {};
    const lookback = Number.isFinite(d.lookback) ? Math.max(2, Math.min(500, Math.round(d.lookback))) : 20;
    const threshold = Number.isFinite(d.threshold) && d.threshold > 0 ? d.threshold : 0.25;
    const c = Array.isArray(d.collapsed) ? d.collapsed : [];
    return { lookback, threshold, sentences: d.sentences !== false, collapsed: [c[0] === true, c[1] === true] };
  } catch { return { ...FB_DEFAULT, collapsed: [false, false] }; }
}

/** Scores every bar with the Price Pressure formulas (ATR of previous closed bars). */
export const scoreAll = (bars: Bar[]): PpScores[] => bars.map((b, i) => scoreBar(b, activity(b.high - b.low, atrBefore(bars, i))));

export type ControlInfo = { state: Control; sumP: number; sumD: number; buyShare: number };
/** Control over the last N closed scores (callers pass closed candles only). */
export function controlInfo(closed: PpScores[], n: number): ControlInfo {
  let sumP = 0, sumD = 0, pos = 0, abs = 0;
  for (const s of closed.slice(-n)) { sumP += s.pressure; sumD += s.direction; pos += Math.max(s.pressure, 0); abs += Math.abs(s.pressure); }
  const state: Control = sumP > 0 && sumD > 0 ? 'BUYERS' : sumP < 0 && sumD < 0 ? 'SELLERS' : 'BALANCED';
  return { state, sumP, sumD, buyShare: abs > 0 ? pos / abs : 0.5 };
}

/** Live candle counts once at least 20% of its time has passed; otherwise the last closed candle. */
export const liveCandleCounts = (liveStartMs: number, minutes: number, nowMs: number) => (nowMs - liveStartMs) / (minutes * 60000) >= FB_LIVE_FRACTION;

export type AttackInfo = { state: Attack; p: number; strength: number; live: boolean; scores: PpScores };
export function attackInfo(scores: PpScores[], live: boolean, threshold: number): AttackInfo | null {
  const s = live ? scores.at(-1) : scores.at(-2);
  if (!s) return null;
  return { state: attackOf(s.pressure, threshold), p: s.pressure, strength: clamp(Math.abs(s.pressure) / 1.5, 0, 1), live, scores: s };
}

export const priceHeld = (s: Pick<PpScores, 'close' | 'wick'>) => s.close >= 0 || s.wick >= 0.2;
export const priceFailed = (s: Pick<PpScores, 'close' | 'wick'>) => s.close <= 0 || s.wick <= -0.2;

export const S_NOBODY = 'Nobody clearly controls the market right now. Wait for a clear move.';
export const S_NO_ATTACK = 'No strong attack right now.';
export function combinedSentence(control: Control, attack: Attack, s: Pick<PpScores, 'close' | 'wick'>): string {
  if (control === 'BALANCED') return S_NOBODY;
  if (attack === 'NONE') return S_NO_ATTACK;
  if (control === 'BUYERS') return attack === 'BUYERS' ? 'Buyers control the market and are pushing higher. The up trend is continuing.'
    : priceHeld(s) ? 'Buyers control the market. Sellers are attacking, but price held, so buyers are absorbing the selling. Bullish.'
    : 'Buyers control the market, but sellers are winning this candle. Buyer control may be ending. Be careful.';
  return attack === 'SELLERS' ? 'Sellers control the market and are pushing lower. The down trend is continuing.'
    : priceFailed(s) ? 'Sellers control the market. Buyers are attacking, but the push was rejected, so sellers are absorbing the buying. Bearish.'
    : 'Sellers control the market, but buyers are winning this candle. A reversal may be starting. Wait for confirmation.';
}
export const controlSentence = (c: Control) => c === 'BUYERS' ? 'Buyers have been in charge over the recent candles.' : c === 'SELLERS' ? 'Sellers have been in charge over the recent candles.' : S_NOBODY;

/** Displayed state changes only after a new state held for 2 consecutive updates spanning at least 2 seconds. */
export class Hold<T> {
  shown: T | null = null; private pending: T | null = null; private count = 0; private since = 0;
  update(next: T, now: number): T {
    if (this.shown === null) { this.shown = next; return next; }
    if (next === this.shown) { this.pending = null; this.count = 0; return this.shown; }
    if (next !== this.pending) { this.pending = next; this.count = 1; this.since = now; return this.shown; }
    this.count++;
    if (this.count >= FB_HOLD && now - this.since >= FB_HOLD_MS - 1000) { this.shown = next; this.pending = null; this.count = 0; }
    return this.shown;
  }
}

/** Height taken by one bar. */
export const barHeight = (mobile: boolean, collapsed: boolean, top: boolean) => collapsed ? FB_COLLAPSED : top && mobile ? FB_HEIGHT_MOBILE : FB_HEIGHT;
