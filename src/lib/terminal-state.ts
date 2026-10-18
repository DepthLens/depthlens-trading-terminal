export const TOOLS = ['Heatmap', 'Volume Profile', 'Footprint', 'DOM', 'CVD', 'Whale Trades', 'Liquidations'] as const;
export const THEMES = ['navy', 'light', 'midnight', 'ocean'] as const;
export const STORAGE_KEY = 'depthlens.terminal.v1';
export type TerminalTab = { symbol: string; minutes: number };
export type TerminalState = { tabs: TerminalTab[]; active: string; tools: Record<string, boolean>; theme: string };
export const initialState = (): TerminalState => ({ tabs: [{ symbol: 'BTCUSDT', minutes: 1 }], active: 'BTCUSDT', tools: Object.fromEntries(TOOLS.map(t => [t, false])), theme: 'navy' });
export function validMinutes(value: string | number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1440 ? n : null;
}
export function restoreState(raw: string | null): TerminalState {
  const fallback = initialState();
  try {
    const d = JSON.parse(raw ?? 'null');
    if (!d || !Array.isArray(d.tabs)) return fallback;
    const tabs: TerminalTab[] = [];
    for (const t of d.tabs) {
      if (typeof t?.symbol !== 'string' || !/^[A-Z0-9]+USDT$/.test(t.symbol) || tabs.some(x => x.symbol === t.symbol)) continue;
      tabs.push({ symbol: t.symbol, minutes: validMinutes(t.minutes) ?? 1 });
      if (tabs.length === 10) break;
    }
    if (!tabs.length) return fallback;
    return { tabs, active: tabs.some(t => t.symbol === d.active) ? d.active : tabs[0]?.symbol ?? 'BTCUSDT', tools: Object.fromEntries(TOOLS.map(t => [t, d.tools?.[t] === true])), theme: THEMES.includes(d.theme) ? d.theme : 'navy' };
  } catch { return fallback; }
}
export function openPair(state: TerminalState, symbol: string): TerminalState {
  if (state.tabs.some(t => t.symbol === symbol)) return { ...state, active: symbol };
  if (state.tabs.length >= 10) return state;
  return { ...state, tabs: [...state.tabs, { symbol, minutes: 1 }], active: symbol };
}
export function closePair(state: TerminalState, symbol: string): TerminalState {
  if (state.tabs.length === 1) return state;
  const index = state.tabs.findIndex(t => t.symbol === symbol);
  const tabs = state.tabs.filter(t => t.symbol !== symbol);
  return { ...state, tabs, active: state.active === symbol ? (tabs[Math.max(0, index - 1)]?.symbol ?? 'BTCUSDT') : state.active };
}
