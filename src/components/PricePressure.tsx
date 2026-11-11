import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { CandlestickSeries, LineSeries, LineStyle, createSeriesMarkers, type IChartApi, type IPaneApi, type IPanePrimitive, type IPanePrimitivePaneView, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ProfileChart } from './VolumeProfile';
import { CvdResetPrimitive, checkPaneAlignment } from '@/lib/cvd-pane';
import type { Bar } from '@/lib/chart-data';
import { toolDemoEnabled } from '@/lib/tool-demo';
import { PressureEngine, formatK, formatRatio, formatTooltipTime, subPaneHeights, tabPanes, verdictAt, visibleTabs, type PpPane, type PpRow, type PpSettings, type PpTab, type Verdict } from '@/lib/price-pressure';
import { historyFor, loadPressureHistory } from '@/lib/price-pressure-store';

const SUB_A = 'OHLC structural pressure: body, close location, wick rejection and range activity · no trade-side volume';
export const PP_TITLES: Record<PpPane, [string, string]> = {
  pressure: ['Cumulative Candle / Price Pressure', SUB_A],
  balance: ['Cumulative Candle-Direction Balance', 'One target candle = one direction vote'],
  up: ['Up Pressure', 'Cumulative sum of positive bar pressure · ' + SUB_A],
  down: ['Down Pressure', 'Cumulative magnitude of negative bar pressure · ' + SUB_A],
  ratio: ['Up/Down Pressure Ratio', 'Up pressure divided by down pressure · reference 1.0'],
  candles: ['Price Candles', 'Same candles as the main chart'],
};

// Dark background drawn inside each Price Pressure pane in every theme (time-independent, so no alignment risk).
class PaneBackground implements IPanePrimitive<Time> {
  constructor(private color: string) {}
  private views: IPanePrimitivePaneView[] = [{ zOrder: () => 'bottom', renderer: () => ({ draw: t => t.useMediaCoordinateSpace(({ context, mediaSize }) => { context.fillStyle = this.color; context.fillRect(0, 0, mediaSize.width, mediaSize.height); }) }) }];
  paneViews() { return this.views; }
}

