import { describe, it, expect } from 'vitest';
import { recordedEvery, snapshotToColumn, thinColumns } from '@/lib/heatmap-recorded';
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
