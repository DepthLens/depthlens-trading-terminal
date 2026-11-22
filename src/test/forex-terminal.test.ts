import { describe, it, expect } from 'vitest';
import { restoreForexState, isSpotFx, fxTf, fxQuote, GOLD } from '@/lib/forex-terminal';
describe('forex terminal rules', () => {
  it('defaults to gold plus EUR/USD', () => { const s = restoreForexState(null); expect(s.tabs.map(t => t.symbol)).toEqual([GOLD, 'EUR/USD']); });
  it('keeps forex tabs and weekly timeframe, drops futures pairs', () => {
    const s = restoreForexState(JSON.stringify({ tabs: [{ symbol: 'BTCUSDT', minutes: 1 }, { symbol: 'GBP/USD', minutes: 10080 }, { symbol: 'EUR/USD', minutes: 5 }], active: 'GBP/USD', tools: { Heatmap: true } }));
    expect(s.tabs).toEqual([{ symbol: 'GBP/USD', minutes: 10080 }, { symbol: 'EUR/USD', minutes: 60 }]);
    expect(s.tools['Heatmap']).toBe(true);
  });
  it('spot pairs vs gold', () => { expect(isSpotFx('EUR/USD')).toBe(true); expect(isSpotFx(GOLD)).toBe(false); });
  it('maps minutes to forex timeframe', () => { expect(fxTf(240)).toBe('4h'); expect(fxTf(43200)).toBe('1M'); expect(fxTf(1)).toBe('1h'); });
  it('24h change from 1h closes', () => { const q = fxQuote([{ time: 0, close: 1 }, { time: 86400, close: 1.1 }]); expect(q?.change).toBeCloseTo(10); });
});
