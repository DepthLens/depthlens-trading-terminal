import { describe, expect, it } from 'vitest';
import { HeatmapBuffer, MAX_COLUMNS, ROWS } from '@/lib/heatmap-data';

describe('HeatmapBuffer history rules', () => {
  it('price-only columns carry trades and price but no book data', () => {
    const b = new HeatmapBuffer(100000);
    b.priceColumn(1000, 100000, new Map([[b.index(100000), { buy: 5000, sell: 0 }]]));
    const col = b.columns[0]!;
    expect(col.priceOnly).toBe(true);
    expect(col.price).toBe(100000);
    expect(col.trades.get(b.index(100000))!.buy).toBe(5000);
    expect(b.cell(col, b.index(100000))).toBe(0); // never any book colors
  });
  it('merge prepends older columns sorted by time and dedupes', () => {
    const b = new HeatmapBuffer(100000);
    b.sample(5000, new Map(), new Map(), 100000);
    const older = [
      { time: 3000, origin: 0, data: new Float32Array(ROWS), trades: new Map(), price: 100000, gap: false, priceOnly: true },
      { time: 1000, origin: 0, data: new Float32Array(ROWS), trades: new Map(), price: 100000, gap: false, priceOnly: true },
      { time: 5000, origin: 0, data: new Float32Array(ROWS), trades: new Map(), price: 99999, gap: false, priceOnly: true }, // duplicate time
    ];
    b.merge(older);
    expect(b.columns.map(c => c.time)).toEqual([1000, 3000, 5000]);
    expect(b.columns[2]!.price).toBe(100000); // live column wins over the duplicate
  });
  it('merge keeps the 60 minute cap', () => {
    const b = new HeatmapBuffer(100000);
    for (let i = 0; i < MAX_COLUMNS; i++) b.sample(100000 + i * 1000, new Map(), new Map(), 100000);
    const older = Array.from({ length: 100 }, (_, i) => ({ time: i * 1000, origin: 0, data: new Float32Array(0), trades: new Map(), price: 100000, gap: false, priceOnly: true }));
    b.merge(older);
    expect(b.columns.length).toBe(MAX_COLUMNS);
  });
  it('empty merge is a no-op', () => {
    const b = new HeatmapBuffer(100000);
    b.sample(1000, new Map(), new Map(), 100000);
    b.merge([]);
    expect(b.columns).toHaveLength(1);
  });
});
