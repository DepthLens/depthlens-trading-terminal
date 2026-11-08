// Browser-safe pop-out window rules: URL building/parsing, BroadcastChannel sync messages and the popup lifecycle.
// Popups never touch main chart internals, use at most 1 WebSocket each, same-origin BroadcastChannel only, and never auto-open.
import type { TradeSource } from './live-price';

export const SYNC_CHANNEL = 'depthlens-sync';
export const POPOUT_TOOLS = ['Price Pressure'] as const;
export type PopoutTool = (typeof POPOUT_TOOLS)[number];
export const PRESSURE_ROUTE = '/pressure';
export type PopoutParams = { symbol: string; tf: number; source: TradeSource; follow: boolean };
export type SyncState = { symbol: string; timeframe: number; source: TradeSource; theme: string };
export type SyncMessage =
  | { type: 'hello'; tool: PopoutTool }
  | { type: 'state'; state: SyncState }
  | { type: 'closed'; tool: PopoutTool }
  | { type: 'bye' };

export const popoutSupported = (tool: string): tool is PopoutTool => (POPOUT_TOOLS as readonly string[]).includes(tool);

/** Pop-out is used only on desktop when the Tool windows mode is "popout" and the tool supports it. */
export const shouldPopout = (mode: string, tool: string, mobile: boolean) => !mobile && mode === 'popout' && popoutSupported(tool);

/** URL of the Pressure page, opened in a new browser tab with the current pair, timeframe and source. */
export function buildPressureUrl(p: { symbol: string; tf: number; source: TradeSource }): string {
  return `${PRESSURE_ROUTE}?${new URLSearchParams({ symbol: p.symbol, tf: String(p.tf), source: p.source }).toString()}`;
}

/** Parse a query string or search record into popup parameters with safe defaults. */
export function parsePopoutQuery(search: string | Record<string, unknown>): PopoutParams {
  const get = (k: string): unknown => (typeof search === 'string' ? new URLSearchParams(search).get(k) : search[k]);
  const tf = Number(get('tf'));
  const followRaw = get('follow');
  return {
    symbol: String(get('symbol') || 'BTCUSDT').toUpperCase(),
    tf: Number.isFinite(tf) && tf >= 1 && tf <= 1440 ? Math.round(tf) : 1,
    source: get('source') === 'bybit' ? 'bybit' : 'binance',
    follow: followRaw === undefined || followRaw === null ? true : String(followRaw) !== '0',
  };
}

/** Pop-out tools always start OFF on a page load: strip them from restored tool switches. */
export function stripPopoutTools(tools: Record<string, boolean>, mode: string): Record<string, boolean> {
  if (mode !== 'popout') return tools;
  const next = { ...tools };
  for (const t of POPOUT_TOOLS) next[t] = false;
  return next;
}

export const isSyncMessage = (d: unknown): d is SyncMessage => {
  if (!d || typeof d !== 'object') return false;
  const m = d as { type?: unknown };
  return ['hello', 'state', 'closed', 'bye'].includes(String(m.type));
};
