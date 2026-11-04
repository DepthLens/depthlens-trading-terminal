import { useEffect, useRef, useState, type MutableRefObject, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type LogicalRange } from 'lightweight-charts';
import { Minus, Maximize2, Minimize2, PanelBottom, X, ExternalLink } from 'lucide-react';
import type { ProfileChart } from '@/components/VolumeProfile';
import { dragWin, focusWin, minimizeWin, openWin, resizeWin, restoreWin, setWin, toggleMax, type Edge, type Win, type WinId, type WmState } from '@/lib/window-manager';

const EDGES: [Edge, string][] = [['n', 'left-2 right-2 -top-1 h-2 cursor-ns-resize'], ['s', 'left-2 right-2 -bottom-1 h-2 cursor-ns-resize'], ['e', 'top-2 bottom-2 -right-1 w-2 cursor-ew-resize'], ['w', 'top-2 bottom-2 -left-1 w-2 cursor-ew-resize'], ['ne', '-right-1 -top-1 size-3 cursor-nesw-resize'], ['nw', '-left-1 -top-1 size-3 cursor-nwse-resize'], ['se', '-right-1 -bottom-1 size-3 cursor-nwse-resize'], ['sw', '-left-1 -bottom-1 size-3 cursor-nesw-resize']];
export type WinContent = { id: WinId; node: ReactNode };

