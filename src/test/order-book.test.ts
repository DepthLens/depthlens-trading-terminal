import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ receive: null as ((d: any) => void) | null, connection: null as ((open: boolean) => void) | null, stop: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/lib/market-stream', () => ({ connectionManager: { subscribe: (...args: any[]) => {
  transport.subscribe(...args); transport.receive = args[2]; transport.connection = args[3]; args[3](true); return transport.stop;
} } }));
import { OrderBookManager } from '@/lib/order-book';
let book: OrderBookManager;
const diff = (U: number, u: number, pu: number, b: [string, string][] = [], a: [string, string][] = []) => ({ e: 'depthUpdate', s: 'BTCUSDT', U, u, pu, b, a });
const snapshot = (lastUpdateId = 100) => ({ ok: true, json: async () => ({ lastUpdateId, bids: [['99', '2']], asks: [['101', '3']] }) });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(snapshot())); book = new OrderBookManager(); });
afterEach(() => { book.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('Bybit snapshot replaces both sides, including every repeated snapshot', () => {
  book.configure('BTCUSDT', 'bybit', true);
  transport.receive?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 10, b: [['99', '2']], a: [['101', '3']] } });
  expect(book.debug()).toMatchObject({ state: 'Synced', bestBid: 99, bestAsk: 101, spread: 2, bidLevels: 1, askLevels: 1, totalBidSize: 2, totalAskSize: 3 });
  transport.receive?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 1, b: [['98', '7']], a: [['102', '4']] } });
  expect(book.bids.levels.has(99)).toBe(false);
  expect(book.debug()).toMatchObject({ bestBid: 98, totalBidSize: 7, bestAsk: 102, totalAskSize: 4 });
});
it('Bybit delta deletes zero sizes and replaces or inserts nonzero sizes', () => {
  book.configure('BTCUSDT', 'bybit', true);
  transport.receive?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 10, b: [['99', '2'], ['98', '1']], a: [['101', '3']] } });
  transport.receive?.({ type: 'delta', data: { s: 'BTCUSDT', u: 15, b: [['99', '0'], ['98', '5']], a: [['101', '4'], ['102', '2']] } });
  expect(book.debug()).toMatchObject({ bestBid: 98, totalBidSize: 5, bidLevels: 1, askLevels: 2, totalAskSize: 6, updatesPerSecond: 2 });
  vi.advanceTimersByTime(1001); expect(book.debug().updatesPerSecond).toBe(0);
});
it('runs only with Heatmap/DOM enablement and unsubscribes/resets on pair or source changes', () => {
  book.configure('BTCUSDT', 'bybit', false); expect(transport.subscribe).not.toHaveBeenCalled();
  book.setEnabled(true); expect(transport.subscribe.mock.calls[0]?.slice(0, 2)).toEqual(['bybit', 'orderbook.1000.BTCUSDT']);
  transport.receive?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 1, b: [['99', '2']], a: [['101', '3']] } });
  const old = transport.receive; book.setActive('DOGEUSDT', 'bybit');
  expect(transport.stop).toHaveBeenCalledTimes(1); expect(book.debug()).toMatchObject({ state: 'Resyncing', bidLevels: 0, askLevels: 0 });
  old?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 2, b: [['99', '5']], a: [] } }); expect(book.debug().bidLevels).toBe(0);
  book.setActive('DOGEUSDT', 'binance'); expect(transport.stop).toHaveBeenCalledTimes(2);
  expect(transport.subscribe.mock.calls.at(-1)?.slice(0, 2)).toEqual(['binance', 'dogeusdt@depth@100ms']);
  book.setEnabled(false); expect(transport.stop).toHaveBeenCalledTimes(3); expect(book.debug().bidLevels).toBe(0);
});
it('Bybit falls back from orderbook.1000 to orderbook.200 when no snapshot arrives', () => {
  book.configure('BTCUSDT', 'bybit', true);
  expect(transport.subscribe.mock.calls.at(-1)?.slice(0, 2)).toEqual(['bybit', 'orderbook.1000.BTCUSDT']);
  vi.advanceTimersByTime(4000);
  expect(transport.stop).toHaveBeenCalledTimes(1);
  expect(transport.subscribe.mock.calls.at(-1)?.slice(0, 2)).toEqual(['bybit', 'orderbook.200.BTCUSDT']);
  transport.receive?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 1, b: [['99', '2']], a: [['101', '3']] } });
  expect(book.debug().state).toBe('Synced');
});
it('Binance buffers before REST, drops older events and bridges snapshot ID inclusively', async () => {
  let resolve: ((d: any) => void) | undefined;
  vi.mocked(fetch).mockImplementation(() => new Promise(r => { resolve = r; }));
  book.configure('BTCUSDT', 'binance', true);
  transport.receive?.({ data: diff(90, 99, 89, [['90', '100']]) });
  transport.receive?.({ data: diff(100, 102, 99, [['99', '5']]) });
  expect(book.debug().state).toBe('Resyncing');
  resolve?.(snapshot()); await settle();
  expect(fetch).toHaveBeenCalledWith('https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(book.debug()).toMatchObject({ state: 'Synced', totalBidSize: 5, bidLevels: 1 });
  transport.receive?.(diff(103, 105, 102, [['99', '0'], ['98', '6']]));
  expect(book.debug()).toMatchObject({ bestBid: 98, totalBidSize: 6 });
});
it('Binance pu gap resets book and automatically fetches a new snapshot', async () => {
  book.configure('BTCUSDT', 'binance', true); await settle();
  transport.receive?.(diff(99, 101, 98)); expect(book.debug().state).toBe('Synced');
  vi.mocked(fetch).mockResolvedValueOnce(snapshot(106) as Response);
  transport.receive?.(diff(104, 108, 103, [['99', '7']]));
  expect(book.debug()).toMatchObject({ state: 'Resyncing', bidLevels: 0 });
  await settle(); expect(fetch).toHaveBeenCalledTimes(2); expect(book.debug()).toMatchObject({ state: 'Synced', totalBidSize: 7 });
});
it('Binance missing initial bridge resyncs instead of marking an invalid book Synced', async () => {
  book.configure('BTCUSDT', 'binance', true); await settle();
  vi.mocked(fetch).mockResolvedValueOnce(snapshot(110) as Response);
  transport.receive?.(diff(109, 112, 108)); expect(book.debug().state).toBe('Resyncing');
  await settle(); expect(fetch).toHaveBeenCalledTimes(2); expect(book.debug().state).toBe('Synced');
});
it('reconnection clears book and waits for a fresh Bybit snapshot before deltas', () => {
  book.configure('BTCUSDT', 'bybit', true);
  transport.receive?.({ type: 'snapshot', data: { s: 'BTCUSDT', u: 1, b: [['99', '2']], a: [] } });
  transport.connection?.(false); transport.connection?.(true);
  transport.receive?.({ type: 'delta', data: { s: 'BTCUSDT', u: 2, b: [['99', '3']], a: [] } });
  expect(book.debug()).toMatchObject({ state: 'Resyncing', bidLevels: 0 });
});
it('aborts the old snapshot request and ignores its response after ten pair switches', async () => {
  let resolve: ((d: any) => void) | undefined;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  book.configure('BTCUSDT', 'binance', true);
  const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
  for (let i = 0; i < 10; i++) book.setActive(i % 2 ? 'DOGEUSDT' : 'BTCUSDT', 'bybit');
  expect(signal?.aborted).toBe(true);
  resolve?.(snapshot()); await settle(); expect(book.debug()).toMatchObject({ state: 'Resyncing', bidLevels: 0 });
});