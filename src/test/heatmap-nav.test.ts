import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildNavColumns, clearRecordedPages, loadRecordedPage, pageEvery, pageSpanMs, peekRecordedPage, RECORDED_RETENTION_MS } from '@/lib/heatmap-recorded';
import type { Column } from '@/lib/heatmap-data';

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), page: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session }, rpc: mocks.rpc } }));

const col = (time: number, extra: Partial<Column> = {}): Column => ({ time, origin: 0, data: new Float32Array([5]), trades: new Map(), price: 100, gap: false, ...extra });

describe('heatmap time navigation grid', () => {
  it('keeps one slot per second and leaves unrecorded time empty instead of inventing data', () => {
    const live = [col(10000), col(11000)];
    const out = buildNavColumns(live, [], 0, 20000, 1);
    expect(out).toHaveLength(20);
    expect(out[10]?.empty).toBeUndefined();
    expect(out[0]?.empty).toBe(true);
    expect(out[0]?.data.length).toBe(0);
    expect(Number.isNaN(out[0]?.price)).toBe(true);
    expect(out[19]?.empty).toBe(true);
  });
  it('fills seconds from recorded 5s snapshots and prefers live book columns', () => {
    const rec = [col(0, { price: 90 })];
    const live = [col(3000, { price: 101 })];
    const out = buildNavColumns(live, rec, 0, 15000, 1);
    expect(out[3]?.price).toBe(101);
    expect(out[0]?.price).toBe(90);
    expect(out[14]?.empty).toBe(true); // more than 10s after the last snapshot
  });
  it('uses spaced slots for long windows and stays within the drawing limit', () => {
    const out = buildNavColumns([], [col(210000, { price: 7 })], 0, 7 * 86400000, 210);
    expect(out.length).toBe(2880);
    expect(out[1]?.price).toBe(7);
  });
  it('pages 1000 snapshots per request and keeps 7 days of history', () => {
    expect(pageEvery(15)).toBe(5);
    expect(pageEvery(10080)).toBe(210);
    expect(pageSpanMs(5)).toBe(5000000);
    expect(RECORDED_RETENTION_MS).toBe(7 * 86400000);
  });
});

describe('paged history cache', () => {
  beforeEach(() => {
    vi.clearAllMocks(); clearRecordedPages();
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'reader' } } }, error: null });
    mocks.rpc.mockImplementation(() => ({ range: mocks.page }));
  });
  it('caches closed pages so going back and forth does not refetch', async () => {
    mocks.page.mockResolvedValue({ data: [{ ts: '2026-11-20T00:00:00Z' }], error: null });
    await loadRecordedPage(5, 100);
    expect(peekRecordedPage(5, 100)).toHaveLength(1);
    await Promise.all([loadRecordedPage(5, 101), loadRecordedPage(5, 101)]);
    expect(mocks.page).toHaveBeenCalledTimes(2);
  });
  it('never caches a failed page', async () => {
    mocks.page.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(loadRecordedPage(5, 200)).rejects.toThrow('denied');
    expect(peekRecordedPage(5, 200)).toBeNull();
  });
});
