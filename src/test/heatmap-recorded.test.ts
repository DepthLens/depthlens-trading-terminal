import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fillGaps, historyRange, loadRecorded, loadRecorderStatus, recordedEvery, snapshotToColumn, thinColumns } from '@/lib/heatmap-recorded';
import type { Column } from '@/lib/heatmap-data';
import { ROWS } from '@/lib/heatmap-data';

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), page: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session }, rpc: mocks.rpc } }));

describe('authenticated history reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'reader' } } }, error: null });
    mocks.rpc.mockImplementation(() => ({ range: mocks.page }));
  });
  it('does not call history without a restored signed-in session', async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    await expect(loadRecorded(15, 100000)).rejects.toThrow('Sign in');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('surfaces RPC failures and retries instead of caching a failed empty result', async () => {
    mocks.page.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } }).mockResolvedValueOnce({ data: [{ ts: '2026-11-25T00:00:00Z' }], error: null });
    await expect(loadRecorded(60, 200000)).rejects.toThrow('permission denied');
    expect(await loadRecorded(60, 200000)).toHaveLength(1);
    expect(mocks.page).toHaveBeenCalledTimes(2);
  });
  it('does not reuse history for a different cutoff', async () => {
    mocks.page.mockResolvedValue({ data: [], error: null });
    await loadRecorded(240, 300000); await loadRecorded(240, 900000);
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1]?.[1]?.p_to).toBe(new Date(900000).toISOString());
  });
  it('surfaces status read failures', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'status unavailable' } });
    await expect(loadRecorderStatus()).rejects.toThrow('status unavailable');
  });
  it('reports the real snapshot range and count', () => {
    const row = { source: 'binance', mid: 100, step: 1, base: 90, bids: [], asks: [] };
    expect(historyRange([{ ...row, ts: '2026-11-25T01:00:00Z' }, { ...row, ts: '2026-11-25T00:00:00Z' }])).toEqual({ from: Date.parse('2026-11-25T00:00:00Z'), to: Date.parse('2026-11-25T01:00:00Z'), count: 2 });
  });
});

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
  it.each([15, 60])('fills a %im window before the first live book arrives', minutes => {
    const saved = Array.from({ length: minutes * 12 }, (_, i) => col(i * 5000));
    const result = fillGaps([], saved, 0, minutes * 60000 - 1000);
    expect(result.filled).toBe(minutes * 60);
    expect(result.cols.at(-1)?.time).toBe(minutes * 60000 - 1000);
  });
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
