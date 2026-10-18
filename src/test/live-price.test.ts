import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { livePriceStream } from '@/lib/live-price';
import { applyLivePrice } from '@/lib/chart-data';
const streams = vi.hoisted(() => ({ entries: [] as {url: string; receive: (data: any) => void; status: (live: boolean) => void; options: any; stop: ReturnType<typeof vi.fn>}[] }));
vi.mock('@/lib/market-stream', () => ({ marketStream: vi.fn((url, receive, status, options) => { const entry = {url, receive, status, options, stop: vi.fn()}; streams.entries.push(entry); return entry.stop; }), connectionManager: {snapshot: vi.fn()} }));
beforeEach(() => { vi.useFakeTimers(); streams.entries = []; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('opens exactly one combined Binance stream with the requested active interval', () => {
  const kline = vi.fn(); const stop = livePriceStream('BTCUSDT', vi.fn(), vi.fn(), '5m', kline);
  expect(streams.entries).toHaveLength(1);
  expect(streams.entries[0]?.url).toBe('wss://fstream.binance.com/stream?streams=btcusdt@aggTrade/btcusdt@kline_5m');
  streams.entries[0]?.receive({data:{k:{t:60000}}}); expect(kline).toHaveBeenCalledWith({k:{t:60000}});
  stop(); expect(streams.entries[0]?.stop).toHaveBeenCalledOnce();
});
it('does not poll or open Bybit until three consecutive primary failures', async () => {
  const fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>({price:'100',time:60000})}); vi.stubGlobal('fetch',fetcher);
  const stop = livePriceStream('BTCUSDT',vi.fn(),vi.fn());
  const primary = streams.entries[0];
  primary?.options.onFailure(1); primary?.options.onFailure(2);
  await vi.advanceTimersByTimeAsync(0); expect(fetcher).not.toHaveBeenCalled(); expect(streams.entries).toHaveLength(1);
  primary?.options.onFailure(3); await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(streams.entries).toHaveLength(2);
  expect(streams.entries[1]?.options.exchange).toBe('bybit');
  primary?.options.onFailure(4); expect(streams.entries).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(2); stop();
});
it('immediately returns to Binance and discards in-flight polling results', async () => {
  let resolve: ((v: unknown) => void) | undefined;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolve=r;})));
  const price = vi.fn(), status = vi.fn(); const stop = livePriceStream('BTCUSDT',price,status);
  const primary = streams.entries[0]; primary?.options.onFailure(3);
  primary?.receive({data:{s:'BTCUSDT',p:'123',T:60000,E:60000}});
  expect(status).toHaveBeenLastCalledWith('Live'); expect(streams.entries[1]?.stop).toHaveBeenCalledOnce();
  resolve?.({ok:true,json:async()=>({price:'50'})}); await vi.advanceTimersByTimeAsync(0);
  expect(price).toHaveBeenCalledTimes(1); expect(price).toHaveBeenLastCalledWith(expect.objectContaining({price:123})); stop();
});
it('publishes every trade synchronously, using E for latency, and ignores stale callbacks after cleanup', () => {
  vi.setSystemTime(100000); const price = vi.fn(); const stop = livePriceStream('BTCUSDT',price,vi.fn());
  const receive = streams.entries[0]?.receive;
  for(let i=0;i<20;i++) receive?.({data:{s:'BTCUSDT',p:String(100+i),T:99000+i,E:99950}});
  expect(price).toHaveBeenCalledTimes(20); expect(price).toHaveBeenLastCalledWith(expect.objectContaining({price:119,latency:50}));
  receive?.({data:{s:'ETHUSDT',p:'200',T:100000,E:100000}}); expect(price).toHaveBeenCalledTimes(20);
  stop(); receive?.({data:{s:'BTCUSDT',p:'200',T:100001,E:100001}}); expect(price).toHaveBeenCalledTimes(20);
});
it('publishes every Bybit batch trade only in failover and restores polling if Bybit fails', async () => {
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error()));
  const price=vi.fn(), status=vi.fn(); const stop=livePriceStream('BTCUSDT',price,status);
  streams.entries[0]?.options.onFailure(3); await vi.advanceTimersByTimeAsync(0);
  streams.entries[1]?.receive({topic:'publicTrade.BTCUSDT',ts:99925,data:[{s:'BTCUSDT',p:'100',T:99900},{s:'BTCUSDT',p:'101',T:99901}]});
  expect(price).toHaveBeenCalledTimes(2); expect(status).toHaveBeenLastCalledWith('Live');
  streams.entries[1]?.status(false); await vi.advanceTimersByTimeAsync(0); expect(status).toHaveBeenLastCalledWith('Offline'); stop();
});
it('keeps candle close equal to every active price across all timeframes', () => {
  for(const minutes of [1,5,10,15,30,45,60,240,1440]) expect(applyLivePrice({time:86400000,open:100,high:110,low:90,close:105},86399000,99,minutes).close).toBe(99);
  let candle={time:60000,open:100,high:100,low:100,close:100};
  for(const price of [125,75,102]) candle=applyLivePrice(candle,60001,price,1);
  expect(candle).toEqual({time:60000,open:100,high:125,low:75,close:102});
});
