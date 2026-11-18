import { describe, it, expect } from 'vitest';
import { higherTfs, closeCandleTime, splitForming } from '@/lib/flow-radar-mtf';
describe('flow radar mtf', () => {
  it('picks bigger exact multiples', () => {
    expect(higherTfs(15).map(x => x.tf)).toEqual(['1h', '4h']);
    expect(higherTfs(60).map(x => x.tf)).toEqual(['4h']);
    expect(higherTfs(240)).toEqual([]); expect(higherTfs(7)).toEqual([]);
  });
  it('1h 10:00 lands on 10:45 15m candle', () => {
    const t = Date.UTC(2026, 0, 1, 10); expect(closeCandleTime(t, 60, 15)).toBe(t / 1000 + 2700);
  });
  it('splits the forming candle', () => {
    const b = { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1, takerBuy: 0 } as never;
    expect(splitForming([b], 60, 1000).forming).not.toBeNull();
    expect(splitForming([b], 60, 3600001).forming).toBeNull();
  });
});
