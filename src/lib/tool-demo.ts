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
export function demoWhales(bars:Bar[]):import('./whale-data').WhaleEvent[]{return bars.filter((_,i)=>i%3===0).map((b,i)=>({id:`demo-whale-${i}`,time:b.time+1000,lastTime:b.time+2000,side:i%2?'Sell':'Buy',price:(b.high+b.low)/2,lastPrice:(b.high+b.low)/2,quantity:1,notional:[50000,250000,1200000,100000][i%4]??50000,count:i+2}));}
/** Synthetic liquidations for ?demo=1 only; never stored. */
export function demoLiquidations(bars: Bar[]) {
  return bars.flatMap((b, i) => i % 3 === 0 ? [] : [0, 1, 2].filter(k => (i + k) % 2 === 0 || k === 0).map(k => {
    const side = (i + k) % 4 < 2 ? 'long' as const : 'short' as const, price = side === 'long' ? b.low + (b.high - b.low) * .15 * k : b.high - (b.high - b.low) * .15 * k;
    const notional = 8000 * (1 + ((i * 7 + k * 13) % 23)) * (i % 11 === 0 ? 12 : 1), qty = notional / price;
    return { id: `demo-liq-${i}-${k}`, time: b.time + 5000 + k * 9000, side, price, qty, notional };
  }));
}
