import { marketStream } from './market-stream';

export type LivePrice = { price: number; time: number; direction: number; eventTime?: number; receivedAt?: number; latency?: number; source?: 'trade' | 'poll' };
export type PriceStatus = 'Live' | 'Polling' | 'Offline';

// A single active-pair price source survives timeframe changes.
export function livePriceStream(symbol: string, onPrice: (tick: LivePrice) => void, onStatus: (status: PriceStatus) => void, exchange: 'binance' | 'bybit' = 'binance') {
  let stopped = false, polling = false;
  let last: number | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let currentStatus: PriceStatus = 'Offline';
  onStatus(currentStatus);
  const status = (next: PriceStatus) => {
    if (stopped || next === currentStatus) return;
    currentStatus = next;
    console.info(`[DepthLens] ${symbol} price: ${next}`);
    onStatus(next);
  };
  let lastTradeTime = -Infinity;
  const publish = (price: number, time: number, eventTime?: number) => {
    if (stopped) return;
    if (eventTime !== undefined && time < lastTradeTime) return;
    if (eventTime !== undefined) lastTradeTime = time;
    const receivedAt = Date.now();
    const direction = last === undefined || price === last ? 0 : price > last ? 1 : -1;
    last = price;
    onPrice({ price, time, direction, receivedAt, source: eventTime === undefined ? 'poll' : 'trade', ...(eventTime === undefined ? {} : { eventTime, latency: receivedAt - eventTime }) });
  };
  const poll = async () => {
    if (stopped || !polling) return;
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 4000);
    try {
      const url = exchange === 'binance' ? `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}` : `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
      const response = await fetch(url, { signal: request.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Price unavailable');
      const data = await response.json();
      const price = Number(exchange === 'binance' ? data.price : data.result?.list?.[0]?.lastPrice);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price');
      if (stopped || !polling) return;
      publish(price, Number(data.time) > 0 ? Number(data.time) : Date.now());
      status('Polling');
    } catch {
      if (!stopped && polling) status('Offline');
    } finally {
      clearTimeout(timeout);
      if (!stopped && polling) pollTimer = setTimeout(poll, 1000);
    }
  };
  const fallback = () => {
    if (stopped || polling) return;
    polling = true;
    console.info(`[DepthLens] ${symbol} using price polling`);
    void poll();
  };
  let silence: ReturnType<typeof setTimeout>;
  const armSilence = () => { clearTimeout(silence); silence = setTimeout(fallback, 5000); };
  armSilence();
  const url = exchange === 'binance' ? `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade` : 'wss://stream.bybit.com/v5/public/linear';
  const stopSocket = marketStream(url, message => {
    const data = message.data ?? message;
    const trades = exchange === 'binance' ? [data] : message.topic === `publicTrade.${symbol}` && Array.isArray(data) ? data : [];
    for (const trade of trades) {
      if (trade.s && trade.s !== symbol) continue;
      const price = Number(trade.p), time = Number(trade.T), eventTime = Number(exchange === 'binance' ? trade.E ?? trade.T : message.ts ?? trade.T);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || !Number.isFinite(eventTime)) continue;
      armSilence();
      polling = false;
      clearTimeout(pollTimer);
      request?.abort();
      publish(price, time, eventTime);
      status('Live');
    }
  }, connected => { if (!connected) fallback(); }, 5000, exchange === 'bybit' ? { op: 'subscribe', args: [`publicTrade.${symbol}`] } : undefined);
  return () => { stopped = true; polling = false; clearTimeout(silence); clearTimeout(pollTimer); request?.abort(); stopSocket(); };
}