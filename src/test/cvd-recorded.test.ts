import { describe, expect, it } from 'vitest';
import { aggregateDeltas } from '@/lib/cvd-data';
import { CVD_MAX_PAGES, CVD_PAGE_MS, cvdLiveCutoff, cvdPagesFor, joinCvdBars, mergeRecordedCvd, parseCvdPage } from '@/lib/cvd-recorded';

const T0 = Date.UTC(2026, 10, 27, 6); // page boundary
const page = (cutoffIso: string | null, minutes: [number, number, number, number, number][], now = T0 + 3600000) =>
  parseCvdPage({ first: null, cutoff: cutoffIso, minutes }, T0, T0 + CVD_PAGE_MS, now);

describe('recorded CVD', () => {
  it('candle delta equals recorded buy − sell (same as Footprint)', () => {
    const p = page(null, [[T0, 3, 1, 300, 100]]);
    const [b] = mergeRecordedCvd({ from: T0, now: T0 + 3600000, pages: [p], cutoff: null, trades: [] })!;
    expect(b!.coin).toBe(2); expect(b!.quote).toBe(200);
  });
  it('adds live trades only at/after the cutoff, never double counting', () => {
    const cutoff = T0 + 30000;
    const p = page(new Date(cutoff).toISOString(), [[T0, 1, 0, 100, 0]]);
    const trades = [{ time: T0 + 10000, price: 100, size: 5, sell: false }, { time: cutoff, price: 100, size: 2, sell: true }, { time: T0 + 70000, price: 100, size: 1, sell: false }];
    const out = mergeRecordedCvd({ from: T0, now: T0 + 80000, pages: [p], cutoff, trades })!;
    expect(out.map(b => b.coin)).toEqual([-1, 1]);
  });
  it('a missing page means loading, not an invented value', () => {
    expect(mergeRecordedCvd({ from: T0, now: T0, pages: [null], cutoff: null, trades: [] })).toBeNull();
  });
  it('1m minutes sum exactly into 15m and 1h candles', () => {
    const rows: [number, number, number, number, number][] = Array.from({ length: 60 }, (_, i) => [T0 + i * 60000, i % 3, 1, (i % 3) * 10, 10]);
    const m = mergeRecordedCvd({ from: T0, now: T0 + 4e6, pages: [page(null, rows)], cutoff: null, trades: [] })!;
    const q = aggregateDeltas(m, 15), h = aggregateDeltas(m, 60);
    expect(q.reduce((s, b) => s + b.coin, 0)).toBeCloseTo(h[0]!.coin);
    expect(h).toHaveLength(1);
  });
  it('fixed pages, capped at the cache size', () => {
    expect(cvdPagesFor(T0 + 1, T0 + CVD_PAGE_MS + 1)).toEqual([T0 / CVD_PAGE_MS, T0 / CVD_PAGE_MS + 1]);
    expect(cvdPagesFor(0, 100 * CVD_PAGE_MS)).toHaveLength(CVD_MAX_PAGES);
  });
  it('cutoff is the newest recorded second', () => {
    const closed = parseCvdPage({ first: null, cutoff: new Date(T0).toISOString(), minutes: [] }, T0 - CVD_PAGE_MS, T0, T0 + 3600000);
    expect(cvdLiveCutoff([closed, page(new Date(T0 + 5000).toISOString(), [])], T0 + 6000)).toBe(T0 + 5000);
  });
  it('candles before the recording start keep candle totals', () => {
    const older = [{ time: T0 - 900000, quote: 1, coin: 1, quoteHigh: 1, quoteLow: 0, coinHigh: 1, coinLow: 0, path: false }, { time: T0, quote: 9, coin: 9, quoteHigh: 9, quoteLow: 0, coinHigh: 9, coinLow: 0, path: false }];
    const rec = [{ ...older[1]!, coin: 2 }];
    expect(joinCvdBars(older, rec, T0, 15).map(b => b.coin)).toEqual([1, 2]);
  });
});
