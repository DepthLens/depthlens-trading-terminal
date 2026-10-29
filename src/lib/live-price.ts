import { connectionManager, marketStream, type ConnectionSnapshot } from './market-stream';

export type TradeSource = 'binance' | 'bybit';
export type SourceMode = 'auto' | TradeSource;
export type LivePrice = { price: number; time: number; direction: number; size?: number; side?: 'Buy' | 'Sell'; eventTime?: number; receivedAt?: number; latency?: number; source?: 'trade' | 'poll'; exchange?: TradeSource; tradeId?: string };
export type PriceStatus = 'Live' | 'Polling' | 'Offline';
export type PriceDiagnostics = ConnectionSnapshot;

// ---- Clock correction: offset = serverTime - local midpoint of the request.
const offsets: Partial<Record<TradeSource, number>> = {};
const offsetRequests: Partial<Record<TradeSource, Promise<void>>> = {};
export function computeOffset(serverTime: number, sentAt: number, receivedAt: number) { return serverTime - (sentAt + receivedAt) / 2; }
export function syncClock(source: TradeSource): Promise<void> {
  if (offsetRequests[source]) return offsetRequests[source]!;
  const url = source === 'bybit' ? 'https://api.bybit.com/v5/market/time' : 'https://fapi.binance.com/fapi/v1/time';
  const run = (async () => {
    try {
      const sentAt = Date.now();
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      const receivedAt = Date.now();
      const server = Number(source === 'bybit' ? data.time : data.serverTime);
      if (Number.isFinite(server)) offsets[source] = computeOffset(server, sentAt, receivedAt);
    } catch { delete offsetRequests[source]; }
  })();
  offsetRequests[source] = run;
  return run;
}
export function clockOffset(source: TradeSource) { return offsets[source] ?? 0; }

// ---- Per-source trade statistics (last 50 corrected latencies and gaps).
type Stats = { latencies: number[]; gaps: number[]; lastTradeAt: number | null; trades: number };
const stats: Record<TradeSource, Stats> = { binance: { latencies: [], gaps: [], lastTradeAt: null, trades: 0 }, bybit: { latencies: [], gaps: [], lastTradeAt: null, trades: 0 } };
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
export function resetStats(source: TradeSource) { stats[source] = { latencies: [], gaps: [], lastTradeAt: null, trades: 0 }; }
function record(source: TradeSource, latency: number, receivedAt: number) {
  const s = stats[source];
  s.latencies.push(latency); if (s.latencies.length > 50) s.latencies.shift();
  if (s.lastTradeAt !== null) { s.gaps.push(receivedAt - s.lastTradeAt); if (s.gaps.length > 200) s.gaps.shift(); }
  s.lastTradeAt = receivedAt; s.trades++;
}
export function sourceStats(source: TradeSource) {
  const s = stats[source];
  return { medianLatency: median(s.latencies), averageGap: s.gaps.length ? s.gaps.reduce((a, b) => a + b, 0) / s.gaps.length : null, lastTradeAt: s.lastTradeAt, trades: s.trades };
}
export function priceDiagnostics(source: TradeSource | 'poll') {
  const exchange = source === 'bybit' ? 'bybit' : 'binance';
  const snapshot = connectionManager.snapshot(exchange);
  return { ...snapshot, ...sourceStats(exchange), source: source === 'poll' ? 'Polling' : snapshot.source, state: source === 'poll' ? 'Polling' : snapshot.state };
}
if (typeof window !== 'undefined') (window as any).depthLensStats = () => ({ binance: sourceStats('binance'), bybit: sourceStats('bybit'), offsets: { ...offsets } });

const BYBIT_INTERVAL: Record<string, string> = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' };
export const COMPARE_MS = 5000, RECHECK_MS = 600000;

