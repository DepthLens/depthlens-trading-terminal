export const MARKET_ROW_HEIGHT = 48;
export function visibleMarketRange(count: number, scrollTop: number, height: number) {
  const start = Math.min(count, Math.max(0, Math.floor(scrollTop / MARKET_ROW_HEIGHT)));
  return { start, end: Math.min(count, Math.ceil((scrollTop + height) / MARKET_ROW_HEIGHT)) };
}
