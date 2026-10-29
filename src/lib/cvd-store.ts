import type { LivePrice } from './live-price';
import { aggregateDeltas, binanceDelta, deltaBar, klineDelta, cvdInterval, CVD_PAGE_LIMIT, CVD_PAGE_SIZE, type DeltaBar } from './cvd-data';

type BinanceEntry = { bars: Map<number, DeltaBar>; pages: number; exhausted: boolean; pending: Promise<void> | null; error: string; pauseUntil: number; revision: Map<number, number> };
const binance = new Map<string, BinanceEntry>();
const listeners = new Set<() => void>();
export function subscribeCvd(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function notify() { for (const fn of listeners) fn(); }
function entry(symbol: string, minutes: number) {
  const key = `${symbol}:${cvdInterval(minutes)}`;
  let e = binance.get(key);
  if (!e) { e = { bars: new Map(), pages: 0, exhausted: false, pending: null, error: '', pauseUntil: 0, revision: new Map() }; binance.set(key, e); }
  return e;
}
// Six successful/attempted pages maximum per pair/native interval, shared across toggles.
export async function loadBinanceCvd(symbol: string, minutes: number, from = Date.now(), to?: number): Promise<void> {
  const e = entry(symbol, minutes);
  if (e.pending) { await e.pending; if (e.pages < CVD_PAGE_LIMIT && !e.exhausted && Math.min(...e.bars.keys()) > from) return loadBinanceCvd(symbol, minutes, from, to); return; }
  if (e.pauseUntil > Date.now()) return;
  const run = async () => {
    while (e.pages < CVD_PAGE_LIMIT && !e.exhausted) {
      const earliest = e.bars.size ? Math.min(...e.bars.keys()) : Infinity;
      if (earliest <= from) break;
      const end = Number.isFinite(earliest) ? earliest - 1 : to;
      const revisions = new Map(e.revision);
      e.pages++;
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${cvdInterval(minutes)}&limit=${CVD_PAGE_SIZE}${end === undefined ? '' : `&endTime=${Math.floor(end)}`}`);
        if (!response.ok) { if (response.status === 429 || response.status === 418) e.pauseUntil = Date.now() + 60000; throw new Error(`CVD history unavailable (${response.status})`); }
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) throw new Error('CVD history unavailable');
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          const b = binanceDelta(row);
          // A REST response must not replace a newer absolute WebSocket total.
          if (b && (e.revision.get(b.time) ?? 0) === (revisions.get(b.time) ?? 0)) e.bars.set(b.time, b);
        }
        e.error = ''; e.exhausted = rows.length < CVD_PAGE_SIZE; notify();
        if (!rows.length || from === Infinity || from >= Date.now() - 60000) break;
      } catch (error) { e.error = error instanceof Error ? error.message : 'CVD history unavailable'; notify(); break; }
    }
  };
  e.pending = run();
  try { await e.pending; } finally { e.pending = null; }
}
export function addCvdKline(symbol: string, minutes: number, message: { k?: Parameters<typeof klineDelta>[0] }) {
  if (!message.k) return;
  const b = klineDelta(message.k); if (!b) return;
  const e = entry(symbol, minutes);
  e.bars.set(b.time, b); e.revision.set(b.time, (e.revision.get(b.time) ?? 0) + 1); notify();
}
type BybitEntry = { trades: Map<string, { time: number; price: number; size: number; buy: boolean }>; pending: Promise<void> | null; loaded: boolean; error: string; first: number | null };
const bybit = new Map<string, BybitEntry>();
function tradeEntry(symbol: string) {
  let e = bybit.get(symbol);
  if (!e) { e = { trades: new Map(), pending: null, loaded: false, error: '', first: null }; bybit.set(symbol, e); }
  return e;
}
function putTrade(e: BybitEntry, id: string, time: number, price: number, size: number, buy: boolean) {
  if (![time, price, size].every(Number.isFinite) || size <= 0 || price <= 0 || e.trades.has(id)) return;
  e.trades.set(id, { time, price, size, buy }); e.first = e.first === null ? time : Math.min(e.first, time);
  // Bound memory to the actual most recent 24h; the coverage label follows retained data.
  const cutoff = Date.now() - 86400000;
  if (e.trades.size > 200000) for (const [key,t] of e.trades) { if (t.time < cutoff || e.trades.size > 200000) e.trades.delete(key); }
}
export function addCvdTrade(symbol: string, tick: LivePrice) {
  if (tick.exchange !== 'bybit' || tick.source !== 'trade' || tick.size === undefined || !tick.side) return;
  const e = tradeEntry(symbol);
  putTrade(e, tick.tradeId ?? `live:${tick.time}:${tick.receivedAt}:${e.trades.size}`, tick.time, tick.price, tick.size, tick.side === 'Buy'); notify();
}
export async function loadBybitCvd(symbol: string) {
  const e = tradeEntry(symbol); if (e.pending) return e.pending; if (e.loaded) return;
  e.pending = (async () => {
    try {
      const r = await fetch(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${symbol}&limit=1000`);
      if (!r.ok) throw new Error('CVD recent trades unavailable');
      const d = await r.json(); if (d.retCode !== 0 || !Array.isArray(d.result?.list)) throw new Error('CVD recent trades unavailable');
      for (const t of [...d.result.list].reverse()) if ((t.side === 'Buy' || t.side === 'Sell') && typeof t.execId === 'string') putTrade(e, t.execId, Number(t.time), Number(t.price), Number(t.size), t.side === 'Buy');
      e.loaded = true; e.error = '';
    } catch (error) { e.error = error instanceof Error ? error.message : 'CVD recent trades unavailable'; }
    finally { e.pending = null; notify(); }
  })();
  return e.pending;
}
export function cvdData(source: 'binance' | 'bybit', symbol: string, minutes: number, withPath = false) {
  if (source === 'bybit') {
    const e = tradeEntry(symbol), minute = new Map<number, DeltaBar>();
    for (const t of [...e.trades.values()].sort((a,b) => a.time-b.time)) {
      const time = Math.floor(t.time / 60000) * 60000, b = minute.get(time) ?? deltaBar(time, 0, 0), sign = t.buy ? 1 : -1;
      b.quote += sign * t.price * t.size; b.coin += sign * t.size;
      b.quoteHigh = Math.max(b.quoteHigh, b.quote); b.quoteLow = Math.min(b.quoteLow, b.quote); b.coinHigh = Math.max(b.coinHigh, b.coin); b.coinLow = Math.min(b.coinLow, b.coin); b.path = true; minute.set(time,b);
    }
    return { bars: aggregateDeltas([...minute.values()], minutes), error: e.error, first: e.trades.size ? Math.min(...[...minute.keys()]) : null, pages: 0, limited: false };
  }
  const e = entry(symbol, minutes), base = [...e.bars.values()].sort((a,b) => a.time-b.time);
  let bars = cvdInterval(minutes) === '1m' && minutes !== 1 ? aggregateDeltas(base,minutes) : base;
  if (withPath && minutes > 1 && cvdInterval(minutes) !== '1m') {
    const one = entry(symbol,1).bars;
    bars = bars.map(b => {
      const path = [...one.values()].filter(m => m.time >= b.time && m.time < b.time + minutes*60000).sort((a,b) => a.time-b.time);
      if (path.length !== minutes || path[0]?.time !== b.time || path.at(-1)?.time !== b.time+(minutes-1)*60000) return b;
      const p = aggregateDeltas(path,minutes)[0];
      if (!p || Math.abs(p.quote-b.quote) > Math.max(.000001,Math.abs(b.quote)*.0001)) return b;
      return { ...b, quoteHigh: Math.max(p.quoteHigh,b.quote,0), quoteLow: Math.min(p.quoteLow,b.quote,0), coinHigh: Math.max(p.coinHigh,b.coin,0), coinLow: Math.min(p.coinLow,b.coin,0), path: true };
    });
  }
  return { bars, error: e.error, first: bars[0]?.time ?? null, pages: e.pages, limited: e.pages >= CVD_PAGE_LIMIT };
}