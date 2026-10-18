import { connectionManager, marketStream, type ConnectionSnapshot } from './market-stream';

export type LivePrice = { price: number; time: number; direction: number; eventTime?: number; receivedAt?: number; latency?: number; source?: 'trade' | 'poll' };
export type PriceStatus = 'Live' | 'Polling' | 'Offline';
export type PriceDiagnostics = ConnectionSnapshot;
export function priceDiagnostics(source: 'binance' | 'bybit' | 'poll') {
  const snapshot = connectionManager.snapshot(source === 'bybit' ? 'bybit' : 'binance');
  return { ...snapshot, source: source === 'poll' ? 'Polling' : snapshot.source, state: source === 'poll' ? 'Polling' : snapshot.state };
}

// The one active session owns primary + failover; charts receive klines through a ref.
export function livePriceStream(symbol: string, onPrice: (tick: LivePrice) => void, onStatus: (status: PriceStatus) => void, interval = '1m', onKline?: (data: any) => void, onSource?: (source: 'binance' | 'bybit' | 'poll') => void) {
  let stopped = false, polling = false, fallbackActive = false;
  let last: number | undefined, lastTradeTime = -Infinity;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let stopBybit: (() => void) | undefined;
  let currentStatus: PriceStatus = 'Offline';
  onStatus(currentStatus); onSource?.('binance');
  const status = (next: PriceStatus) => { if (!stopped && next !== currentStatus) { currentStatus = next; onStatus(next); } };
  const publish = (price: number, time: number, eventTime?: number) => {
    if (stopped || (eventTime !== undefined && time < lastTradeTime)) return;
    if (eventTime !== undefined) lastTradeTime = time;
    const receivedAt = Date.now(), direction = last === undefined || price === last ? 0 : price > last ? 1 : -1;
    last = price;
    onPrice({ price, time, direction, receivedAt, source: eventTime === undefined ? 'poll' : 'trade', ...(eventTime === undefined ? {} : { eventTime, latency: receivedAt - eventTime }) });
  };
  const stopPolling = () => { polling = false; clearTimeout(pollTimer); request?.abort(); };
  const poll = async () => {
    if (stopped || !polling) return;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json(), price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error();
      if (stopped || !polling || controller.signal.aborted) return;
      publish(price, Number(data.time) || Date.now()); onSource?.('poll'); status('Polling');
    } catch { if (!stopped && polling) status('Offline'); }
    finally { clearTimeout(timeout); if (!stopped && polling) pollTimer = setTimeout(poll, 1000); }
  };
  const startPolling = () => { if (!stopped && !polling) { polling = true; void poll(); } };
  const fallback = (failures: number) => {
    if (stopped || failures < 3 || fallbackActive) return;
    fallbackActive = true; startPolling();
    stopBybit = marketStream('wss://stream.bybit.com/v5/public/linear', message => {
      if (stopped || !fallbackActive || message.topic !== `publicTrade.${symbol}` || !Array.isArray(message.data)) return;
      for (const trade of message.data) {
        const price = Number(trade.p), time = Number(trade.T), eventTime = Number(message.ts ?? trade.T);
        if (trade.s !== symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || !Number.isFinite(eventTime)) continue;
        stopPolling(); onSource?.('bybit'); publish(price, time, eventTime); status('Live');
      }
    }, live => { if (!live && fallbackActive) startPolling(); }, { exchange: 'bybit', purpose: 'active', subscription: { op: 'subscribe', args: [`publicTrade.${symbol}`] } });
  };
  const lower = symbol.toLowerCase();
  const stopPrimary = marketStream(`wss://fstream.binance.com/stream?streams=${lower}@aggTrade/${lower}@kline_${interval}`, message => {
    if (stopped) return;
    // Return to primary on its first valid frame, not merely TCP connection open.
    fallbackActive = false; stopBybit?.(); stopBybit = undefined; stopPolling(); onSource?.('binance');
    const data = message.data ?? message;
    if (data.k) { onKline?.(data); return; }
    if (data.s !== symbol) return;
    const price = Number(data.p), time = Number(data.T), eventTime = Number(data.E ?? data.T);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || !Number.isFinite(eventTime)) return;
    publish(price, time, eventTime); status('Live');
  }, live => { if (live || !fallbackActive) status(live ? 'Live' : 'Offline'); }, { exchange: 'binance', purpose: 'active', onFailure: fallback });
  return () => { stopped = true; stopPolling(); stopBybit?.(); stopPrimary(); };
}
