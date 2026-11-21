// Browser-safe forex rules: pairs, timeframes and building 4h/1d/1w/1M candles from saved 1h candles (UTC).
export const FOREX_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'XAU/USD'] as const;
export const FOREX_TFS = ['1h', '4h', '1d', '1w', '1M'] as const;
export type ForexTf = (typeof FOREX_TFS)[number];
export const TF_LABEL: Record<ForexTf, string> = { '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W', '1M': '1M' };
export type FxBar = { time: number; open: number; high: number; low: number; close: number };

/** Start (unix seconds, UTC) of the bucket that contains t. Weeks start Monday, months on the 1st. */
export function bucketStart(t: number, tf: ForexTf): number {
  if (tf === '1h') return t - (t % 3600);
  if (tf === '4h') return t - (t % 14400);
  if (tf === '1d') return t - (t % 86400);
  const d = new Date(t * 1000);
  if (tf === '1M') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  const day = t - (t % 86400);
  return day - ((d.getUTCDay() + 6) % 7) * 86400;
}

export function aggregateFx(hours: FxBar[], tf: ForexTf): FxBar[] {
  const out: FxBar[] = [];
  for (const h of [...hours].sort((a, b) => a.time - b.time)) {
    const s = bucketStart(h.time, tf), last = out[out.length - 1];
    if (last && last.time === s) { last.high = Math.max(last.high, h.high); last.low = Math.min(last.low, h.low); last.close = h.close; }
    else out.push({ time: s, open: h.open, high: h.high, low: h.low, close: h.close });
  }
  return out;
}

/** Saved candles of tf, with every bucket from the last saved one onward rebuilt from newer 1h candles. */
export function mergeFx(saved: FxBar[], hours: FxBar[], tf: ForexTf): FxBar[] {
  const base = [...saved].sort((a, b) => a.time - b.time);
  if (tf === '1h') { const m = new Map(base.map(b => [b.time, b])); for (const h of hours) m.set(h.time, h); return [...m.values()].sort((a, b) => a.time - b.time); }
  const from = base.length ? base[base.length - 1]!.time : -Infinity;
  const built = aggregateFx(hours.filter(h => h.time >= from), tf);
  if (!built.length) return base;
  return [...base.filter(b => b.time < built[0]!.time), ...built];
}

/** Forex is closed from Friday 22:00 to Sunday 21:00 UTC; no new candles are fetched then. */
export function marketClosed(nowSec: number): boolean {
  const d = new Date(nowSec * 1000), day = d.getUTCDay(), h = d.getUTCHours();
  return (day === 5 && h >= 22) || day === 6 || (day === 0 && h < 21);
}
