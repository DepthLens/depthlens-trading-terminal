import type { HeatTrade } from './heatmap-data';
import type { HeatmapUnit } from './terminal-state';

// A fixed notional scale makes live and recorded dots comparable across windows and units.
export function bubbleRadius(notional: number, minimum: number): number {
  if (!(notional > 0) || notional < minimum) return 0;
  return Math.min(24, Math.max(2, Math.sqrt(notional / 5000)));
}
export function dominantBubble(trade: HeatTrade): { buy: boolean; notional: number } {
  return { buy: trade.buy >= trade.sell, notional: trade.buy + trade.sell };
}
export function bubbleVolume(trade: HeatTrade, price: number, unit: HeatmapUnit): number {
  return unit === 'USDT' ? trade.buy + trade.sell : (trade.buyCoin ?? trade.buy / price) + (trade.sellCoin ?? trade.sell / price);
}
export function bubbleNumber(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(value < 10 ? 2 : 1);
}// Share of aggressive buying (0–1) used to split a sphere into buy/sell portions.
export function bubbleBuyShare(trade: HeatTrade): number {
  const total = trade.buy + trade.sell;
  return total > 0 ? trade.buy / total : 0;
}
