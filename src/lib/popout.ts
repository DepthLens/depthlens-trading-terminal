// Browser-safe pop-out window rules: URL building/parsing, BroadcastChannel sync messages and the popup lifecycle.
// Popups never touch main chart internals, use at most 1 WebSocket each, same-origin BroadcastChannel only, and never auto-open.
import type { TradeSource } from './live-price';

export const SYNC_CHANNEL = 'depthlens-sync';
export const POPOUT_TOOLS = ['Price Pressure'] as const;
export type PopoutTool = (typeof POPOUT_TOOLS)[number];
export const POPOUT_ROUTE: Record<PopoutTool, string> = { 'Price Pressure': '/popout/pressure' };
export const POPOUT_NAME: Record<PopoutTool, string> = { 'Price Pressure': 'depthlens-pressure' };

export type PressureSection = 'pp' | 'ca';
export const SECTIONS_KEY = 'depthlens-pressure-sections';
export const parseSections = (value: unknown): PressureSection[] => {
  if (value === undefined || value === null) return ['pp'];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return (['pp', 'ca'] as PressureSection[]).filter(s => items.includes(s));
};
export const toggleSection = (sections: PressureSection[], section: PressureSection): PressureSection[] => sections.includes(section) ? sections.filter(s => s !== section) : parseSections([...sections, section]);
export const pressureButtonActive = (open: boolean, sections: PressureSection[]) => open && sections.length > 0;
export type PopoutParams = { symbol: string; tf: number; source: TradeSource; follow: boolean; sections?: PressureSection[] };
export type SyncState = { symbol: string; timeframe: number; source: TradeSource; theme: string };
export type SyncMessage =
  | { type: 'hello'; tool: PopoutTool }
  | { type: 'state'; state: SyncState }
  | { type: 'closed'; tool: PopoutTool }
  | { type: 'bye' };
export type SectionsMessage = { type: 'sections'; sections: PressureSection[] };

export const popoutSupported = (tool: string): tool is PopoutTool => (POPOUT_TOOLS as readonly string[]).includes(tool);

/** Pop-out is used only on desktop when the Tool windows mode is "popout" and the tool supports it. */
export const shouldPopout = (mode: string, tool: string, mobile: boolean) => !mobile && mode === 'popout' && popoutSupported(tool);

export function buildPopoutUrl(tool: PopoutTool, p: PopoutParams): string {
  const q = new URLSearchParams({ symbol: p.symbol, tf: String(p.tf), source: p.source, follow: p.follow ? '1' : '0' });
  q.set('sections', (p.sections ?? ['pp']).join(','));
  return `${POPOUT_ROUTE[tool]}?${q.toString()}`;
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
    sections: parseSections(get('sections')),
  };
}

export type PopupOpener = (url: string, name: string, features: string) => Window | null;

/** Open (or focus) the popup. Must be called inside a user click so popup blockers allow it. Returns null when blocked. */
export function openPopout(tool: PopoutTool, p: PopoutParams, opener: PopupOpener = (u, n, f) => window.open(u, n, f)): Window | null {
  const w = opener(buildPopoutUrl(tool, p), POPOUT_NAME[tool], 'popup=yes,width=1000,height=700');
  if (w) w.focus();
  return w;
}

/** Pop-out tools always start OFF on a page load: strip them from restored tool switches. */
export function stripPopoutTools(tools: Record<string, boolean>, mode: string): Record<string, boolean> {
  if (mode !== 'popout') return tools;
  const next = { ...tools };
  for (const t of POPOUT_TOOLS) next[t] = false;
  return next;
}

export const isSyncMessage = (d: unknown): d is SyncMessage | SectionsMessage => {
  if (!d || typeof d !== 'object') return false;
  const m = d as { type?: unknown; sections?: unknown };
  if (m.type === 'sections') return Array.isArray(m.sections) && m.sections.every(s => s === 'pp' || s === 'ca');
  return ['hello', 'state', 'closed', 'bye'].includes(String(m.type));
};
