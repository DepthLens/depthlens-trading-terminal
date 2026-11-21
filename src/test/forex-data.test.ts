import { describe, expect, it } from 'vitest';
import { aggregateFx, bucketStart, mergeFx, marketClosed, FOREX_PAIRS, FOREX_TFS } from '@/lib/forex-data';

const h = (iso: string, o: number, hi: number, lo: number, c: number) => ({ time: Date.parse(iso) / 1000, open: o, high: hi, low: lo, close: c });
describe('forex rules', () => {
  it('has 11 pairs and 5 timeframes', () => { expect(FOREX_PAIRS).toHaveLength(11); expect([...FOREX_TFS]).toEqual(['1h', '4h', '1d', '1w', '1M']); });
  it('weeks start Monday, months on the 1st (UTC)', () => {
    expect(bucketStart(Date.parse('2026-11-20T21:00:00Z') / 1000, '1w')).toBe(Date.parse('2026-11-16T00:00:00Z') / 1000);
    expect(bucketStart(Date.parse('2026-11-20T21:00:00Z') / 1000, '1M')).toBe(Date.parse('2026-11-01T00:00:00Z') / 1000);
  });
  it('builds 4h candles from 1h', () => {
    const out = aggregateFx([h('2026-11-20T20:00:00Z', 1, 2, .5, 1.5), h('2026-11-20T21:00:00Z', 1.5, 3, 1, 2), h('2026-11-21T00:00:00Z', 2, 2, 2, 2)], '4h');
    expect(out).toEqual([{ time: Date.parse('2026-11-20T20:00:00Z') / 1000, open: 1, high: 3, low: .5, close: 2 }, { time: Date.parse('2026-11-21T00:00:00Z') / 1000, open: 2, high: 2, low: 2, close: 2 }]);
  });
  it('rebuilds the last saved day from newer 1h candles', () => {
    const saved = [h('2026-11-19T00:00:00Z', 1, 1, 1, 1), h('2026-11-20T00:00:00Z', 1, 2, 1, 1.5)];
    const out = mergeFx(saved, [h('2026-11-20T00:00:00Z', 1, 2, 1, 1.5), h('2026-11-20T23:00:00Z', 1.5, 4, 1, 3), h('2026-11-23T00:00:00Z', 3, 3, 3, 3)], '1d');
    expect(out.map(b => b.close)).toEqual([1, 3, 3]); expect(out[1]!.high).toBe(4);
  });
  it('market is closed on Saturday and open on Monday', () => {
    expect(marketClosed(Date.parse('2026-11-21T13:00:00Z') / 1000)).toBe(true);
    expect(marketClosed(Date.parse('2026-11-23T13:00:00Z') / 1000)).toBe(false);
  });
});
