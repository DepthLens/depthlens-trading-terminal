import { marketStream } from './market-stream';

export type LivePrice = { price: number; time: number; direction: number };
export type PriceStatus = 'Live' | 'Polling' | 'Offline';

// A single active-pair price source survives timeframe changes.
export function livePriceStream(symbol: string, onPrice: (tick: LivePrice) => void, onStatus: (status: PriceStatus) => void) {
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
  const publish = (price: number, time: number) => {
    const direction = last === undefined || price === last ? 0 : price > last ? 1 : -1;
    last = price;
    onPrice({ price, time, direction });
  };
  const poll = async () => {
    if (stopped || !polling) return;
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 4000);
    try {
      const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`, { signal: request.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Price unavailable');
      const data = await response.json();
      const price = Number(data.price);
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
  const silence = setTimeout(fallback, 5000);
  const stopSocket = marketStream(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade`, message => {
    const data = message.data ?? message;
    const price = Number(data.p), time = Number(data.T);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) return;
    clearTimeout(silence);
    polling = false;
    clearTimeout(pollTimer);
    request?.abort();
    publish(price, time);
    status('Live');
  }, connected => { if (!connected) fallback(); }, 5000);
  return () => { stopped = true; polling = false; clearTimeout(silence); clearTimeout(pollTimer); request?.abort(); stopSocket(); };
}