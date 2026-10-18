import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { livePriceStream, computeOffset, median, sourceStats, resetStats, clockOffset } from '@/lib/live-price';
import { applyLivePrice } from '@/lib/chart-data';
const streams = vi.hoisted(() => ({ entries: [] as {url: string; receive: (data: any) => void; status: (live: boolean) => void; options: any; stop: ReturnType<typeof vi.fn>}[] }));
vi.mock('@/lib/market-stream', () => ({ marketStream: vi.fn((url, receive, status, options) => { const entry = {url, receive, status, options, stop: vi.fn()}; streams.entries.push(entry); return entry.stop; }), connectionManager: {snapshot: vi.fn()} }));
beforeEach(() => { vi.useFakeTimers(); streams.entries = []; resetStats('binance'); resetStats('bybit'); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('opens one combined Binance stream and forwards klines', () => {
  const kline = vi.fn(); const stop = livePriceStream('BTCUSDT', vi.fn(), vi.fn(), '5m', kline);
  expect(streams.entries).toHaveLength(1);
  expect(streams.entries[0]?.url).toBe('wss://fstream.binance.com/stream?streams=btcusdt@aggTrade/btcusdt@kline_5m');
  streams.entries[0]?.receive({data:{k:{t:60000}}}); expect(kline).toHaveBeenCalledWith({k:{t:60000}});
  stop(); expect(streams.entries[0]?.stop).toHaveBeenCalledOnce();
});
it('processes every Bybit trade in a batch in order with p, v, S, T', () => {
  const price = vi.fn(); const stop = livePriceStream('BTCUSDT', price, vi.fn(), '1m', undefined, undefined, 'bybit');
  streams.entries[0]?.receive({topic:'publicTrade.BTCUSDT',ts:1000,data:[{s:'BTCUSDT',p:'100',v:'0.5',S:'Buy',T:900},{s:'BTCUSDT',p:'101',v:'2',S:'Sell',T:900},{s:'BTCUSDT',p:'99',v:'1',S:'Buy',T:901}]});
  expect(price.mock.calls.map(c => [c[0].price, c[0].size, c[0].side])).toEqual([[100,0.5,'Buy'],[101,2,'Sell'],[99,1,'Buy']]);
  stop();
});
it('ignores Bybit tickers/kline for the live price', () => {
  const price = vi.fn(); const stop = livePriceStream('BTCUSDT', price, vi.fn(), '1m', vi.fn(), undefined, 'bybit');
  streams.entries[0]?.receive({topic:'tickers.BTCUSDT',data:{lastPrice:'5'}});
  streams.entries[0]?.receive({topic:'kline.1.BTCUSDT',data:[{start:0,open:'1',high:'1',low:'1',close:'1',confirm:true}]});
  expect(price).not.toHaveBeenCalled(); stop();
});
it('computes clock offset from the request midpoint', () => { expect(computeOffset(10_500, 10_000, 10_200)).toBe(400); });
it('reports the median of the last 50 trade latencies', () => {
  vi.setSystemTime(10_000); const stop = livePriceStream('BTCUSDT', vi.fn(), vi.fn());
  for (let i = 0; i < 60; i++) streams.entries[0]?.receive({data:{s:'BTCUSDT',p:'100',T:i,E:10_000 - i}});
  expect(clockOffset('binance')).toBe(0);
  expect(median([3,1,2])).toBe(2); expect(sourceStats('binance').medianLatency).toBe(34.5); stop();
});
it('auto connects to both for 5 seconds then keeps the lower-latency source', async () => {
  vi.setSystemTime(10_000); const stop = livePriceStream('BTCUSDT', vi.fn(), vi.fn(), '1m', undefined, undefined, 'auto');
  expect(streams.entries.map(e => e.options.exchange)).toEqual(['binance','bybit']);
  streams.entries[0]?.receive({data:{s:'BTCUSDT',p:'100',T:1,E:9_900}});
  streams.entries[1]?.receive({topic:'publicTrade.BTCUSDT',ts:9_980,data:[{s:'BTCUSDT',p:'100',v:'1',S:'Buy',T:1}]});
  await vi.advanceTimersByTimeAsync(5000);
  expect(streams.entries[0]?.stop).toHaveBeenCalledOnce(); expect(streams.entries[1]?.stop).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(600000); expect(streams.entries).toHaveLength(3); stop();
});
it('keeps candle close equal to every active price across timeframes', () => {
  for(const minutes of [1,5,10,15,30,45,60,240,1440]) expect(applyLivePrice({time:86400000,open:100,high:110,low:90,close:105},86399000,99,minutes).close).toBe(99);
});
