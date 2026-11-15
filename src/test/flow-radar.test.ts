import { describe, expect, it } from 'vitest';
import { computeFeatures, flowMomentum, rollingRank, scan, scoreboard, simulate, tfPolicy, type Candle, type Features, type Outcome } from '@/lib/flow-radar-core';
import { aggregateRadar, parseKline, RADAR_DEFAULT, restoreRadarSettings } from '@/lib/flow-radar';
const candles = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ t: i * 60000, o: 100, h: 100.5, l: 99.5, c: 100, v: 10, delta: 0 }));
const features = (): Features => ({ atr: [1], atrRank: [.5], vrk: [.95], drk: [.95], cl: [.5], low20: [99], high20: [101] });
const outcome = (hit: boolean, netR: number): Outcome => ({ i: 0, side: 1, entry: 100, stop: 99, target: 101, riskPct: .01, grossR: netR + .08, netR, hit, exit: hit ? 'target' : 'stop', exitIndex: 1 });
describe('Flow Radar exact v2 rules', () => {
  it('rollingRank includes self, averages ties, ignores NaN and waits for minPeriods', () => {
    const r = rollingRank([1, 2, 2, NaN, 0], 3, 2);
    expect(r[0]).toBeNaN(); expect(r[1]).toBe(1); expect(r[2]).toBeCloseTo(5 / 6); expect(r[3]).toBeNaN(); expect(r[4]).toBe(.5);
  });
  it('flowMomentum requires both adaptive extremes at q .9', () => {
    const f = features(); expect(flowMomentum(f, 0)).toBe(1);
    f.drk[0] = .05; expect(flowMomentum(f, 0)).toBe(-1);
    f.vrk[0] = .89; expect(flowMomentum(f, 0)).toBe(0);
  });
  it('high-volatility gate requires ATR rank at least .5', () => {
    const f = features(); f.atrRank[0] = .49; expect(flowMomentum(f, 0, { q: .9, highVolOnly: true })).toBe(0);
    f.atrRank[0] = .5; expect(flowMomentum(f, 0, { q: .9, highVolOnly: true })).toBe(1);
  });
  it('simulate enters next open, uses .03% buffer and charges .08% fees on target', () => {
    const c = candles(4); c[1].h = 102;
    const o = simulate(c, features(), 0, 1);
    expect(o?.entry).toBe(100); expect(o?.stop).toBeCloseTo(99.5 * .9997); expect(o?.exit).toBe('target'); expect(o?.grossR).toBe(1);
    expect(o?.netR).toBeCloseTo(1 - .08 / (100 - 99.5 * .9997));
  });
  it('simulate stops a buy', () => { const c = candles(4); c[1].l = 98; expect(simulate(c, features(), 0, 1)?.exit).toBe('stop'); expect(simulate(c, features(), 0, 1)?.grossR).toBe(-1); });
  it('same candle target/stop tie goes to stop', () => { const c = candles(4); c[1].h = 103; c[1].l = 97; expect(simulate(c, features(), 0, 1)?.exit).toBe('stop'); });
  it('timeout closes at last close and max bars follows exact core', () => { const c = candles(5); c[3].c = 100.1; const o = simulate(c, features(), 0, 1, 1, 2); expect(o?.exit).toBe('timeout'); expect(o?.exitIndex).toBe(3); expect(o?.grossR).toBeCloseTo(.1 / (100 - 99.5 * .9997)); });
  it('sell target and stop use the opposite extremes', () => { const c = candles(4); c[1].l = 98; expect(simulate(c, features(), 0, -1)?.exit).toBe('target'); c[1].h = 102; expect(simulate(c, features(), 0, -1)?.exit).toBe('stop'); });
  it('scoreboard returns target-hit interval, drawdown and honest sample verdict', () => {
    const b = scoreboard([outcome(true, .92), outcome(false, -1.08)]);
    expect(b.n).toBe(2); expect(b.hitPct).toBe(50); expect(b.hitCiLo).toBeCloseTo(9.453, 2); expect(b.hitCiHi).toBeCloseTo(90.547, 2);
    expect(b.avgNetR).toBeCloseTo(-.08); expect(b.maxDrawdownR).toBeCloseTo(1.08); expect(b.medianRiskPct).toBe(.01); expect(b.verdict).toBe('too few trades');
    expect(scoreboard(Array.from({ length: 30 }, () => outcome(true, .92))).verdict).toBe('positive after fees');
    expect(scoreboard(Array.from({ length: 30 }, () => outcome(false, -1.08))).verdict).toBe('not positive after fees'); expect(scoreboard([]).hitPct).toBeNaN();
  });
  it('tfPolicy is Watch-only below 3h, measured 3h/4h/12h, honest on untested', () => {
    for (const m of [1, 60, 120]) expect(tfPolicy(m).mode).toBe('context');
    for (const m of [180, 240, 720]) { expect(tfPolicy(m).mode).toBe('setup'); expect(tfPolicy(m).measured).toBe(true); }
    expect(tfPolicy(60).typicalFeeDragR).toBe(.16); expect(tfPolicy(300).measured).toBe(false); expect(tfPolicy(1440).note).toContain('not reliable');
    expect(scan(candles(210), 120).setups).toHaveLength(0);
  });
  it('parses field 9 base taker volume and aggregates Custom OHLC/volume/delta', () => {
    const a = parseKline([0, 100, 102, 99, 101, 10, 59999, 0, 0, 7]);
    expect(a.delta).toBe(4);
    const b = { ...a, t: 60000, h: 103, l: 98, c: 102, v: 20, delta: -6 };
    expect(aggregateRadar([a, b], 7)).toEqual([{ ...a, h: 103, l: 98, c: 102, v: 30, delta: -2 }]);
  });
  it('saved settings default to q .9, high-vol off, R 1, 24 bars and Watch on', () => {
    expect(restoreRadarSettings(null)).toEqual(RADAR_DEFAULT);
    expect(restoreRadarSettings('{"q":0.95,"maxBars":12,"showWatch":false}')).toMatchObject({ q: .95, maxBars: 12, showWatch: false });
    expect(restoreRadarSettings('{"q":0.7,"rr":0,"maxBars":-1}')).toEqual(RADAR_DEFAULT);
    expect(computeFeatures(candles(13)).atr[12]).toBeNaN();
  });
});