/** Window layer above the chart: only frames/chips take pointer events, the chart stays interactive elsewhere. */
export function ToolWindowLayer({ wm, setWm, open, subtitle, onDock, onClose }: { wm: WmState; setWm: (f: (s: WmState) => WmState) => void; open: WinContent[]; subtitle: string; onDock: (id: WinId) => void; onClose: (id: WinId) => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => { const el = layerRef.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const ids = open.map(o => o.id).join('|');
  useEffect(() => { if (!size.w) return; setWm(s => open.reduce((acc, o) => openWin(acc, o.id, size.w, size.h), s)); }, [ids, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const minimized = open.filter(o => wm.wins[o.id]?.min);
  return <div ref={layerRef} data-testid="window-layer" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
    {size.w > 0 && open.map(o => { const win = wm.wins[o.id]; return win && !win.min ? <FloatingWindow key={o.id} id={o.id} win={win} vw={size.w} vh={size.h} subtitle={subtitle} setWm={setWm} onDock={() => onDock(o.id)} onClose={() => onClose(o.id)}>{o.node}</FloatingWindow> : null; })}
    {minimized.length > 0 && <div className="pointer-events-auto absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1" data-testid="window-chips">
      {minimized.map(o => <button key={o.id} type="button" onClick={() => setWm(s => restoreWin(s, o.id))} aria-label={`Restore ${o.id}`} className="rounded-md border border-t-border bg-t-panel px-2.5 py-1 text-xs text-t-text shadow-md hover:bg-t-border">{o.id}</button>)}
    </div>}
  </div>;
}

function FloatingWindow({ id, win, vw, vh, subtitle, setWm, onDock, onClose, children }: { id: WinId; win: Win; vw: number; vh: number; subtitle: string; setWm: (f: (s: WmState) => WmState) => void; onDock: () => void; onClose: () => void; children: ReactNode }) {
  const rect = win.max ? { x: 0, y: 0, w: vw, h: vh } : win;
  const start = (e: RPointerEvent<HTMLElement>, edge: Edge | null) => {
    if (e.button !== 0 || (win.max && edge)) return;
    if ((e.target as HTMLElement).closest('button') && !edge) return;
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget, sx = e.clientX, sy = e.clientY, base = win;
    el.setPointerCapture(e.pointerId);
    setWm(s => focusWin(s, id));
    const move = (m: PointerEvent) => { if (win.max) return; const next = edge ? resizeWin(base, edge, m.clientX - sx, m.clientY - sy, vw, vh) : dragWin(base, m.clientX - sx, m.clientY - sy, vw, vh); setWm(s => setWin(s, id, { ...next, z: s.wins[id]?.z ?? next.z })); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const btn = 'grid size-6 place-items-center rounded text-t-muted hover:bg-t-border hover:text-t-text';
  return <section role="dialog" aria-label={`${id} window`} data-testid={`window-${id}`} onPointerDown={() => setWm(s => focusWin(s, id))} onWheel={e => e.stopPropagation()}
    className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-t-border bg-t-panel text-t-text shadow-xl" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: win.z }}>
    <header onPointerDown={e => start(e, null)} onDoubleClick={() => setWm(s => toggleMax(s, id))} className="flex h-8 shrink-0 cursor-move select-none items-center gap-2 border-b border-t-border bg-t-bg/60 px-2 text-xs touch-none">
      <span className="font-semibold">{id}</span><span className="truncate text-t-muted">{subtitle}</span>
      <span className="ml-auto flex items-center gap-0.5">
        <button type="button" className={btn} aria-label={`Minimize ${id}`} title="Minimize" onClick={() => setWm(s => minimizeWin(s, id))}><Minus className="size-3.5" /></button>
        <button type="button" className={btn} aria-label={`${win.max ? 'Restore' : 'Maximize'} ${id}`} title={win.max ? 'Restore' : 'Maximize'} onClick={() => setWm(s => toggleMax(s, id))}>{win.max ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
        <button type="button" className={btn} aria-label={`Dock ${id}`} title="Dock" onClick={onDock}><PanelBottom className="size-3.5" /></button>
        <button type="button" className={btn} aria-label={`Close ${id}`} title="Close" onClick={onClose}><X className="size-3.5" /></button>
      </span>
    </header>
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    {!win.max && EDGES.map(([edge, cls]) => <div key={edge} data-edge={edge} onPointerDown={e => start(e, edge)} className={`absolute z-10 touch-none ${cls}`} />)}
  </section>;
}

/** Float button shown on a docked tool. */
export function FloatButton({ id, onFloat, className = '' }: { id: WinId; onFloat: () => void; className?: string }) {
  return <button type="button" onClick={onFloat} aria-label={`Float ${id}`} title="Float as window" className={`z-30 flex items-center gap-1 rounded border border-t-border bg-t-panel/95 px-2 py-0.5 text-[10px] text-t-muted hover:bg-t-border hover:text-t-text ${className}`}><ExternalLink className="size-3" />Float</button>;
}

/** Own chart for floating CVD/Price Pressure: mirrors the main candles and follows its visible logical range (one-way, no feedback). */
export function SatelliteChart({ mainApi, children }: { mainApi: MutableRefObject<ProfileChart | null>; children: (api: MutableRefObject<ProfileChart | null>, host: MutableRefObject<HTMLDivElement | null>, revision: number) => ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null), apiRef = useRef<ProfileChart | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let chart: IChartApi | null = null, mirror: ISeriesApi<'Candlestick'> | null = null, source: ProfileChart | null = null, len = -1, first = 0;
    const follow = (r: LogicalRange | null) => { if (r && chart) chart.timeScale().setVisibleLogicalRange(r); };
    const teardown = () => { if (source && !source.disposed) source.chart.timeScale().unsubscribeVisibleLogicalRangeChange(follow); if (apiRef.current) apiRef.current.disposed = true; apiRef.current = null; chart?.remove(); chart = null; mirror = null; };
    const sync = () => {
      const main = mainApi.current;
      if (!main || main.disposed) { if (source) { teardown(); source = null; setRevision(r => r + 1); } return; }
      if (main !== source) {
        teardown(); source = main; len = -1;
        const o = main.chart.options();
        chart = createChart(host, { autoSize: true, localization: { locale: 'en-US' }, layout: { background: { color: 'transparent' }, textColor: o.layout.textColor }, grid: o.grid, crosshair: { mode: o.crosshair.mode }, rightPriceScale: { visible: true, borderColor: o.rightPriceScale.borderColor }, timeScale: { borderColor: o.timeScale.borderColor, timeVisible: true }, handleScroll: false, handleScale: false });
        mirror = chart.addSeries(CandlestickSeries, { visible: false, priceFormat: main.series.options().priceFormat, lastValueVisible: false, priceLineVisible: false });
        apiRef.current = { chart, series: mirror, probes: new Set(), host, disposed: false, colors: main.colors };
        main.chart.timeScale().subscribeVisibleLogicalRangeChange(follow);
        setRevision(r => r + 1);
      }
      const data = main.series.data(); if (!mirror) return;
      const f = data.length ? Number(data[0]!.time) : 0;
      if (data.length !== len || f !== first) { mirror.setData(data as never); len = data.length; first = f; follow(main.chart.timeScale().getVisibleLogicalRange()); }
      else if (data.length) mirror.update(data[data.length - 1] as never);
    };
    sync(); const timer = setInterval(sync, 500);
    return () => { clearInterval(timer); teardown(); };
  }, [mainApi]);
  return <><div ref={hostRef} className="min-h-0 w-full flex-1" />{apiRef.current && children(apiRef, hostRef, revision)}</>;
}
