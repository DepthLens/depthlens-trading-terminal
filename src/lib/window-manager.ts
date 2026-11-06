// Browser-safe floating tool window rules: geometry, z-order, minimize, dock/float and persistence.
export const WIN_IDS = ['Heatmap', 'DOM', 'CVD', 'Price Pressure', 'Whale feed', 'Book debug'] as const;
export type WinId = typeof WIN_IDS[number];
export type Win = { x: number; y: number; w: number; h: number; min: boolean; max: boolean; z: number };
export type WmState = { mode: 'floating' | 'docked' | 'popout'; docked: Partial<Record<WinId, boolean>>; wins: Partial<Record<WinId, Win>>; z: number };
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const WM_KEY = 'depthlens-windows';
export const MIN_W = 260, MIN_H = 180, CASCADE = 24;
export const DEFAULT_SIZE: Record<WinId, [number, number]> = { Heatmap: [560, 380], DOM: [300, 460], CVD: [480, 240], 'Price Pressure': [520, 380], 'Whale feed': [320, 300], 'Book debug': [320, 260] };
// Pop-out is the desktop default; phones never use it (guarded by the caller) and unsupported tools fall back to floating.
export const wmInitial = (): WmState => ({ mode: 'popout', docked: {}, wins: {}, z: 1 });

/** Keep a window at least MIN size and fully inside the vw×vh layer. */
export function clampWin(win: Win, vw: number, vh: number): Win {
  const w = Math.max(Math.min(MIN_W, vw), Math.min(Math.max(MIN_W, win.w), vw));
  const h = Math.max(Math.min(MIN_H, vh), Math.min(Math.max(MIN_H, win.h), vh));
  return { ...win, w, h, x: Math.max(0, Math.min(win.x, vw - w)), y: Math.max(0, Math.min(win.y, vh - h)) };
}
export const isFloating = (s: WmState, id: WinId) => !(s.docked[id] ?? s.mode === 'docked');
/** Ensure a window exists for an opened tool; new windows cascade by 24px from the previous ones. */
export function openWin(s: WmState, id: WinId, vw: number, vh: number): WmState {
  if (s.wins[id]) return s;
  const n = Object.keys(s.wins).length, [w, h] = DEFAULT_SIZE[id];
  const z = s.z + 1;
  return { ...s, z, wins: { ...s.wins, [id]: clampWin({ x: 16 + n * CASCADE, y: 16 + n * CASCADE, w, h, min: false, max: false, z }, vw, vh) } };
}
const patch = (s: WmState, id: WinId, f: (w: Win) => Win): WmState => { const w = s.wins[id]; return w ? { ...s, wins: { ...s.wins, [id]: f(w) } } : s; };
export const focusWin = (s: WmState, id: WinId): WmState => { const w = s.wins[id]; if (!w || w.z === s.z) return s; const z = s.z + 1; return { ...patch(s, id, x => ({ ...x, z })), z }; };
export const dragWin = (start: Win, dx: number, dy: number, vw: number, vh: number): Win => clampWin({ ...start, x: start.x + dx, y: start.y + dy }, vw, vh);
/** Resize from an edge or corner; the opposite edges stay put and the minimum size wins. */
export function resizeWin(start: Win, edge: Edge, dx: number, dy: number, vw: number, vh: number): Win {
  let { x, y, w, h } = start;
  if (edge.includes('e')) w = Math.min(Math.max(MIN_W, start.w + dx), vw - start.x);
  if (edge.includes('s')) h = Math.min(Math.max(MIN_H, start.h + dy), vh - start.y);
  if (edge.includes('w')) { const right = start.x + start.w; x = Math.max(0, Math.min(start.x + dx, right - MIN_W)); w = right - x; }
  if (edge.includes('n')) { const bottom = start.y + start.h; y = Math.max(0, Math.min(start.y + dy, bottom - MIN_H)); h = bottom - y; }
  return clampWin({ ...start, x, y, w, h }, vw, vh);
}
export const setWin = (s: WmState, id: WinId, win: Win): WmState => patch(s, id, () => win);
export const minimizeWin = (s: WmState, id: WinId) => patch(s, id, w => ({ ...w, min: true }));
export const restoreWin = (s: WmState, id: WinId) => focusWin(patch(s, id, w => ({ ...w, min: false })), id);
export const toggleMax = (s: WmState, id: WinId) => patch(s, id, w => ({ ...w, max: !w.max, min: false }));
export const dockWin = (s: WmState, id: WinId): WmState => ({ ...s, docked: { ...s.docked, [id]: true } });
export const floatWin = (s: WmState, id: WinId): WmState => ({ ...s, docked: { ...s.docked, [id]: false } });
export const setMode = (s: WmState, mode: WmState['mode']): WmState => ({ ...s, mode, docked: {} });
/** Close removes the window frame; the caller turns the matching Tools switch off. */
export const closeWin = (s: WmState, id: WinId): WmState => { const wins = { ...s.wins }; delete wins[id]; return { ...s, wins }; };
export const resetWins = (s: WmState): WmState => ({ ...s, wins: {}, z: 1 });
/** Turn a tool switch off when its window closes (Tools-switch-backed windows only). */
export function closeTool(tools: Record<string, boolean>, id: WinId): Record<string, boolean> {
  return id === 'Heatmap' || id === 'DOM' || id === 'CVD' || id === 'Price Pressure' ? { ...tools, [id]: false } : tools;
}
export function restoreWm(raw: string | null, vw: number, vh: number): WmState {
  const base = wmInitial();
  try {
    const d = raw ? JSON.parse(raw) : null; if (!d || typeof d !== 'object') return base;
    const mode = d.mode === 'docked' ? 'docked' : d.mode === 'popout' ? 'popout' : 'floating';
    const docked: WmState['docked'] = {}, wins: WmState['wins'] = {}; let z = 1;
    for (const id of WIN_IDS) {
      if (typeof d.docked?.[id] === 'boolean') docked[id] = d.docked[id];
      const w = d.wins?.[id];
      if (w && [w.x, w.y, w.w, w.h].every(v => typeof v === 'number' && Number.isFinite(v))) { const zz = Number(w.z) || 1; z = Math.max(z, zz); wins[id] = clampWin({ x: w.x, y: w.y, w: w.w, h: w.h, min: Boolean(w.min), max: Boolean(w.max), z: zz }, vw, vh); }
    }
    return { mode, docked, wins, z };
  } catch { return base; }
}
