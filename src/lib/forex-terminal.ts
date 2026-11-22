// Browser-safe rules for the Forex terminal: tabs, timeframes and pair kinds. XAUUSDT is the Binance gold perpetual with full order flow.
import { normalizePair, type ForexTf } from './forex-data';
import { restoreState, initialState, type TerminalState, type TerminalTab } from './terminal-state';
export const FX_STORAGE_KEY = 'depthlens.forex.terminal.v1';
export const FX_WM_KEY = 'depthlens.forex.wm.v1';
export const GOLD = 'XAUUSDT';
export const GOLD_NOTE = 'Data: Binance XAUUSDT gold perpetual (close to spot gold, not identical)';
export const FX_UNAVAILABLE = 'Spot forex has no public order book or trade-side data, so this tool cannot show real data for this pair.';
export const FX_TFS: { label: string; min: number; tf: ForexTf }[] = [{ label: '1H', min: 60, tf: '1h' }, { label: '4H', min: 240, tf: '4h' }, { label: '1D', min: 1440, tf: '1d' }, { label: '1W', min: 10080, tf: '1w' }, { label: '1M', min: 43200, tf: '1M' }];
/** Spot forex pairs are written "EUR/USD"; everything else in the Forex terminal is the gold perpetual. */
export const isSpotFx = (symbol: string) => symbol !== GOLD && normalizePair(symbol) === symbol;
export const fxTf = (minutes: number): ForexTf => [...FX_TFS].reverse().find(t => minutes >= t.min)?.tf ?? '1h';
const validTab = (t: TerminalTab) => t.symbol === GOLD ? t.minutes >= 1 && t.minutes <= 1440 : FX_TFS.some(x => x.min === t.minutes);
export function fxInitial(): TerminalState { return { ...initialState(), tabs: [{ symbol: GOLD, minutes: 1 }, { symbol: 'EUR/USD', minutes: 60 }], active: GOLD }; }
export function restoreForexState(raw: string | null): TerminalState {
  const fallback = fxInitial();
  try {
    const d = JSON.parse(raw ?? 'null');
    if (!d || !Array.isArray(d.tabs)) return fallback;
    const base = restoreState(JSON.stringify({ ...d, tabs: [{ symbol: 'BTCUSDT', minutes: 1 }], active: 'BTCUSDT' }));
    const tabs: TerminalTab[] = [];
    for (const t of d.tabs) {
      if (typeof t?.symbol !== 'string' || (t.symbol !== GOLD && !isSpotFx(t.symbol)) || tabs.some(x => x.symbol === t.symbol)) continue;
      const tab = { symbol: t.symbol, minutes: Number(t.minutes) };
      tabs.push(validTab(tab) ? tab : { symbol: t.symbol, minutes: t.symbol === GOLD ? 1 : 60 });
      if (tabs.length === 10) break;
    }
    if (!tabs.length) return fallback;
    return { ...base, tabs, active: tabs.some(t => t.symbol === d.active) ? d.active : tabs[0]!.symbol };
  } catch { return fallback; }
}
/** 24h change from saved 1h closes (oldest first). */
export function fxQuote(closes: { time: number; close: number }[]): { price: number; change: number; quoteVolume: number } | null {
  const last = closes[closes.length - 1]; if (!last) return null;
  const ref = closes.find(c => c.time >= last.time - 86400) ?? closes[0]!;
  return { price: last.close, change: ref.close ? (last.close - ref.close) / ref.close * 100 : 0, quoteVolume: 0 };
}