// One session owns the trade sockets. Live price comes only from trades; klines are forwarded for closed-candle correction.
export function livePriceStream(symbol: string, onPrice: (tick: LivePrice) => void, onStatus: (status: PriceStatus) => void, interval = '1m', onKline?: (data: any) => void, onSource?: (source: TradeSource | 'poll') => void, mode: SourceMode = 'binance') {
  let stopped = false, polling = false, comparing = false;
  let current: TradeSource | null = mode === 'auto' ? null : mode;
  let last: number | undefined;
  const lastTime: Record<TradeSource, number> = { binance: -Infinity, bybit: -Infinity };
  const stopFns: Partial<Record<TradeSource, () => void>> = {};
  let pollTimer: ReturnType<typeof setTimeout> | undefined, compareTimer: ReturnType<typeof setTimeout> | undefined, recheckTimer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let currentStatus: PriceStatus = 'Offline';
  onStatus(currentStatus); onSource?.(current ?? 'binance');
  void syncClock('binance'); void syncClock('bybit');
  const status = (next: PriceStatus) => { if (!stopped && next !== currentStatus) { currentStatus = next; onStatus(next); } };
  const select = (source: TradeSource) => { if (current !== source) { current = source; lastTime[source] = -Infinity; } stopPolling(); onSource?.(source); };

  const trade = (source: TradeSource, price: number, time: number, eventTime: number, size?: number, side?: 'Buy' | 'Sell', tradeId?: string) => {
    if (stopped) return;
    const receivedAt = Date.now();
    const latency = Math.round(receivedAt + clockOffset(source) - eventTime);
    record(source, latency, receivedAt);
    if (mode !== 'auto' && source === mode && current !== mode) { select(mode); close(mode === 'binance' ? 'bybit' : 'binance'); }
    if (current === null) select(source); // Auto: first source to trade drives the price while comparing.
    if (source !== current) return;
    if (time < lastTime[source]) return;
    lastTime[source] = time;
    const direction = last === undefined || price === last ? 0 : price > last ? 1 : -1;
    last = price;
    onPrice({ price, time, direction, ...(size === undefined ? {} : { size }), ...(side === undefined ? {} : { side }), eventTime, receivedAt, latency, source: 'trade', exchange: source, tradeId });
    status('Live');
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
      const direction = last === undefined || price === last ? 0 : price > last ? 1 : -1; last = price;
      onPrice({ price, time: Number(data.time) || Date.now(), direction, receivedAt: Date.now(), source: 'poll' });
      onSource?.('poll'); status('Polling');
    } catch { if (!stopped && polling) status('Offline'); }
    finally { clearTimeout(timeout); if (!stopped && polling) pollTimer = setTimeout(poll, 1000); }
  };
  const startPolling = () => { if (!stopped && !polling) { polling = true; void poll(); } };

  const lower = symbol.toLowerCase();
  const open = (source: TradeSource) => {
    if (stopFns[source] || stopped) return;
    const onFailure = (failures: number) => {
      if (stopped || source !== current || failures < 3) return;
      const other: TradeSource = source === 'binance' ? 'bybit' : 'binance';
      // Fixed modes and auto both fail over: open the other exchange and poll until a trade arrives.
      open(other); startPolling(); current = null;
    };
    if (source === 'binance') {
      stopFns.binance = marketStream(`wss://fstream.binance.com/stream?streams=${lower}@aggTrade/${lower}@kline_${interval}`, message => {
        const data = message.data ?? message;
        if (data.k) { if (current === 'binance') onKline?.(data); return; }
        if (data.e !== undefined && data.e !== 'aggTrade') return;
        if (data.s !== symbol) return;
        const price = Number(data.p), time = Number(data.T), eventTime = Number(data.E ?? data.T), size = Number(data.q);
        if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || !Number.isFinite(eventTime)) return;
        trade('binance', price, time, eventTime, Number.isFinite(size) ? size : undefined, data.m === undefined ? undefined : data.m ? 'Sell' : 'Buy');
      }, live => { if (!live && source === current && !polling) status('Offline'); }, { exchange: 'binance', purpose: 'active', onFailure });
    } else {
      const kTopic = `kline.${BYBIT_INTERVAL[interval] ?? '1'}.${symbol}`;
      stopFns.bybit = marketStream('wss://stream.bybit.com/v5/public/linear', message => {
        if (message.topic === kTopic && Array.isArray(message.data)) {
          if (current !== 'bybit') return;
          for (const k of message.data) onKline?.({ k: { t: Number(k.start), o: k.open, h: k.high, l: k.low, c: k.close, x: Boolean(k.confirm) } });
          return;
        }
        if (message.topic !== `publicTrade.${symbol}` || !Array.isArray(message.data)) return;
        // Every trade in the batch, in order.
        for (const t of message.data) {
          const price = Number(t.p), time = Number(t.T), size = Number(t.v), eventTime = Number(message.ts ?? t.T);
          if ((t.s !== undefined && t.s !== symbol) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) continue;
          trade('bybit', price, time, Number.isFinite(eventTime) ? eventTime : time, Number.isFinite(size) ? size : undefined, t.S === 'Sell' ? 'Sell' : t.S === 'Buy' ? 'Buy' : undefined, typeof t.i === 'string' ? t.i : undefined);
        }
      }, live => { if (!live && source === current && !polling) status('Offline'); }, { exchange: 'bybit', purpose: 'active', onFailure, subscription: { op: 'subscribe', args: [`publicTrade.${symbol}`, kTopic] } });
    }
  };
  const close = (source: TradeSource) => { stopFns[source]?.(); delete stopFns[source]; };

  const compare = () => {
    if (stopped) return;
    comparing = true; resetStats('binance'); resetStats('bybit');
    open('binance'); open('bybit');
    compareTimer = setTimeout(() => {
      comparing = false;
      if (stopped) return;
      const b = sourceStats('binance').medianLatency, y = sourceStats('bybit').medianLatency;
      if (b === null && y === null) { compareTimer = setTimeout(compare, COMPARE_MS); return; }
      const winner: TradeSource = b === null ? 'bybit' : y === null ? 'binance' : y < b ? 'bybit' : 'binance';
      console.info(`[DepthLens] Auto source: Binance ${b ?? '—'} ms vs Bybit ${y ?? '—'} ms → ${winner}`);
      select(winner); close(winner === 'binance' ? 'bybit' : 'binance');
      recheckTimer = setTimeout(compare, RECHECK_MS);
    }, COMPARE_MS);
  };

  if (mode === 'auto') compare(); else open(mode);
  return () => { stopped = true; comparing = false; clearTimeout(compareTimer); clearTimeout(recheckTimer); stopPolling(); close('binance'); close('bybit'); };
}
