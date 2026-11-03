import { describe, expect, it } from 'vitest';
import { scoreBar } from '@/lib/price-pressure';
import { attackInfo, barHeight, combinedSentence, controlInfo, Hold, liveCandleCounts, restoreFlowBars, S_NO_ATTACK, S_NOBODY } from '@/lib/flow-bars';

const s = (pressure: number, direction: number, close = 0, wick = 0) => ({ ...scoreBar({ time: 0, open: 1, high: 1, low: 1, close: 1 }, 1), pressure, direction, close, wick });

describe('Control & Attack bars', () => {
  it('scores the reference candle', () => {
    const r = scoreBar({ time: 0, open: 100, high: 110, low: 95, close: 108 }, 1);
    expect(r.body).toBeCloseTo(0.5333, 4); expect(r.close).toBeCloseTo(0.7333, 4); expect(r.wick).toBeCloseTo(0.2, 4); expect(r.pressure).toBeCloseTo(0.52, 4);
  });
  it('zero range gives zero scores', () => { expect(scoreBar({ time: 0, open: 5, high: 5, low: 5, close: 5 }, 1).pressure).toBe(0); });
  it('control states and buyer share over last N', () => {
    expect(controlInfo([s(0.5, 1), s(-0.1, -1), s(0.3, 1)], 20).state).toBe('BUYERS');
    expect(controlInfo([s(-0.5, -1), s(0.1, 1), s(-0.3, -1)], 20).state).toBe('SELLERS');
    expect(controlInfo([s(0.5, -1), s(0.1, -1)], 20).state).toBe('BALANCED');
    expect(controlInfo([s(0.3, 1), s(-0.1, -1)], 20).buyShare).toBeCloseTo(0.75);
    expect(controlInfo([s(-9, -1), s(0.3, 1)], 1).state).toBe('BUYERS');
  });
  it('attack states use the threshold and live/closed candle', () => {
    const sc = [s(-0.3, -1), s(0.25, 1)];
    expect(attackInfo(sc, true, 0.25)!.state).toBe('BUYERS');
    expect(attackInfo(sc, false, 0.25)!.state).toBe('SELLERS');
    expect(attackInfo([s(0, 0), s(0.2, 1)], true, 0.25)!.state).toBe('NONE');
    expect(attackInfo([s(0, 0), s(3, 1)], true, 0.25)!.strength).toBe(1);
  });
  it('live candle counts only after 20% of its time', () => {
    expect(liveCandleCounts(0, 1, 11999)).toBe(false); expect(liveCandleCounts(0, 1, 12000)).toBe(true); expect(liveCandleCounts(0, 5, 59000)).toBe(false);
  });
  it('sentence table', () => {
    expect(combinedSentence('BUYERS', 'BUYERS', { close: 0, wick: 0 })).toBe('Buyers control the market and are pushing higher. The up trend is continuing.');
    expect(combinedSentence('BUYERS', 'SELLERS', { close: 0, wick: 0 })).toBe('Buyers control the market. Sellers are attacking, but price held, so buyers are absorbing the selling. Bullish.');
    expect(combinedSentence('BUYERS', 'SELLERS', { close: -0.5, wick: 0.1 })).toBe('Buyers control the market, but sellers are winning this candle. Buyer control may be ending. Be careful.');
    expect(combinedSentence('SELLERS', 'SELLERS', { close: 0, wick: 0 })).toBe('Sellers control the market and are pushing lower. The down trend is continuing.');
    expect(combinedSentence('SELLERS', 'BUYERS', { close: 0, wick: 0 })).toBe('Sellers control the market. Buyers are attacking, but the push was rejected, so sellers are absorbing the buying. Bearish.');
    expect(combinedSentence('SELLERS', 'BUYERS', { close: 0.5, wick: 0 })).toBe('Sellers control the market, but buyers are winning this candle. A reversal may be starting. Wait for confirmation.');
    expect(combinedSentence('BALANCED', 'BUYERS', { close: 0, wick: 0 })).toBe(S_NOBODY);
    expect(combinedSentence('BUYERS', 'NONE', { close: 0, wick: 0 })).toBe(S_NO_ATTACK);
  });
  it('holds a new state for 2 updates', () => {
    const h = new Hold<string>(); h.update('A', 0);
    expect(h.update('B', 1000)).toBe('A'); expect(h.update('A', 2000)).toBe('A');
    expect(h.update('B', 3000)).toBe('A'); expect(h.update('B', 4000)).toBe('B');
  });
  it('layout heights and saved defaults', () => {
    expect(barHeight(false, false, true)).toBe(36); expect(barHeight(true, false, true)).toBe(40); expect(barHeight(true, false, false)).toBe(36);
    expect(restoreFlowBars(null)).toMatchObject({ lookback: 20, threshold: 0.25, sentences: true });
  });
});
