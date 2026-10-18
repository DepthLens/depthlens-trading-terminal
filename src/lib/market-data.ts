export type PriceSpec = { precision: number; minMove: number };
export type Market = { symbol: string; pricePrecision: number; filters: { filterType: string; tickSize?: string }[] };
export type Quote = { price: number; change: number; quoteVolume: number };
export function priceSpec(market: Market): PriceSpec {
  const tick = market.filters.find(f => f.filterType === 'PRICE_FILTER')?.tickSize;
  const minMove = Number(tick);
  const decimals = tick?.replace(/0+$/, '').split('.')[1]?.length ?? 0;
  const precision = Math.max(market.pricePrecision, decimals);
  return { precision, minMove: Number.isFinite(minMove) && minMove > 0 ? minMove : 10 ** -precision };
}
export function formatPrice(price: number, spec: PriceSpec): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: spec.precision, maximumFractionDigits: spec.precision });
}
const PINNED = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
export function sortMarkets(pairs: string[], quotes: Record<string, Quote>): string[] {
  return [...pairs].sort((a, b) => {
    const ai = PINNED.indexOf(a), bi = PINNED.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 3 : ai) - (bi < 0 ? 3 : bi);
    return (quotes[b]?.quoteVolume ?? 0) - (quotes[a]?.quoteVolume ?? 0) || a.localeCompare(b);
  });
}