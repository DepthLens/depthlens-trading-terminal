import { describe, expect, it } from 'vitest';
import { addLiveTrade, addSegment, addTrade, autoGroup, buildCandle, coverage, createStore, lastGap, prune, restoreFootprintSettings, rowOf } from '@/lib/footprint-data';

describe('footprint data', () => {
  it('splits seller aggressor into bid and buyer into ask on a fixed tick grid', () => {
    const s = createStore(0.1);
    addTrade(s, 60000, 100.05, 2, true);
    addTrade(s, 60500, 100.09, 3, false);
    const c = buildCandle(s, 60000, 1, 1, 300);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]).toMatchObject({ bid: 2, ask: 3 });
    expect(c.rows[0]!.low).toBeCloseTo(100.0);
    expect(rowOf(100.1, 0.1)).toBe(1001);
  });
  it('builds any timeframe by summing 1m buckets and merges rows by grouping', () => {
    const s = createStore(1);
    addTrade(s, 0, 10, 1, false); addTrade(s, 60000, 11, 1, false); addTrade(s, 120000, 14, 5, true);
    const c = buildCandle(s, 0, 3, 5, 300);
    expect(c.rows.map(r => [r.low, r.high, r.ask, r.bid])).toEqual([[10, 15, 2, 5]]);
    expect(buildCandle(s, 0, 2, 1, 300).ask).toBe(2);
  });
  it('flags diagonal imbalance at the default 300% ratio', () => {
    const s = createStore(1);
    addTrade(s, 0, 10, 1, true); addTrade(s, 0, 11, 3, false);
    const c = buildCandle(s, 0, 1, 1, 300);
    expect(c.rows.find(r => r.low === 11)!.askImb).toBe(true);
    expect(buildCandle(s, 0, 1, 1, 350).rows.find(r => r.low === 11)!.askImb).toBe(false);
  });
  it('drops data older than 24 hours', () => {
    const s = createStore(1), now = 3 * 86400000;
    addTrade(s, now - 86400000 - 120000, 10, 1, false); addTrade(s, now - 1000, 10, 1, false);
    prune(s, now);
    expect(s.minutes.size).toBe(1);
  });
  it('marks partial coverage and finds the latest uncovered gap', () => {
    const s = createStore(1);
    addLiveTrade(s, 90000, 10, 1, false); addLiveTrade(s, 119000, 10, 1, false);
    expect(coverage(s, 60000, 120000)).toBe('partial');
    expect(lastGap(s, 0, 90000)).toEqual([0, 90000]);
    addSegment(s, 30000, 90000);
    expect(lastGap(s, 0, 90000)).toEqual([0, 30000]);
  });
  it('clamps the imbalance ratio to 150–500% and auto-grouping keeps rows readable', () => {
    expect(restoreFootprintSettings('{"ratio":900}').ratio).toBe(500);
    expect(restoreFootprintSettings(null)).toMatchObject({ mode: 'bidask', ratio: 300 });
    expect(autoGroup(0.1, 10, 9)).toBe(10);
  });
});
import { autoRowTicks } from '@/lib/footprint-data';
describe('footprint auto row size', () => {
  it('uses average range / 12 rounded to ticks', () => { expect(autoRowTicks(6, 0.1)).toBe(5); expect(autoRowTicks(120, 1)).toBe(10); });
  it('never goes below one tick', () => { expect(autoRowTicks(0.3, 0.1)).toBe(1); expect(autoRowTicks(0, 0.1)).toBe(1); });
  it('never exceeds one sixth of the average range', () => { expect(autoRowTicks(0.65, 0.1) * 0.1).toBeLessThanOrEqual(0.65 / 6 + 1e-9); });
});
