import { describe, expect, it } from 'vitest';
import { bubbleRadius, bubbleVolume, dominantBubble } from '@/lib/heatmap-bubbles';
import { HeatmapBuffer } from '@/lib/heatmap-data';
import { restoreHeatmapUnit } from '@/lib/terminal-state';

describe('heatmap trade bubble rules', () => {
  it('uses square-root volume scaling, small retail dots and capped block sizes', () => {
    expect(bubbleRadius(5000, 0)).toBe(2);
    expect(bubbleRadius(80000, 0)).toBe(2);
    expect(bubbleRadius(320000, 0)).toBe(4);
    expect(bubbleRadius(1280000, 0)).toBe(8);
    expect(bubbleRadius(100000000, 0)).toBe(18);
  });
  it('preserves the minimum bubble filter', () => {
    expect(bubbleRadius(9999, 10000)).toBe(0);
    expect(bubbleRadius(10000, 10000)).toBe(2);
  });
  it('combines coinciding sides into one dominant-side dot', () => {
    expect(dominantBubble({ buy: 200, sell: 300 })).toEqual({ buy: false, notional: 500 });
  });
  it('displays exact selected coin volume without changing the notional sizing', () => {
    const trade = { buy: 200, sell: 512, buyCoin: 2, sellCoin: 5 };
    expect(bubbleVolume(trade, 101, 'BTC')).toBe(7);
    expect(bubbleVolume(trade, 101, 'USDT')).toBe(712);
    expect(restoreHeatmapUnit('BTC')).toBe('BTC');
    expect(restoreHeatmapUnit(null)).toBe('USDT');
  });
  it('keeps live quantities and trade counts through bucket changes', () => {
    const buffer = new HeatmapBuffer(100, 1);
    buffer.trade(100, 2, 'Buy', 3); buffer.trade(103, 4, 'Sell', 2);
    buffer.sample(1000, new Map(), new Map(), 103);
    buffer.configureBucket(10);
    const cell = buffer.columns[0]?.trades.get(10);
    expect(cell?.buyCoin).toBe(2); expect(cell?.sellCoin).toBe(4); expect(cell?.count).toBe(5);
    expect(cell?.buy).toBe(200); expect(cell?.sell).toBe(412);
  });
});
import { bubbleBuyShare } from '@/lib/heatmap-bubbles';
describe('bubbleBuyShare', () => {
  it('returns the buy fraction of total aggressive volume', () => {
    expect(bubbleBuyShare({ buy: 75, sell: 25 } as never)).toBe(0.75);
    expect(bubbleBuyShare({ buy: 0, sell: 0 } as never)).toBe(0);
  });
});
