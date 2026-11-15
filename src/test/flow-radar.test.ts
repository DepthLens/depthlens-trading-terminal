import { describe, expect, it } from 'vitest';
import { rollingRank, flowMomentum, simulate, scoreboard, tfPolicy, type Candle, type Features, type Outcome } from '@/lib/flow-radar-core';
import { parseKline, bucketCandles, baseInterval, restoreRadarSettings } from '@/lib/flow-radar';

const bar = (o: number, h: number, l: number, c: number): Candle => ({ t: 0, o, h, l, c, v: 1, delta: 0 });
const feats = (n: number, p: Partial<Features> = {}): Features => ({ atr: Array(n).fill(1), atrRank: Array(n).fill(0.6), vrk: Array(n).fill(0.5), drk: Array(n).fill(0.5), cl: Array(n).fill(0.5), low20: Array(n).fill(NaN), high20: Array(n).fill(NaN), ...p });

describe('flow radar core', () => {
  it('rollingRank uses average rank for ties and minPeriods', () => {
    expect(rollingRank([1, 2, 3], 3, 1)).toEqual([0.5, 0.75, 5 / 6]);
    expect(rollingRank([2, 2], 3, 1)[1]).toBe(0.5);
    expect(Number.isNaN(rollingRank([1, 2], 3, 3)[1])).toBe(true);
  });
  it('flowMomentum fires only on volume + delta extremes', () => {
    expect(flowMomentum(feats(1, { vrk: [0.95], drk: [0.95] }), 0)).toBe(1);
    expect(flowMomentum(feats(1, { vrk: [0.95], drk: [0.05] }), 0)).toBe(-1);
    expect(flowMomentum(feats(1, { vrk: [0.85], drk: [0.95] }), 0)).toBe(0);
    expect(flowMomentum(feats(1, { vrk: [0.95], drk: [0.95], atrRank: [0.3] }), 0, { q: 0.9, highVolOnly: true })).toBe(0);
  });
  const base = [bar(100, 101, 99, 100), bar(100, 100.5, 99.5, 100)];
  it('simulate hits target', () => { const o = simulate([...base, bar(100, 102, 99.8, 101)], feats(3), 0, 1)!; expect(o.exit).toBe('target'); expect(o.hit).toBe(true); expect(o.grossR).toBe(1); });
  it('simulate hits stop', () => { const o = simulate([...base, bar(100, 100.2, 98, 98.5)], feats(3), 0, 1)!; expect(o.exit).toBe('stop'); expect(o.grossR).toBe(-1); });
  it('same-candle tie goes to the stop', () => { const o = simulate([...base, bar(100, 103, 97, 100)], feats(3), 0, 1)!; expect(o.exit).toBe('stop'); expect(o.hit).toBe(false); });
  it('simulate times out', () => { const o = simulate([...base, bar(100, 100.3, 99.7, 100.2), bar(100.2, 100.4, 99.8, 100.1)], feats(4), 0, 1, 1, 2)!; expect(o.exit).toBe('timeout'); expect(o.exitIndex).toBe(3); });
  it('scoreboard sums, drawdown and verdict', () => {
    const t = (netR: number, hit: boolean) => ({ netR, grossR: netR, hit, riskPct: 0.01 }) as Outcome;
    const b = scoreboard([t(1, true), t(-1, false), t(-1, false), t(1, true)]);
    expect(b.n).toBe(4); expect(b.hitPct).toBe(50); expect(b.maxDrawdownR).toBe(2); expect(b.verdict).toBe('too few trades');
    expect(scoreboard(Array.from({ length: 30 }, () => t(0.1, true))).verdict).toBe('positive after fees');
  });
  it('tfPolicy: context below 3h, setup from 3h', () => {
    expect(tfPolicy(120).mode).toBe('context'); expect(tfPolicy(60).typicalFeeDragR).toBe(0.16);
    expect(tfPolicy(180).mode).toBe('setup'); expect(tfPolicy(240).measured).toBe(true); expect(tfPolicy(480).measured).toBe(false);
  });
});
describe('flow radar glue', () => {
  it('delta = 2*takerBuy - volume', () => expect(parseKline([0, '1', '2', '0.5', '1.5', '10', 0, 0, 0, '7']).delta).toBe(4));
  it('custom timeframe buckets', () => {
    expect(baseInterval(180)).toEqual([60, '1h']); expect(baseInterval(7)).toEqual([1, '1m']);
    const c = bucketCandles([0, 1, 2].map(i => ({ t: i * 60000, o: i, h: i + 1, l: i - 1, c: i, v: 1, delta: 1 })), 3);
    expect(c).toHaveLength(1); expect(c[0].v).toBe(3); expect(c[0].delta).toBe(3); expect(c[0].h).toBe(3);
  });
  it('settings defaults', () => expect(restoreRadarSettings(null)).toEqual({ q: 0.9, highVolOnly: false, rr: 1, maxBars: 24, watch: true }));
});
