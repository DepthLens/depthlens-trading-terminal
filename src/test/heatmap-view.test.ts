import { describe, expect, it } from 'vitest';
import { colorFor, ROWS, type Column } from '@/lib/heatmap-data';
import { RecordedDecodeCache, capBubbles, colorLut, fillColumn, viewSlots, windowSlotCount } from '@/lib/heatmap-view';
import { snapshotsToColumns, type RecordedSnapshot } from '@/lib/heatmap-recorded';

const row = (t: number): RecordedSnapshot => ({ ts: new Date(t).toISOString(), source: 'binance', mid: 100, step: 1, base: 25, bids: Array(75).fill(1), asks: Array(75).fill(1), trade_levels: [[100, 1, 0, 1, 0]], price_points: [[0, 100]] });

describe('heatmap view (screen-sized loading)', () => {
  it('15m uses 900 seconds even when only two minutes of data exist', () => {
    expect(windowSlotCount(15)).toBe(900);
    expect(viewSlots(1200, windowSlotCount(15)).colW).toBe(3);
    expect(viewSlots(1200, 120).colW).toBe(10);
  });
  it('5m and paged 4h retain their selected time scales', () => {
    expect(windowSlotCount(5)).toBe(300);
    expect(windowSlotCount(240, 5)).toBe(2880);
  });
  it('4h window at 5s on a 1200px plot builds only the visible slots plus margin, same column width', () => {
    const v = viewSlots(1200, 2880);
    expect(v.colW).toBe(3);
    expect(v.visible).toBe(401);
    expect(v.build).toBe(701);
  });
  it('5m window keeps every one-second column (zoomed in looks the same)', () => {
    const v = viewSlots(1200, 300);
    expect(v.build).toBe(300);
    expect(v.colW).toBe(4);
  });
  it('phone width builds far fewer columns', () => {
    expect(viewSlots(390, 2880).visible).toBe(131);
  });
  it('palette lookup matches the colour scale within one level', () => {
    const lut = colorLut();
    for (const t of [0, .1, .33, .5, .77, 1]) {
      const i = Math.round(t * 4095) * 3, [r, g, b] = colorFor(t);
      expect(Math.abs((lut[i] ?? 0) - r)).toBeLessThanOrEqual(1);
      expect(Math.abs((lut[i + 1] ?? 0) - g)).toBeLessThanOrEqual(1);
      expect(Math.abs((lut[i + 2] ?? 0) - b)).toBeLessThanOrEqual(1);
    }
  });
  it('fillColumn keeps price-only columns transparent and big sizes opaque', () => {
    const data = new Float32Array(ROWS); data[10] = 1000;
    const col: Column = { time: 0, origin: 0, data, trades: new Map(), price: 1, gap: false };
    const px = new Uint8ClampedArray(4 * 20);
    fillColumn(px, 1, 0, col, 20, 19, 1, 1, 1000, 1);
    expect(px[(19 - 10) * 4 + 3]).toBe(255);
    fillColumn(px, 1, 0, { ...col, priceOnly: true }, 20, 19, 1, 1, 1000, 1);
    expect(px[(19 - 10) * 4 + 3]).toBe(0);
  });
  it('caps zoomed-out bubbles at 3,000, keeping the largest', () => {
    const list = Array.from({ length: 5000 }, (_, i) => ({ radius: i }));
    const out = capBubbles(list);
    expect(out).toHaveLength(3000);
    expect(Math.min(...out.map(b => b.radius))).toBe(2000);
  });
  it('decodes only rows in the requested range and reuses them on the way back', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(i * 5000));
    const cache = new RecordedDecodeCache(6000);
    let decoded = 0;
    const decode = (r: RecordedSnapshot) => { decoded++; return snapshotsToColumns([r], 1); };
    const out: Column[] = [];
    cache.beginPass();
    expect(cache.collect('p', rows, 100000, 200000, decode, { left: 400 }, out)).toBe(true);
    expect(decoded).toBeLessThanOrEqual(22);
    expect(out.every(c => c.time >= 100000 && c.time < 200000)).toBe(true);
    const before = decoded; cache.beginPass();
    cache.collect('p', rows, 100000, 200000, decode, { left: 400 }, []);
    expect(decoded).toBe(before);
  });
  it('memory stays bounded when scrolling through many pages', () => {
    const cache = new RecordedDecodeCache(2000);
    for (let p = 0; p < 30; p++) {
      const rows = Array.from({ length: 200 }, (_, i) => row(p * 1e6 + i * 5000));
      cache.beginPass();
      cache.collect(`p${p}`, rows, p * 1e6, p * 1e6 + 1e6, r => snapshotsToColumns([r], 1), { left: 400 }, []);
    }
    expect(cache.size).toBeLessThanOrEqual(2000);
  });
  it('stops at the per-frame decode budget and finishes on the next call', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(i * 5000));
    const cache = new RecordedDecodeCache(20000);
    cache.beginPass();
    expect(cache.collect('p', rows, 0, 5e6, r => snapshotsToColumns([r], 1), { left: 100 }, [])).toBe(false);
    cache.beginPass();
    expect(cache.collect('p', rows, 0, 5e6, r => snapshotsToColumns([r], 1), { left: 1000 }, [])).toBe(true);
  });
});

describe('markers stay exact after the speed-up', () => {
  it('absorption percentile uses the same sliding window of the last 2,000 bursts', async () => {
    const { MarkerEngine } = await import('@/lib/heatmap-markers');
    const mk = (t: number, buy: number, price: number): Column => ({ time: t * 1000, origin: 0, data: new Float32Array(ROWS).fill(1), trades: new Map([[100, { buy, sell: 0 }]]), price, gap: false });
    const cols = Array.from({ length: 2600 }, (_, i) => mk(i, i === 2500 ? 1e9 : 1 + (i % 97), 100.5));
    const e = new MarkerEngine();
    e.process(cols, 1, 0, { pulled: false, iceberg: false, absorption: true }, 1000);
    expect(e.markers.some(m => m.kind === 'absorption' && m.time === 2500 * 1000)).toBe(true);
  });
});
