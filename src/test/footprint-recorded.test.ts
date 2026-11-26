import { describe, expect, it, beforeEach } from 'vitest';
import { baseTicks, clearFootprintPages, effectiveGroup, pageCount, pagesFor, pageSpan, parsePage, putPage, recordedCandle, MAX_PAGES, liveCutoff } from '@/lib/footprint-recorded';

const H = 3600000, T0 = Date.UTC(2026, 10, 26, 11, 0); // 11:00 UTC, page-aligned for 1m (1h pages)
const tick = 0.1;
// bin for 1m is 5 ticks = 0.5 USDT
function page1m(from: number, minutes: [number, [number, number, number][]][], cutoff: string | null, closed = true) {
  const p = parsePage({ first: new Date(from).toISOString(), cutoff, minutes }, from, from + H, closed ? from + 2 * H : from + 30 * 60000);
  putPage(5, Math.floor(from / H), p);
}

describe('recorded footprint', () => {
  beforeEach(() => clearFootprintPages());

  it('groups recorded minutes into exact candles; delta = buy − sell of its levels', () => {
    page1m(T0, [[T0, [[200000, 2, 1], [200001, 0.5, 3]]], [T0 + 60000, [[200000, 1, 1]]], [T0 + 300000, [[200002, 9, 9]]]], new Date(T0 + H).toISOString());
    const r = recordedCandle({ start: T0, minutes: 5, tick, group: 10, ratio: 300, unit: 'coin', recStart: T0 - H, tail: { start: null, trades: [] }, now: T0 + 2 * H });
    // 5m uses 10-tick bins; the page was put at 5-tick bins so it is "loading" for 5m
    expect(r.kind).toBe('loading');
    const r1 = recordedCandle({ start: T0, minutes: 1, tick, group: 5, ratio: 300, unit: 'coin', recStart: T0 - H, tail: { start: null, trades: [] }, now: T0 + 2 * H });
    expect(r1.kind).toBe('ok');
    if (r1.kind !== 'ok') return;
    expect(r1.candle.ask).toBeCloseTo(2.5); expect(r1.candle.bid).toBeCloseTo(4);
    expect(r1.candle.rows.reduce((a, x) => a + x.ask - x.bid, 0)).toBeCloseTo(r1.candle.ask - r1.candle.bid);
    expect(r1.candle.coverage).toBe('full');
  });

  it('regroups the same minutes for a longer candle without new data', () => {
    // 15m bins are 20 ticks; put a 2h page at bin 20
    const p = parsePage({ first: null, cutoff: null, minutes: [[T0, [[50000, 1, 2]]], [T0 + 14 * 60000, [[50001, 3, 0]]], [T0 + 15 * 60000, [[50001, 7, 7]]]] }, T0 - H, T0 + H, T0 + 3 * H);
    putPage(20, Math.floor((T0 - H) / pageSpan(20)), p);
    const r = recordedCandle({ start: T0, minutes: 15, tick, group: 1, ratio: 300, unit: 'coin', recStart: T0 - 2 * H, tail: { start: null, trades: [] }, now: T0 + 3 * H });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') { expect(r.candle.ask + r.candle.bid).toBeCloseTo(6); expect(r.candle.rows[0]?.high! - r.candle.rows[0]?.low!).toBeCloseTo(2); }
  });

  it('candles before the recording start are reported as not recorded', () => {
    expect(recordedCandle({ start: T0 - 120000, minutes: 1, tick, group: 5, ratio: 300, unit: 'coin', recStart: T0, tail: { start: null, trades: [] } }).kind).toBe('before');
  });

  it('live candle adds only trades at/after the recorded cutoff (no double count)', () => {
    const cutoff = T0 + 30 * 60000 + 20000; // 11:30:20
    page1m(T0, [[T0 + 30 * 60000, [[200000, 1, 0]]]], new Date(cutoff).toISOString(), false);
    expect(liveCutoff(5, T0 + 31 * 60000)).toBe(cutoff);
    const trades = [{ time: cutoff - 500, price: 10000.05, size: 5, sell: false }, { time: cutoff, price: 10000.05, size: 2, sell: true }, { time: cutoff + 1000, price: 10000.05, size: 1, sell: false }];
    const r = recordedCandle({ start: T0 + 30 * 60000, minutes: 1, tick, group: 5, ratio: 300, unit: 'coin', recStart: T0, tail: { start: cutoff - 5000, trades }, now: T0 + 30 * 60000 + 40000 });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') { expect(r.candle.ask).toBeCloseTo(2); expect(r.candle.bid).toBeCloseTo(2); expect(r.candle.coverage).toBe('full'); }
  });

  it('only visible pages are requested and memory stays bounded', () => {
    expect(pagesFor(T0, T0 + 30 * 60000, baseTicks(1))).toEqual([Math.floor(T0 / H)]);
    for (let i = 0; i < MAX_PAGES + 20; i++) putPage(5, i, parsePage({ first: null, cutoff: null, minutes: [] }, i * H, (i + 1) * H, 1e15));
    expect(pageCount()).toBe(MAX_PAGES);
    expect(effectiveGroup(37, 5)).toBe(40); expect(effectiveGroup(2, 5)).toBe(5);
  });
});
