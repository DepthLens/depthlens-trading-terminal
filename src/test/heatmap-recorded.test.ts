import { describe, it, expect } from 'vitest';
import { fillGaps, recordedEvery, snapshotToColumn, thinColumns } from '@/lib/heatmap-recorded';
import type { Column } from '@/lib/heatmap-data';
import { ROWS } from '@/lib/heatmap-data';

describe('recorded heatmap history', () => {
  it('uses 5s columns for 4h and thins longer windows to ≤2880 columns', () => {
    expect(recordedEvery(240)).toBe(5);
    expect(recordedEvery(1440)).toBe(30);
    expect(recordedEvery(10080)).toBe(210);
  });
  it('re-bins snapshot rows into the heatmap bucket grid as USDT notional', () => {
    const bids = Array(150).fill(0), asks = Array(150).fill(0);
    bids[74] = 1000; asks[76] = 500;
    const col = snapshotToColumn({ ts: '2026-01-01T00:00:00Z', source: 'binance', mid: 90000, step: 10, base: 89250, bids, asks }, 10);
    expect(col.data.length).toBe(ROWS);
    expect(col.data.reduce((a, b) => a + b, 0)).toBe(1500);
    expect(col.time).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });
  it('keeps one column per slot', () => {
    const cols = [0, 1000, 5000, 6000, 10000].map(time => ({ time, origin: 0, data: new Float32Array(0), trades: new Map(), price: 1, gap: false }));
    expect(thinColumns(cols, 5).map(c => c.time)).toEqual([0, 5000, 10000]);
  });
});

describe('fillGaps', () => {
  const col = (time: number, extra: Partial<Column> = {}): Column => ({ time, origin: 0, data: new Float32Array(1), trades: new Map(), price: 100, gap: false, ...extra });
  it('keeps live book columns and fills only holes, gaps and price-only seconds', () => {
    const live = [col(0), col(1000), col(5000, { gap: true }), col(6000, { priceOnly: true, price: 101 }), col(20000)];
    const rec = [col(4000, { price: 99 })];
    const { cols, filled } = fillGaps(live, rec, 0, 20000);
    expect(cols.find(c => c.time === 0)).toBe(live[0]);
    expect(cols.find(c => c.time === 5000)?.gap).toBe(false);
    expect(cols.find(c => c.time === 6000)?.price).toBe(101);
    expect(cols.find(c => c.time === 6000)?.priceOnly).toBe(false);
    expect(cols.some(c => c.time === 15000)).toBe(false); // recorded snapshot older than 10 s is not stretched
    expect(filled).toBeGreaterThan(0);
  });
  it('does not insert recorded columns next to live book columns (1 s timer jitter)', () => {
    const live = [col(0), col(2000)];
    const { cols, filled } = fillGaps(live, [col(0)], 0, 2000);
    expect(filled).toBe(0);
    expect(cols.map(c => c.time)).toEqual([0, 2000]);
  });
});