type Built = { kind: PpPane; pane: IPaneApi<Time>; series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>; marks: CvdResetPrimitive };
const tfLabel = (m: number) => m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`;
const f = (v: number) => formatK(v, Math.abs(v) < 10 ? 3 : 2);

export function PricePressure({ chartRef, hostRef, symbol, minutes, settings, onChange, mobile, revision, cvd, floating = false, showCandles = false }: {
  chartRef: MutableRefObject<ProfileChart | null>; hostRef: MutableRefObject<HTMLDivElement | null>; symbol: string; minutes: number; settings: PpSettings; onChange: (s: PpSettings) => void; mobile: boolean; revision: number; cvd: boolean; floating?: boolean; showCandles?: boolean;
}) {
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const tab: PpTab = mobile && settings.tab === 'Both' ? 'Pressure' : settings.tab;
  const kinds = tabPanes(tab, mobile);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stripRef = useRef<HTMLDivElement>(null), verdictRef = useRef<HTMLDivElement>(null), pillRef = useRef<HTMLButtonElement>(null);
  const refreshRef = useRef<(() => void) | null>(null), sizeRef = useRef<(() => void) | null>(null), markersRef = useRef<(() => void) | null>(null);
  const [, force] = useState(0);
  useEffect(() => { refreshRef.current?.(); }, [settings.anchor, settings.atr, settings.weights.body, settings.weights.close, settings.weights.wick, settings.lookback, settings.threshold]);
  useEffect(() => { sizeRef.current?.(); }, [settings.heights[0], settings.heights[1], settings.collapsed[0], settings.collapsed[1], cvd]);
  useEffect(() => { markersRef.current?.(); }, [settings.markers, settings.lookback, settings.threshold]);

  useEffect(() => {
    const api = chartRef.current, host = hostRef.current, strip = stripRef.current;
    if (!api || api.disposed || !host || !strip) return;
    const chart: IChartApi = api.chart, range = chart.timeScale().getVisibleLogicalRange();
    const css = getComputedStyle(host);
    const bg = css.getPropertyValue('--pp-bg').trim() || '#0a1322';
    const ownMin = chart.priceScale('right', 0).options().minimumWidth;
    chart.priceScale('right', 0).applyOptions({ minimumWidth: 84 });
    const monochrome = ['navy','bw','royal','navypink'].includes(host.closest('[data-theme]')?.getAttribute('data-theme') ?? 'navy');
    chart.applyOptions({ layout: { panes: { enableResize: true, separatorColor: api.colors.muted, separatorHoverColor: monochrome ? api.colors.muted : api.colors.unsplit } } });
    const fmt = { type: 'custom' as const, formatter: (v: number) => formatK(v), minMove: 0.001 };
    const built: Built[] = kinds.map(kind => {
      const pane = chart.addPane();
      const idx = pane.paneIndex();
      pane.attachPrimitive(new PaneBackground(bg));
      const candle = { upColor: api.colors.up, downColor: api.colors.down, borderVisible: false, priceLineVisible: false, lastValueVisible: true };
      let series: Built['series'];
      if (kind === 'pressure' || kind === 'candles') series = chart.addSeries(CandlestickSeries, { ...candle, wickUpColor: api.colors.up, wickDownColor: api.colors.down, priceFormat: kind === 'candles' ? api.series.options().priceFormat : fmt }, idx);
      else if (kind === 'balance') series = chart.addSeries(CandlestickSeries, { ...candle, wickVisible: false, priceFormat: fmt }, idx);
      else series = chart.addSeries(LineSeries, { color: kind === 'down' ? api.colors.down : kind === 'up' ? api.colors.up : api.colors.unsplit, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3, priceFormat: kind === 'ratio' ? { type: 'custom', formatter: (v: number) => v.toFixed(2), minMove: 0.01 } : fmt }, idx);
      series.priceScale().applyOptions({ minimumWidth: 84, scaleMargins: { top: 0.3, bottom: 0.08 } });
      if (kind === 'ratio') series.createPriceLine({ price: 1, color: api.colors.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '1.0' });
      const marks = new CvdResetPrimitive(chart, api.colors.muted); pane.attachPrimitive(marks);
      return { kind, pane, series, marks };
    });
    const engine = new PressureEngine();
    let disposed = false, rows: PpRow[] = [], plotted: PpRow[] = [], hoverTime: number | null = null, visibleFrom = -Infinity;
    let signature = '', closedCount = -1, rebasing: ReturnType<typeof setTimeout> | undefined, dragged = false, setHeights: number[] = [];
    let markerApi: ISeriesMarkersPluginApi<Time> | null = null, markerKey = '';
    const neutral = api.colors.muted;
    const colorOf = (o: number, c: number) => c > o ? api.colors.up : c < o ? api.colors.down : neutral;
    const pointOf = (kind: PpPane, r: PpRow) => {
      const time = r.time / 1000 as UTCTimestamp;
      if (kind === 'pressure') return { time, ...r.pressure, color: colorOf(r.pressure.open, r.pressure.close), wickColor: colorOf(r.pressure.open, r.pressure.close) };
      if (kind === 'balance') return { time, ...r.balance, color: colorOf(r.balance.open, r.balance.close) };
      if (kind === 'candles') return { time, open: r.bar.open, high: r.bar.high, low: r.bar.low, close: r.bar.close };
      if (kind === 'up') return { time, value: r.upTotal };
      if (kind === 'down') return { time, value: r.downTotal };
      return r.ratio === null ? { time } : { time, value: r.ratio };
    };
    const chartBars = (): Bar[] => api.series.data().filter((b): b is typeof b & Bar => 'open' in b).map(b => ({ time: Number(b.time) * 1000, open: b.open, high: b.high, low: b.low, close: b.close }));
    const position = () => {
      if (disposed || api.disposed || !host.parentElement) return;
      const top0 = host.parentElement.getBoundingClientRect().top;
      let sum = 0;
      built.forEach((b, i) => {
        const el = b.pane.getHTMLElement(), label = labelRefs.current[i];
        if (!el || !label) return;
        label.style.top = `${Math.round(el.getBoundingClientRect().top - top0 + 3)}px`;
        sum += b.pane.getHeight() + 1;
        if (i === 0 && pillRef.current) pillRef.current.style.top = `${Math.round(el.getBoundingClientRect().top - top0 + 4)}px`;
      });
      const extra = (cvdIndex() === null ? chart.timeScale().height() + 2 : 0) + strip.offsetHeight;
      host.parentElement.style.setProperty('--pp-h', `${sum + extra}px`);
      host.parentElement.style.setProperty('--pp-strip', `${strip.offsetHeight}px`);
      host.dataset['ppHeights'] = built.map(b => b.pane.getHeight()).join(',');
    };
    const cvdIndex = () => { const mine = new Set(built.map(b => b.pane.paneIndex())); const p = chart.panes().find(p => p.paneIndex() > 0 && !mine.has(p.paneIndex())); return p ? p.paneIndex() : null; };
    const size = () => {
      if (disposed || api.disposed) return;
      const panes = chart.panes(), total = panes.reduce((a, p) => a + p.getHeight(), 0);
      const ci = cvdIndex(), cvdPane = ci === null ? null : panes[ci]!;
      const s = settingsRef.current;
      if (floating) {
        // Pop-out window: the hidden candle pane shrinks to almost nothing and the tool panes fill the window.
        panes[0]?.setStretchFactor(showCandles ? 1.4 : 0.00001);
        built.forEach((b, i) => b.pane.setStretchFactor(s.collapsed[i] ? 0.02 : showCandles ? 0.6 : 1));
        setHeights = built.map(() => 0);
      } else {
        const h = subPaneHeights(total, built.map((_, i) => ({ ratio: s.heights[i] ?? null, collapsed: s.collapsed[i] ?? false })), cvdPane ? cvdPane.getHeight() : null, mobile);
        if (cvdPane && h.cvd !== null && h.cvd < cvdPane.getHeight()) cvdPane.setHeight(Math.max(80, h.cvd));
        built.forEach((b, i) => b.pane.setHeight(h.pp[i]!));
        setHeights = h.pp;
      }
      requestAnimationFrame(position);
    };
    sizeRef.current = size;
    const label = (kind: PpPane, r: PpRow | undefined) => {
      if (!r) return 'Loading…';
      const t = `${formatTooltipTime(r.time)} · ${symbol} ${tfLabel(minutes)}${r.provisional ? ' · live (provisional)' : ''}`;
      if (kind === 'pressure') return `${t}\nPRESSURE O ${f(r.pressure.open)} H ${f(r.pressure.high)} L ${f(r.pressure.low)} C ${f(r.pressure.close)} · BAR p ${f(r.s.pressure)} · body ${r.s.body.toFixed(3)} close ${r.s.close.toFixed(3)} wick ${r.s.wick.toFixed(3)} activity ${r.s.activity.toFixed(2)}`;
      if (kind === 'balance') return `${t}\nBALANCE O ${f(r.balance.open)} H ${f(r.balance.high)} L ${f(r.balance.low)} C ${f(r.balance.close)} · BAR delta ${r.s.delta > 0 ? '+' : ''}${r.s.delta} · UP ${r.s.up} · DOWN ${r.s.down}`;
      if (kind === 'up') return `${t}\nUP ${f(r.upTotal)} · BAR p ${f(r.s.pressure)}`;
      if (kind === 'down') return `${t}\nDOWN ${f(r.downTotal)} · BAR p ${f(r.s.pressure)}`;
      if (kind === 'ratio') return `${t}\nUP/DOWN ${formatRatio(r.ratio)} · UP ${f(r.upTotal)} · DOWN ${f(r.downTotal)}`;
      return `${t}\nO ${r.bar.open} H ${r.bar.high} L ${r.bar.low} C ${r.bar.close}`;
    };
    const showLabels = () => {
      const r = hoverTime === null ? rows.at(-1) : rows.find(x => x.time === hoverTime);
      built.forEach((b, i) => { const el = labelRefs.current[i]?.querySelector<HTMLElement>('[data-pp-values]'); if (el) el.textContent = label(b.kind, r); });
    };
    const showVerdict = () => {
      const el = verdictRef.current; if (!el) return;
      const v: Verdict = verdictAt(rows, rows.length - 1, settingsRef.current);
      const set = (k: string, val: string) => { const s = el.querySelector<HTMLElement>(`[data-pp="${k}"]`); if (s) { s.textContent = val; s.dataset['tone'] = /BUYERS|BULLISH/.test(val) ? 'up' : /SELLERS|BEARISH/.test(val) ? 'down' : 'flat'; } };
      set('control', v.control); set('attack', v.attack); set('signal', v.signal);
      el.dataset['control'] = v.control; el.dataset['attack'] = v.attack; el.dataset['signal'] = v.signal;
    };
    const pill = () => {
      const el = pillRef.current, lr = chart.timeScale().getVisibleLogicalRange(); if (!el || !lr) return;
      const last = api.series.data().length - 1, back = Math.round(last - lr.to);
      const hidden = last >= 0 && lr.to < last - 0.5;
      el.hidden = !hidden; el.textContent = `HISTORICAL VIEW · ${Math.max(1, back)} BARS BACK`; el.dataset['back'] = String(hidden ? Math.max(1, back) : 0);
    };
    const markers = () => {
      const s = settingsRef.current;
      if (!s.markers) { markerApi?.detach(); markerApi = null; markerKey = ''; return; }
      const list: SeriesMarker<Time>[] = [];
      const firstChart = plotted[0]?.time ?? Infinity;
      rows.forEach((r, i) => { if (r.provisional || r.time < firstChart) return; const v = verdictAt(rows, i, s); if (v.signal === 'BULLISH ABSORPTION') list.push({ time: r.time / 1000 as UTCTimestamp, position: 'belowBar', shape: 'arrowUp', color: api.colors.up, text: 'ABS' }); else if (v.signal === 'BEARISH ABSORPTION') list.push({ time: r.time / 1000 as UTCTimestamp, position: 'aboveBar', shape: 'arrowDown', color: api.colors.down, text: 'ABS' }); });
      const key = list.map(m => `${m.time}${m.shape}`).join();
      if (key === markerKey && markerApi) return;
      markerKey = key;
      if (!markerApi) markerApi = createSeriesMarkers(api.series, list); else markerApi.setMarkers(list);
      host.dataset['ppMarkers'] = String(list.length);
    };
    markersRef.current = () => { markerKey = ''; markers(); };
    const sync = (force = false) => {
      if (disposed || api.disposed) return;
      const bars = chartBars(); if (!bars.length) return;
      const s = settingsRef.current, last = bars.at(-1)!;
      rows = engine.sync(historyFor(symbol, minutes), bars, s, visibleFrom);
      const first = bars[0]!.time;
      plotted = rows.filter(r => r.time >= first);
      const sig = `${bars.length}:${first}:${engine.closedRows().length}:${JSON.stringify([s.anchor, s.weights, s.atr, visibleFrom, historyFor(symbol, minutes).length])}`;
      if (force || sig !== signature) {
        signature = sig; closedCount = engine.closedRows().length;
        const map = new Map(plotted.map(r => [r.time, r]));
        for (const b of built) (b.series as ISeriesApi<'Line'>).setData(bars.map(bar => { const r = map.get(bar.time); return r ? pointOf(b.kind, r) : { time: bar.time / 1000 as UTCTimestamp }; }) as never);
        for (const b of built) b.marks.setBars(plotted as never);
        markers();
      } else {
        const r = rows.at(-1);
        if (r && r.time === last.time) for (const b of built) (b.series as ISeriesApi<'Line'>).update(pointOf(b.kind, r) as never);
      }
      host.dataset['ppRows'] = String(plotted.length); host.dataset['ppClosed'] = String(closedCount);
      showVerdict(); if (hoverTime === null) showLabels(); pill();
    };
    refreshRef.current = () => { sync(true); };
    const loadHistory = () => {
      if (floating || toolDemoEnabled()) return;
      const bars = chartBars(); const first = bars[0]?.time; if (first === undefined) return;
      const s = settingsRef.current, span = minutes * 60000, day = 86400000;
      const anchorStart = s.anchor === 'Daily UTC' ? Math.floor(first / day) * day : s.anchor === 'Weekly' ? Math.floor((first - 4 * day) / (7 * day)) * 7 * day + 4 * day : first;
      void loadPressureHistory(symbol, minutes, first, Math.min(anchorStart, first - (s.atr + 1) * span)).then(() => sync(true));
    };
    // The main series is the single source of candles: poll it (cheap ref read) and recompute only the live row.
    let historyStarted = false;
    const tick = setInterval(() => { if (!historyStarted && api.series.data().length) { historyStarted = true; loadHistory(); } sync(); }, 200);
    const viewport = () => {
      pill();
      if (settingsRef.current.anchor !== 'Visible start') return;
      clearTimeout(rebasing);
      rebasing = setTimeout(() => { if (disposed || api.disposed) return; const v = chart.timeScale().getVisibleRange(); visibleFrom = v ? Number(v.from) * 1000 : -Infinity; sync(true); }, 200);
    };
    const crosshair: Parameters<typeof chart.subscribeCrosshairMove>[0] = e => { hoverTime = e.time === undefined ? null : Number(e.time) * 1000; showLabels(); };
    const down = () => { dragged = true; };
    const up = () => {
      if (!dragged) return; dragged = false;
      const changed = built.some((b, i) => Math.abs(b.pane.getHeight() - (setHeights[i] ?? 0)) > 2);
      position();
      if (!changed) return;
      const total = chart.panes().reduce((a, p) => a + p.getHeight(), 0), s = settingsRef.current;
      const heights = [0, 1].map(i => built[i] ? Math.max(0.05, Math.min(0.55, built[i]!.pane.getHeight() / total)) : s.heights[i] ?? null);
      setHeights = built.map(b => b.pane.getHeight());
      changeRef.current({ ...s, heights });
    };
    host.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    chart.subscribeCrosshairMove(crosshair); chart.timeScale().subscribeVisibleLogicalRangeChange(viewport);
    const observer = new ResizeObserver(() => size()); observer.observe(host);
    const alignment = () => checkPaneAlignment(chart);
    (window as Window & { checkPaneAlignment?: typeof alignment }).checkPaneAlignment = alignment;
    size(); sync(true); if (range) chart.timeScale().setVisibleLogicalRange(range);
    force(n => n + 1);
    return () => {
      disposed = true; clearInterval(tick); clearTimeout(rebasing); observer.disconnect();
      host.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      refreshRef.current = null; sizeRef.current = null; markersRef.current = null;
      const w = window as Window & { checkPaneAlignment?: typeof alignment }; if (w.checkPaneAlignment === alignment) delete w.checkPaneAlignment;
      host.parentElement?.style.removeProperty('--pp-h'); host.parentElement?.style.removeProperty('--pp-strip');
      if (!api.disposed) {
        markerApi?.detach();
        chart.clearCrosshairPosition(); chart.unsubscribeCrosshairMove(crosshair); chart.timeScale().unsubscribeVisibleLogicalRangeChange(viewport);
        for (const b of [...built].reverse()) chart.removePane(b.pane.paneIndex());
        if (!chart.panes().some(p => p.paneIndex() > 0)) chart.priceScale('right', 0).applyOptions({ minimumWidth: ownMin });
      }
    };
  }, [chartRef, hostRef, symbol, minutes, mobile, tab, revision, floating, showCandles]);

  const toggle = (i: number) => { const collapsed = [...settings.collapsed]; collapsed[i] = !collapsed[i]; onChange({ ...settings, collapsed }); };
  const tone = 'data-[tone=up]:text-t-up data-[tone=down]:text-t-down data-[tone=flat]:text-t-muted font-semibold';
  return <>
    {kinds.map((kind, i) => <div key={kind} ref={el => { labelRefs.current[i] = el; }} data-testid={`pp-label-${kind}`} className="pointer-events-none absolute left-2 z-10 max-w-[calc(100%-var(--axis-w,84px)-16px)] text-[10px] leading-tight" style={{ color: 'var(--pp-muted)' }}>
      <div className="flex items-center gap-1"><span className="truncate text-[11px] font-bold" style={{ color: 'var(--pp-text)' }}>{PP_TITLES[kind][0]}</span>
        <button type="button" className="pointer-events-auto grid size-5 shrink-0 place-items-center rounded hover:bg-t-border/40 mobile:size-7" aria-label={`${settings.collapsed[i] ? 'Expand' : 'Collapse'} ${PP_TITLES[kind][0]}`} title={settings.collapsed[i] ? 'Expand pane' : 'Collapse pane'} onClick={() => toggle(i)}>{settings.collapsed[i] ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}</button></div>
      {!settings.collapsed[i] && <><div className="truncate">{PP_TITLES[kind][1]}</div><div data-pp-values className="whitespace-pre-wrap tabular-nums line-clamp-2" style={{ color: 'var(--pp-text)' }} /></>}
    </div>)}
    <button ref={pillRef} type="button" hidden data-testid="pp-pill" className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full border border-t-border bg-t-panel px-3 py-1 text-[10px] font-semibold tracking-wide text-t-accent shadow hover:bg-t-border" onClick={() => chartRef.current?.chart.timeScale().scrollToRealTime()}>HISTORICAL VIEW</button>
    <div ref={stripRef} data-testid="pp-strip" className="shrink-0 border-t border-t-border bg-t-panel text-[11px]">
      <div ref={verdictRef} data-testid="pp-verdict" className="terminal-tabs flex items-center gap-x-4 overflow-x-auto whitespace-nowrap px-3 py-1 tabular-nums">
        <span><span className="text-t-muted">CONTROL: </span><span data-pp="control" className={tone}>—</span></span>
        <span><span className="text-t-muted">ATTACK: </span><span data-pp="attack" className={tone}>—</span></span>
        <span><span className="text-t-muted">SIGNAL: </span><span data-pp="signal" className={tone}>—</span></span>
      </div>
      <div role="tablist" aria-label="Price Pressure view" className="terminal-tabs flex gap-1 overflow-x-auto border-t border-t-border px-2 py-1">
        {visibleTabs(mobile).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onChange({ ...settings, tab: t })} className={`shrink-0 rounded px-2.5 py-0.5 text-xs mobile:min-h-9 mobile:px-3 ${tab === t ? 'bg-t-accent text-t-bg' : 'text-t-muted hover:bg-t-border/50 hover:text-t-text'}`}>{t}</button>)}
      </div>
    </div>
  </>;
}
