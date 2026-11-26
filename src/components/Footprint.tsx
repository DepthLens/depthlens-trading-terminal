import { useEffect, useRef, type MutableRefObject } from 'react';
import type { CandlestickSeriesOptions } from 'lightweight-charts';
import { clusterRowTicks, FOOTPRINT_FIT_SPACING, buildCandle, formatVolume, since, type FootprintSettings } from '@/lib/footprint-data';
import { shouldFitFootprint } from '@/lib/tool-layout';
import { toolDemoEnabled, demoFootprint } from '@/lib/tool-demo';
import { backfillFootprint, binanceFootprintFeed, footprintLiveExchange, footprintStore, footprintTail } from '@/lib/footprint-store';
import { baseTicks, effectiveGroup, ensurePages, ensureRecordingStart, isRecordedFootprint, pagesFor, recordedCandle, recordedError, recordingStartMs } from '@/lib/footprint-recorded';
import { FootprintPrimitive, type FootprintBar } from '@/lib/footprint-overlay';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import type { TradeSource } from '@/lib/live-price';
import type { ProfileChart } from '@/components/VolumeProfile';

const SOURCE_NAME: Record<TradeSource, string> = { binance: 'Binance', bybit: 'Bybit' };
const STYLE_KEYS = ['upColor', 'downColor', 'borderVisible', 'borderUpColor', 'borderDownColor', 'wickUpColor', 'wickDownColor', 'wickVisible'] as const;
export const MAX_FOOTPRINT_CANDLES = 300;
const utcTime = (ms: number) => `${new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;

export function Footprint({ chartRef, hostRef, source, symbol, settings, spec, mobile, minutes, revision }: { chartRef: MutableRefObject<ProfileChart | null>; hostRef: MutableRefObject<HTMLDivElement | null>; source: TradeSource; symbol: string; settings: FootprintSettings; spec: PriceSpec; mobile: boolean; minutes: number; revision: number }) {
  const autoGroupRef = useRef(0);
  const fitRef = useRef<{enabled:boolean;minutes:number}|null>(null);
  useEffect(() => {
    const api = chartRef.current; if (!api || api.disposed || !shouldFitFootprint(fitRef.current,true,minutes)) return;
    fitRef.current={enabled:true,minutes};
    api.chart.timeScale().applyOptions({ barSpacing: FOOTPRINT_FIT_SPACING, rightOffset: 2 });
    api.chart.timeScale().scrollToRealTime();
  }, [chartRef, source, symbol, minutes, revision]);
  // Recorded BTCUSDT candles are Binance: keep the forming candle on Binance trades even when Auto picked Bybit.
  useEffect(() => {
    if (source === 'binance' || !isRecordedFootprint(symbol) || toolDemoEnabled()) return;
    return binanceFootprintFeed(symbol, spec.minMove);
  }, [source, symbol, spec.minMove]);
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
      const err = recordedError(), recorded = !demo && isRecordedFootprint(symbol) && !err;
      const recStart = recordingStartMs();
      let group = settings.grouping === 'Auto' ? autoGroupRef.current : settings.grouping;
      if (recorded) group = effectiveGroup(group, baseTicks(minutes));
      const bars: FootprintBar[] = [];
      let loading = 0, before = 0, need: number[] = [];
      const liveEx = footprintLiveExchange(source, symbol), tail = recorded ? footprintTail(liveEx, symbol) : { start: null, trades: [] };
      for (let i = lo; i <= hi; i++) {
        const d = data[i]; if (!d || !('high' in d)) continue;
        const time = Number(d.time);
        let fp = null as FootprintBar['fp'] | null;
        if (recorded) {
          const r = recordedCandle({ start: time * 1000, minutes, tick: spec.minMove, group, ratio: settings.ratio, unit: settings.unit, recStart, tail });
          if (r.kind === 'ok') fp = r.candle;
          else if (r.kind === 'loading') { loading++; fp = { start: time * 1000, rows: [], bid: 0, ask: 0, poc: null, peak: 0, coverage: 'none' }; }
          else { before++; fp = { ...buildCandle(store, time * 1000, minutes, group, settings.ratio, settings.unit), note: 'not-recorded' }; }
        }
        bars.push({ time, open: d.open, close: d.close, high: d.high, low: d.low, fp: fp ?? buildCandle(store, time * 1000, minutes, group, settings.ratio, settings.unit) });
      }
      primitive.bars = bars;
      if (recorded && recStart !== null) {
        // Only the visible candles plus a 3-candle margin are requested; pages far from the view fall out of the LRU.
        const ms = minutes * 60000, d0 = data[Math.max(0, lo - 3)], d1 = data[Math.min(data.length - 1, hi + 3)];
        if (d0 && d1) { const from = Math.max(recStart, Number(d0.time) * 1000), to = Math.min(Date.now(), Number(d1.time) * 1000 + ms); if (to > from) need = pagesFor(from, to, baseTicks(minutes)); }
        if (need.length) void ensurePages(spec.minMove, baseTicks(minutes), need).then(changed => { if (changed) schedule(); });
      } else if (recorded) void ensureRecordingStart().then(t => { if (t !== null) schedule(); });
      const first = since(store);
      const live = `Footprint data since ${first === null ? '—' : new Date(first).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Real trades from ${SOURCE_NAME[source]} only`;
      note.textContent = recorded
        ? `Source: recorded trades (Binance BTCUSDT) from ${recStart === null ? '…' : utcTime(recStart)}${liveEx === 'binance' ? ' · Live candle: Binance' : ` · Live candle: ${SOURCE_NAME[liveEx]} (different exchange, not comparable)`}${loading ? ' · Loading recorded footprint…' : ''}${before ? ' · Older candles: not recorded' : ''}`
        : `${isRecordedFootprint(symbol) && err && !demo ? `Recorded footprint unavailable (${err}) · ` : ''}Source: live · ${live}`;
      Object.assign(note.dataset, { group: String(group), auto: String(settings.grouping === 'Auto'), rowSize: String(+(group * spec.minMove).toPrecision(10)), since: first === null ? '' : String(first), candles: String(bars.filter(b => b.fp.coverage !== 'none').length), partial: String(bars.filter(b => b.fp.coverage === 'partial').length), source, liveSource: recorded ? liveEx : source, recorded: String(recorded), recStart: recStart === null ? '' : String(recStart), loading: String(loading), notRecorded: String(before) });
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
    if (isRecordedFootprint(symbol) && !toolDemoEnabled()) void ensureRecordingStart().then(() => schedule());
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
