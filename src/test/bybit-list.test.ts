import { describe, expect, it } from 'vitest';
import { bybitListQuotes } from '@/lib/market-data';
describe('bybitListQuotes', () => {
  it('converts Bybit fractional 24h change to percent', () => {
    const q = bybitListQuotes({ retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '100000', price24hPcnt: '0.0123', turnover24h: '5' }] } });
    expect(q?.['BTCUSDT']?.change).toBeCloseTo(1.23, 6);
    expect(q?.['BTCUSDT']?.price).toBe(100000);
  });
  it('returns null on a failed response', () => { expect(bybitListQuotes({ retCode: 10001 })).toBeNull(); });
});
