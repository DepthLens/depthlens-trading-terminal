import { HeatmapBuffer } from './heatmap-data';
import { createStore, addTrade, addSegment } from './footprint-data';
import type { Bar } from './chart-data';
// Query-only, never writes any synthetic data to live caches or persistence.
export const toolDemoEnabled = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
export function demoBars(price: number, tick: number, minutes: number, now = Date.now()): Bar[] {
  const end = Math.floor(now / (minutes * 60000)) * minutes * 60000;
  const scale = Math.max(tick * 120, price * .0008);
  return Array.from({ length: 80 }, (_, i) => {
    const open = price + Math.sin(i * .8) * scale, close = price + Math.sin((i + 1) * .8) * scale;
    return { time: end - (79 - i) * minutes * 60000, open, close, high: Math.max(open, close) + scale * .65, low: Math.min(open, close) - scale * .65 };
  });
}
export function demoFootprint(bars: Bar[], tick: number) {
  const store = createStore(tick);
  bars.forEach((b, i) => {
    if (i % 7 === 0) return;
    for (let r = 0; r < 36; r++) {
      const price = b.low + (b.high - b.low) * (r + .5) / 36;
      const size = (1 + 8 * Math.exp(-(((r - 18) / 9) ** 2))) * (i % 3 + 1);
      addTrade(store, b.time + 1000, price, size * (r % 6 === 0 ? 5 : 1), r % 2 === 0);
      addTrade(store, b.time + 2000, price, size * (r % 6 === 1 ? 5 : 1), r % 2 !== 0);
    }
  });
  const first = bars[0], last = bars.at(-1);
  if (first && last) addSegment(store, first.time, last.time + 60000);
  return store;
}
export function demoHeatmap(price: number, bucket: number, now = Date.now()) {
  const buffer = new HeatmapBuffer(price, bucket), span = bucket * 150;
  for (let i = 0; i < 240; i++) {
    const bids = new Map<number, number>(), asks = new Map<number, number>();
    for (let r = -75; r <= 75; r++) {
      const p = price + r * bucket;
      const size = .2 + Math.exp(-(((r - 9 - Math.sin(i / 35) * 3) / 2) ** 2)) * 38 + Math.exp(-(((r + 13) / 4) ** 2)) * 10 + ((r * r + i) % 11) * .15;
      (r < 0 ? bids : asks).set(p, size);
    }
    const p = price + Math.sin(i / 18) * bucket * 5;
    if (i % 13 === 0) buffer.trade(p, 2, i % 26 === 0 ? 'Buy' : 'Sell');
    buffer.sample(now - (239 - i) * 1000, bids, asks, p);
  }
  return { buffer, span };
}