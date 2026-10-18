import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { livePriceStream } from '@/lib/live-price';
import { applyLivePrice } from '@/lib/chart-data';
const stream = vi.hoisted(() => ({ receive: (_data: any) => {}, status: (_live: boolean) => {}, stop: vi.fn() }));
vi.mock('@/lib/market-stream', () => ({ marketStream: vi.fn((_url, receive, status) => { stream.receive = receive; stream.status = status; return stream.stop; }) }));
beforeEach(() => { vi.useFakeTimers(); stream.stop.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('falls back after exactly five silent seconds and polls again every one second', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: '100', time: 60000 }) });
  vi.stubGlobal('fetch', fetcher);
  const price = vi.fn(), status = vi.fn();
  const stop = livePriceStream('BTCUSDT', price, status);
  await vi.advanceTimersByTimeAsync(4999); expect(fetcher).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(1); expect(status).toHaveBeenLastCalledWith('Polling');
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT');
  await vi.advanceTimersByTimeAsync(999); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
  stop(); await vi.advanceTimersByTimeAsync(10000); expect(fetcher).toHaveBeenCalledTimes(2); expect(stream.stop).toHaveBeenCalledOnce();
});
it('falls back on failure, goes Offline on failed polling, and recovers to WebSocket Live', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  const price = vi.fn(), status = vi.fn();
  const stop = livePriceStream('ETHUSDT', price, status);
  stream.status(false); await vi.advanceTimersByTimeAsync(0);
  expect(status).toHaveBeenLastCalledWith('Offline');
  stream.receive({ p: '200', T: 60000 });
  expect(status).toHaveBeenLastCalledWith('Live'); expect(price).toHaveBeenLastCalledWith(expect.objectContaining({ price: 200, time: 60000, direction: 0, source: 'trade' }));
  const calls = vi.mocked(fetch).mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000); expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
  stop();
});
it('keeps the last candle equal to the active price for every timeframe, including delayed ticks', () => {
  for (const minutes of [1, 5, 10, 15, 30, 45, 60, 240, 1440]) {
    const result = applyLivePrice({ time: 86400000, open: 100, high: 110, low: 90, close: 105 }, 86399000, 99, minutes);
    expect(result.close).toBe(99); expect(result.time).toBe(86400000);
  }
});
it('publishes every trade synchronously and measures latency using E, not T', () => {
  vi.setSystemTime(100000);
  const price = vi.fn();
  const stop = livePriceStream('BTCUSDT', price, vi.fn());
  for (let i = 0; i < 20; i++) stream.receive({ s: 'BTCUSDT', p: String(100 + i), T: 99000 + i, E: 99950 });
  expect(price).toHaveBeenCalledTimes(20);
  expect(price).toHaveBeenLastCalledWith(expect.objectContaining({ price: 119, latency: 50, eventTime: 99950 }));
  stream.receive({ s: 'ETHUSDT', p: '500', T: 99999, E: 99999 });
  expect(price).toHaveBeenCalledTimes(20);
  stop(); stream.receive({ p: '200', T: 100001, E: 100001 });
  expect(price).toHaveBeenCalledTimes(20);
});
it('retains every trade high and low even when painting once per animation frame', () => {
  let candle = { time: 60000, open: 100, high: 100, low: 100, close: 100 };
  const stop = livePriceStream('BTCUSDT', tick => { candle = applyLivePrice(candle, tick.time, tick.price, 1); }, vi.fn());
  for (const p of ['125', '75', '102']) stream.receive({ s: 'BTCUSDT', p, T: 60001, E: 60001 });
  expect(candle).toEqual({ time: 60000, open: 100, high: 125, low: 75, close: 102 });
  stop();
});
it('publishes every trade in a Bybit publicTrade batch', () => {
  vi.setSystemTime(100000);
  const price = vi.fn();
  const stop = livePriceStream('BTCUSDT', price, vi.fn(), 'bybit');
  stream.receive({ topic: 'publicTrade.BTCUSDT', ts: 99925, data: [{ s: 'BTCUSDT', p: '100', T: 99900 }, { s: 'BTCUSDT', p: '101', T: 99901 }] });
  expect(price).toHaveBeenCalledTimes(2);
  expect(price).toHaveBeenLastCalledWith(expect.objectContaining({ price: 101, latency: 75 }));
  stop();
});
it('switches back immediately and discards an in-flight polling result', async () => {
  let resolve: ((value: unknown) => void) | undefined;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; })));
  const price = vi.fn(), status = vi.fn();
  const stop = livePriceStream('BTCUSDT', price, status);
  await vi.advanceTimersByTimeAsync(5000);
  stream.receive({ s: 'BTCUSDT', p: '123', T: 60000, E: 60000 });
  expect(status).toHaveBeenLastCalledWith('Live');
  resolve?.({ ok: true, json: async () => ({ price: '50', time: 60001 }) });
  await vi.advanceTimersByTimeAsync(0);
  expect(price).toHaveBeenCalledTimes(1);
  expect(price).toHaveBeenLastCalledWith(expect.objectContaining({ price: 123 }));
  stop();
});