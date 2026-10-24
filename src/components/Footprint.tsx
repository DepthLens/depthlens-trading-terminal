import { useEffect, useRef, type MutableRefObject } from 'react';
import type { CandlestickSeriesOptions } from 'lightweight-charts';
import { clusterRowTicks, FOOTPRINT_FIT_SPACING, buildCandle, formatVolume, since, type FootprintSettings } from '@/lib/footprint-data';
import { shouldFitFootprint } from '@/lib/tool-layout';
import { toolDemoEnabled, demoFootprint } from '@/lib/tool-demo';
import { backfillFootprint, footprintStore } from '@/lib/footprint-store';
import { FootprintPrimitive, type FootprintBar } from '@/lib/footprint-overlay';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import type { TradeSource } from '@/lib/live-price';
import type { ProfileChart } from '@/components/VolumeProfile';

const SOURCE_NAME: Record<TradeSource, string> = { binance: 'Binance', bybit: 'Bybit' };
const STYLE_KEYS = ['upColor', 'downColor', 'borderVisible', 'borderUpColor', 'borderDownColor', 'wickUpColor', 'wickDownColor', 'wickVisible'] as const;
export const MAX_FOOTPRINT_CANDLES = 150;

export function Footprint({ chartRef, hostRef, source, symbol, settings, spec, mobile, minutes, revision }: { chartRef: MutableRefObject<ProfileChart | null>; hostRef: MutableRefObject<HTMLDivElement | null>; source: TradeSource; symbol: string; settings: FootprintSettings; spec: PriceSpec; mobile: boolean; minutes: number; revision: number }) {
  const autoGroupRef = useRef(0);
  const fitRef = useRef<{enabled:boolean;minutes:number}|null>(null);
  useEffect(() => {
    const api = chartRef.current; if (!api || api.disposed || !shouldFitFootprint(fitRef.current,true,minutes)) return;
    fitRef.current={enabled:true,minutes};
    api.chart.timeScale().applyOptions({ barSpacing: FOOTPRINT_FIT_SPACING, rightOffset: 2 });
    api.chart.timeScale().scrollToRealTime();
  }, [chartRef, source, symbol, minutes, revision]);
  const noteRef = useRef<HTMLDivElement>(null), hintRef = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const api = chartRef.current, host = hostRef.current, note = noteRef.current, hint = hintRef.current, tip = tipRef.current;
    if (!api || !host || !note || !hint || !tip) return;
    const primitive = new FootprintPrimitive(api, settings, { ...api.colors, clusterText: chartColor(host, '--fp-text'), clusterOutline: chartColor(host, '--fp-outline'), textShadow:chartColor(host,'--flow-shadow') }, mobile);
    api.series.attachPrimitive(primitive); api.probes.add(primitive);
    const opts = api.series.options() as CandlestickSeriesOptions;
    const original = Object.fromEntries(STYLE_KEYS.map(k => [k, opts[k]])) as Partial<CandlestickSeriesOptions>;
    let outlined = false;
    const outline = (on: boolean) => {
      if (on === outlined || api.disposed) return; outlined = on;
      api.series.applyOptions(on ? { upColor: 'rgba(0,0,0,0)', downColor: 'rgba(0,0,0,0)', borderVisible: false, wickVisible: false } : original);
    };
    let disposed = false, dragging = false, timer: ReturnType<typeof setTimeout> | undefined;
    const recalculate = () => {
      if (disposed || api.disposed || dragging || primitive.paused) return;
      const liveStore = footprintStore(source,symbol,spec.minMove), range = api.chart.timeScale().getVisibleLogicalRange();
      const data = api.series.data(), demo=toolDemoEnabled();
      const store=demo?demoFootprint(data.filter(b=>'open' in b).map(b=>({...b,time:Number(b.time)*1000})),spec.minMove):liveStore;
      const h = api.chart.paneSize().height;
      const top = api.series.coordinateToPrice(0), bottom = api.series.coordinateToPrice(h);
      if (!range || !data.length || top === null || bottom === null || top <= bottom) return;
      const count = range.to - range.from;
      const tooMany = count > MAX_FOOTPRINT_CANDLES;
      hint.hidden = !tooMany; primitive.hidden = tooMany; outline(true);
      const lo = Math.max(0, Math.floor(range.from) - 1), hi = Math.min(data.length - 1, Math.ceil(range.to) + 1);
      const pxPerPrice = h / (top - bottom);
      if (settings.grouping === 'Auto') autoGroupRef.current = clusterRowTicks(spec.minMove, pxPerPrice, autoGroupRef.current);
      const group = settings.grouping === 'Auto' ? autoGroupRef.current : settings.grouping;
      const bars: FootprintBar[] = [];
      for (let i = lo; i <= hi; i++) {
        const d = data[i]; if (!d || !('high' in d)) continue;
        const time = Number(d.time);
        bars.push({ time, open: d.open, close: d.close, high: d.high, low: d.low, fp: buildCandle(store, time * 1000, minutes, group, settings.ratio, settings.unit) });
      }
      primitive.bars = bars;
      const first = since(store);
      note.textContent = `Footprint data since ${first === null ? '—' : new Date(first).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Real trades from ${SOURCE_NAME[source]} only`;
      Object.assign(note.dataset, { group: String(group), auto: String(settings.grouping === 'Auto'), rowSize: String(+(group * spec.minMove).toPrecision(10)), since: first === null ? '' : String(first), candles: String(bars.filter(b => b.fp.coverage !== 'none').length), partial: String(bars.filter(b => b.fp.coverage === 'partial').length), source });
      primitive.refresh();
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { timer = undefined; recalculate(); }, 200); };
    const down = () => { dragging = true; clearTimeout(timer); tip.hidden = true; };
    const up = () => { if (!dragging) return; dragging = false; schedule(); };
    const hover = (e: MouseEvent) => {
      if (dragging || primitive.hidden) { tip.hidden = true; return; }
      const box = host.getBoundingClientRect(), hit = primitive.at(e.clientX - box.left, e.clientY - box.top);
      if (!hit) { tip.hidden = true; return; }
      const f = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 4 });
      tip.hidden = false;
      tip.textContent = hit.row
        ? `${formatPrice(hit.row.low, spec)} – ${formatPrice(hit.row.high, spec)}\nBid: ${f(hit.row.bid)} · Ask: ${f(hit.row.ask)}\nDelta: ${f(hit.row.ask - hit.row.bid)} · Total: ${f(hit.row.bid + hit.row.ask)}`
        : `Candle totals${hit.bar.fp.coverage === 'partial' ? ' (partial data)' : ''}\nDelta: ${formatVolume(hit.bar.fp.ask - hit.bar.fp.bid)} · Volume: ${formatVolume(hit.bar.fp.ask + hit.bar.fp.bid)}`;
    };
    const leave = () => { tip.hidden = true; };
    host.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    host.addEventListener('wheel', schedule, { passive: true }); host.addEventListener('mousemove', hover); host.addEventListener('mouseleave', leave);
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    const observer = new ResizeObserver(schedule); observer.observe(host);
    const abort = new AbortController();
    const backfill = () => {
      if(toolDemoEnabled())return;
      const range = api.chart.timeScale().getVisibleLogicalRange(), data = api.series.data();
      const first = range && data[Math.max(0, Math.floor(range.from))];
      if (!first || !range || api.disposed || range.to - range.from > MAX_FOOTPRINT_CANDLES) return;
      void backfillFootprint(source, symbol, spec.minMove, Number(first.time) * 1000, abort.signal).then(ok => { if (ok) schedule(); });
    };
    const refresh = setInterval(() => { if (!dragging && !timer) recalculate(); }, 1000);
    const filler = setInterval(backfill, 4000);
    const initialBackfill = setTimeout(backfill, 600);
    recalculate();
    return () => {
      disposed = true; abort.abort(); clearTimeout(initialBackfill); clearTimeout(timer); clearInterval(refresh); clearInterval(filler); observer.disconnect();
      host.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      host.removeEventListener('wheel', schedule); host.removeEventListener('mousemove', hover); host.removeEventListener('mouseleave', leave);
      api.probes.delete(primitive);
      if (!api.disposed) { api.chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule); api.series.detachPrimitive(primitive); outline(false); }
    };
  }, [source, symbol, spec.minMove, mobile, chartRef, hostRef, settings, minutes, revision]);
  return <>
    <div ref={noteRef} data-testid="footprint" className={`pointer-events-none absolute left-3 z-[3] text-xs text-t-muted ${mobile ? 'bottom-24' : 'bottom-20'}`}/>
    <div ref={hintRef} hidden data-testid="footprint-hint" className="pointer-events-none absolute left-1/2 top-12 z-[3] -translate-x-1/2 rounded border border-t-border bg-t-panel/90 px-2 py-1 text-xs text-t-text">Zoom in or Fit footprint</div>
    <div ref={tipRef} hidden role="tooltip" data-testid="footprint-tooltip" className="pointer-events-none absolute left-3 top-12 z-20 whitespace-pre-line rounded border border-t-border bg-t-panel/95 p-2 text-xs text-t-text"/>
  </>;
}

function chartColor(host: HTMLElement, token: string) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return getComputedStyle(host).getPropertyValue('--t-text').trim();
  ctx.fillStyle = getComputedStyle(host).getPropertyValue(token).trim(); ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}
