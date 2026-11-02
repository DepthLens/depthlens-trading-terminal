import { aggregate, NATIVE, type Bar } from './chart-data';
import { PP_PAGE_LIMIT } from './price-pressure';

// Extra closed history before the chart's first candle (ATR warm-up and anchor start). Max 6 requests per pair/timeframe, cached.
type Entry = { bars: Bar[]; requests: number; busy: boolean; done: boolean };
const cache = new Map<string, Entry>();
export function historyFor(symbol: string, minutes: number) { return cache.get(`${symbol}:${minutes}`)?.bars ?? []; }
export function historyRequests(symbol: string, minutes: number) { return cache.get(`${symbol}:${minutes}`)?.requests ?? 0; }
export async function loadPressureHistory(symbol: string, minutes: number, firstChartTime: number, needFrom: number, fetcher: typeof fetch = fetch) {
  const key = `${symbol}:${minutes}`;
  const e = cache.get(key) ?? { bars: [], requests: 0, busy: false, done: false };
  cache.set(key, e);
  const native = NATIVE[minutes];
  while (!e.busy && !e.done && e.requests < PP_PAGE_LIMIT) {
    const oldest = e.bars[0]?.time ?? firstChartTime;
    if (oldest <= needFrom) break;
    e.busy = true; e.requests++;
    try {
      const r = await fetcher(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${native ?? '1m'}&endTime=${oldest - 1}&limit=1500`);
      if (!r.ok) { e.done = r.status === 400; break; }
      const raw: unknown[][] = await r.json();
      if (!Array.isArray(raw) || !raw.length) { e.done = true; break; }
      const bars = raw.map(k => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) })).filter(b => Number.isFinite(b.close));
      // Custom timeframes keep only complete buckets that end before the existing oldest bucket.
      const next = native ? bars : aggregate(bars, minutes).filter((b, i) => i > 0 && b.time < oldest);
      e.bars = [...next.filter(b => b.time < oldest), ...e.bars];
    } catch { break; } finally { e.busy = false; }
  }
  return e.bars;
}
