import { describe, expect, it } from 'vitest';
import { HeatmapBuffer, autoBucketSize, colorFor, percentile, MAX_COLUMNS, ROWS } from '@/lib/heatmap-data';

describe('autoBucketSize', () => {
  it('picks a 1/2/5 bucket so ~200 rows cover ±10% of the price', () => {
    expect(autoBucketSize(100000)).toBe(100);
    expect(autoBucketSize(3000)).toBe(2);
    expect(autoBucketSize(0.05)).toBeCloseTo(0.00005, 10);
  });
  it('falls back to 1 for invalid prices', () => {
    expect(autoBucketSize(0)).toBe(1);
    expect(autoBucketSize(NaN)).toBe(1);
  });
});

describe('HeatmapBuffer', () => {
  it('stores book sizes as USDT notional in the right buckets', () => {
    const b = new HeatmapBuffer(100000); // bucket = 100
    b.sample(1000, new Map([[99900, 2], [99850, 1]]), new Map([[100100, 3]]), 100000);
    const col = b.columns[0]!;
    expect(b.cell(col, b.index(99900))).toBeCloseTo(99900 * 2);
    expect(b.cell(col, b.index(99850))).toBeCloseTo(99850 * 1);
    expect(b.cell(col, b.index(100100))).toBeCloseTo(100100 * 3);
    expect(col.origin).toBe(b.index(100000) - ROWS / 2);
  });
  it('aggregates trades per bucket and side as notional', () => {
    const b = new HeatmapBuffer(100000);
    b.trade(100000, 0.5, 'Buy');
    b.trade(100010, 0.5, 'Sell');
    b.sample(1000, new Map(), new Map(), 100000);
    const t = b.columns[0]!.trades.get(b.index(100000))!;
    expect(t.buy).toBeCloseTo(50000);
    expect(t.sell).toBeCloseTo(50005);
    expect(b.columns[0]!.price).toBe(100010);
  });
  it('ignores invalid trades', () => {
    const b = new HeatmapBuffer(100000);
    b.trade(NaN, 1, 'Buy'); b.trade(100, -1, 'Buy'); b.trade(100, 0, 'Sell');
    b.sample(1000, new Map(), new Map(), 100000);
    expect(b.columns[0]!.trades.size).toBe(0);
  });
  it('marks gap columns with empty data', () => {
    const b = new HeatmapBuffer(100000);
    b.markGap(1000, 100000);
    const col = b.columns[0]!;
    expect(col.gap).toBe(true);
    expect(col.data.every(v => v === 0)).toBe(true);
  });
  it('evicts columns beyond 60 minutes', () => {
    const b = new HeatmapBuffer(100000);
    for (let i = 0; i < MAX_COLUMNS + 10; i++) b.sample(i * 1000, new Map(), new Map(), 100000);
    expect(b.columns.length).toBe(MAX_COLUMNS);
    expect(b.columns[0]!.time).toBe(10000);
  });
  it('sums grouped buckets', () => {
    const b = new HeatmapBuffer(100000);
    b.sample(1000, new Map([[99900, 1], [99800, 1]]), new Map(), 100000);
    const col = b.columns[0]!;
    const rowTop = b.index(99900);
    expect(b.groupedCell(col, rowTop, 1)).toBeCloseTo(99900);
    expect(b.groupedCell(col, rowTop, 2)).toBeCloseTo(99900 + 99800);
  });
});

describe('percentile', () => {
  it('returns the p-th percentile and 0 for empty input', () => {
    expect(percentile([], 98)).toBe(0);
    expect(percentile([1, 2, 3, 4, 100], 100)).toBe(100);
    expect(percentile([1, 2, 3, 4, 100], 50)).toBe(3);
  });
});

describe('colorFor', () => {
  it('clamps to the scale ends and brightens monotonically', () => {
    expect(colorFor(-1)).toEqual(colorFor(0));
    expect(colorFor(2)).toEqual(colorFor(1));
    const lum = (c: [number, number, number]) => c[0] + c[1] + c[2];
    expect(lum(colorFor(0.5))).toBeGreaterThan(lum(colorFor(0.1)));
    expect(colorFor(1)).toEqual([249, 115, 22]); // biggest orders are orange
  });
});
