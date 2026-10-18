import { describe, expect, it } from 'vitest';
import { formatPrice, priceSpec, sortMarkets } from '@/lib/market-data';
describe('Binance market rules', () => {
  it('keeps a 0.0000123 price nonzero with exchange precision and tick size', () => {
    const spec = priceSpec({ symbol: 'LOWUSDT', pricePrecision: 7, filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.00000010' }] });
    expect(spec).toEqual({ precision: 7, minMove: 0.0000001 });
    expect(formatPrice(0.0000123, spec)).toBe('0.0000123');
  });
  it('pins BTC, ETH, BNB before descending 24h quote volume', () => {
    const quote = (quoteVolume: number) => ({ price: 1, change: 0, quoteVolume });
    expect(sortMarkets(['DOGEUSDT', 'BNBUSDT', 'LOWUSDT', 'ETHUSDT', 'BTCUSDT'], { DOGEUSDT: quote(10), LOWUSDT: quote(20) }))
      .toEqual(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'LOWUSDT', 'DOGEUSDT']);
  });
});