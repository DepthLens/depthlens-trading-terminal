import { describe, expect, it } from 'vitest';
import { RADAR_DEFAULT, breakeven, deltaRatio, findSetups, scoreSetups, shortTfWarning, type RadarBar } from '@/lib/flow-radar';
const H = 3600000;
const flat = (n: number, t0 = 0): RadarBar[] => Array.from({ length: n }, (_, i) => ({ time: t0 + i * H, open: 100, high: 100.5, low: 99.5, close: 100, volume: 10, takerBuy: 5 }));
describe('flow radar', () => {
  it('delta ratio and breakeven', () => { expect(deltaRatio({ ...flat(1)[0]!, volume: 10, takerBuy: 6 })).toBeCloseTo(0.2); expect(breakeven(2)).toBeCloseTo(33.33, 1); });
  it('buy momentum when vz>=1.5 and dr>=0.2, wins at 2R', () => {
    const b = flat(30); b[24] = { ...b[24]!, volume: 15, takerBuy: 9, low: 99.5, close: 100 }; b[25] = { ...b[25]!, high: 102 };
    const s = findSetups(b, RADAR_DEFAULT); expect(s).toHaveLength(1); expect(s[0]!.side).toBe('buy'); expect(s[0]!.outcome).toBe('win');
    expect(s[0]!.stop).toBeCloseTo(99.5 * 0.9997);
  });
  it('vz below 1.5 gives no setup', () => { const b = flat(30); b[24] = { ...b[24]!, volume: 14, takerBuy: 10 }; expect(findSetups(b, RADAR_DEFAULT)).toHaveLength(0); });
  it('skips stops under 0.15% or over 2%', () => {
    const b = flat(30); b[24] = { ...b[24]!, volume: 20, takerBuy: 14, low: 99.95 }; expect(findSetups(b, RADAR_DEFAULT)).toHaveLength(0);
    b[24] = { ...b[24]!, low: 97 }; expect(findSetups(b, RADAR_DEFAULT)).toHaveLength(0);
  });
  it('sell momentum hits stop = loss with fees', () => {
    const b = flat(30); b[24] = { ...b[24]!, volume: 15, takerBuy: 6 }; b[26] = { ...b[26]!, high: 101 };
    const [x] = findSetups(b, RADAR_DEFAULT); expect(x.side).toBe('sell'); expect(x.outcome).toBe('loss'); expect(x.resultR!).toBeLessThan(-1);
  });
  it('trapped sweep sell above previous day high, only first per day', () => {
    const b = flat(48); b[30] = { ...b[30]!, high: 101, close: 100, volume: 10, takerBuy: 6 }; b[31] = { ...b[31]!, high: 101, close: 100, takerBuy: 6 };
    const s = findSetups(b, { ...RADAR_DEFAULT, momentum: false, sweep: true }); expect(s.filter(x => x.side === 'sell')).toHaveLength(1);
  });
  it('score accuracy and short timeframe warning', () => {
    const sc = scoreSetups([{ kind: 'momentum', side: 'buy', time: 0, entry: 1, stop: 0.99, target: 1.02, outcome: 'win', resultR: 1.9 }, { kind: 'momentum', side: 'buy', time: 0, entry: 1, stop: 0.99, target: 1.02, outcome: 'loss', resultR: -1.1 }], 'momentum', RADAR_DEFAULT, 30 * 86400000);
    expect(sc.accuracy).toBe(50); expect(sc.perMonth).toBe(2); expect(sc.avgR).toBeCloseTo(0.4);
    expect(shortTfWarning('15m')).toBe(true); expect(shortTfWarning('1h')).toBe(false);
  });
});
