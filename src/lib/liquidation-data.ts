import { appendWhale, mergeWhale, newWhale, type WhaleEvent } from './whale-data';
// Browser-safe liquidation rules. "long" = a long position was force-closed (forced sell, red, below zero);
// "short" = a short position was force-closed (forced buy, green, above zero).
export type LiqSide = 'long' | 'short';
export type LiqEvent = { id: string; time: number; side: LiqSide; price: number; qty: number; notional: number };
export type LiqSettings = { bubbles: boolean; threshold: 'Auto' | number; unit: 'USDT' | 'coin'; side: 'Both' | 'Long' | 'Short'; height: number | null };
export const LIQ_KEY = 'depthlens.liquidations.v1';
export const LIQ_DEFAULT: LiqSettings = { bubbles: true, threshold: 'Auto', unit: 'USDT', side: 'Both', height: null };
export const LIQ_PRESETS = [25000, 50000, 100000, 250000, 500000, 1000000];
export const LIQ_DAY = 86400000;
export function restoreLiqSettings(raw: string | null): LiqSettings {
  try {
    const d = JSON.parse(raw ?? 'null'); if (!d) return { ...LIQ_DEFAULT };
    return { bubbles: d.bubbles !== false, threshold: Number.isFinite(d.threshold) && d.threshold > 0 ? d.threshold : 'Auto', unit: d.unit === 'coin' ? 'coin' : 'USDT', side: ['Long', 'Short'].includes(d.side) ? d.side : 'Both', height: Number.isFinite(d.height) && d.height > .05 && d.height < .8 ? d.height : null };
  } catch { return { ...LIQ_DEFAULT }; }
}
const make = (time: number, side: LiqSide, price: number, qty: number, id?: string): LiqEvent | null =>
  Number.isFinite(time) && price > 0 && qty > 0 ? { id: id ?? `${time}:${side}:${price}:${qty}`, time, side, price, qty, notional: price * qty } : null;
/** Binance <symbol>@forceOrder: order side SELL closes a LONG. Uses average price and filled qty when present. */
export function parseBinanceLiq(message: any, symbol: string): LiqEvent | null {
  const o = (message?.data ?? message)?.o; if (!o || o.s !== symbol) return null;
  const side: LiqSide | null = o.S === 'SELL' ? 'long' : o.S === 'BUY' ? 'short' : null; if (!side) return null;
  const ap = Number(o.ap), z = Number(o.z);
  return make(Number(o.T), side, ap > 0 ? ap : Number(o.p), z > 0 ? z : Number(o.q));
}
/** Bybit allLiquidation.<symbol>: S "Buy" means a LONG was liquidated, "Sell" a SHORT. */
export function parseBybitLiq(message: any, symbol: string): LiqEvent[] {
  const rows = Array.isArray(message?.data) ? message.data : message?.data ? [message.data] : [];
  return rows.flatMap((r: any) => { if (r?.s !== symbol) return []; const side: LiqSide | null = r.S === 'Buy' ? 'long' : r.S === 'Sell' ? 'short' : null; const e = side && make(Number(r.T), side, Number(r.p), Number(r.v)); return e ? [e] : []; });
}
export type LiqBar = { time: number; long: number; short: number };
/** Sum per candle of the chart's own timeframe (ms bucket start), in USDT or coin. */
export function bucketLiq(events: LiqEvent[], minutes: number, unit: LiqSettings['unit']): LiqBar[] {
  const size = minutes * 60000, map = new Map<number, LiqBar>();
  for (const e of events) { const t = Math.floor(e.time / size) * size, b = map.get(t) ?? { time: t, long: 0, short: 0 }; b[e.side] += unit === 'coin' ? e.qty : e.notional; map.set(t, b); }
  return [...map.values()].sort((a, b) => a.time - b.time);
}
/** Auto: top 5% of the last 60 minutes, never below 10,000 USDT. */
export function liqAutoThreshold(events: LiqEvent[], now: number) {
  const v = events.filter(e => e.time >= now - 3600000 && e.time <= now).map(e => e.notional).sort((a, b) => a - b);
  return Math.max(10000, v[Math.max(0, Math.ceil(v.length * .95) - 1)] ?? 0);
}
export function liqThreshold(s: LiqSettings, events: LiqEvent[], now: number) { return s.threshold === 'Auto' ? liqAutoThreshold(events, now) : s.threshold; }
export type LiqBubble = WhaleEvent & { liq: LiqSide };
/** Same-side events within 2s and 5 ticks merge, reusing the whale burst rules. */
export function mergeLiq(events: LiqEvent[], tick: number): LiqBubble[] {
  const out: LiqBubble[] = [], open: Partial<Record<LiqSide, LiqBubble>> = {};
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    const t = { id: e.id, time: e.time, price: e.price, quantity: e.qty, side: e.side === 'short' ? 'Buy' as const : 'Sell' as const };
    const cur = open[e.side];
    if (cur && mergeWhale(cur, t, tick)) appendWhale(cur, t);
    else { const b = { ...newWhale(t), liq: e.side }; out.push(b); open[e.side] = b; }
  }
  return out;
}
export function liqRadius(notional: number) { return Math.max(5, Math.min(26, 5 * Math.sqrt(notional / 10000))); }
export function formatLiq(v: number) { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? `${s}${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${s}${(a / 1e3).toFixed(1)}K` : `${s}${a.toFixed(a >= 10 ? 0 : 2)}`; }
export function restoreLiqEvents(raw: unknown, now: number): LiqEvent[] {
  if (!Array.isArray(raw)) return []; const seen = new Set<string>();
  return raw.filter((e: any): e is LiqEvent => Boolean(e && typeof e.id === 'string' && !seen.has(e.id) && seen.add(e.id) && (e.side === 'long' || e.side === 'short') && Number.isFinite(e.time) && e.time >= now - LIQ_DAY && e.time <= now + 60000 && e.price > 0 && e.qty > 0 && e.notional > 0));
}
