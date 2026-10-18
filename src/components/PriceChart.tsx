import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createChart, CandlestickSeries, CrosshairMode, LineStyle, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { aggregate, applyLivePrice, NATIVE, type Bar } from '@/lib/chart-data';
import { marketStream } from '@/lib/market-stream';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
export { aggregate } from '@/lib/chart-data';
import type { TradeBridge } from '@/components/LiveQuote';
export type { LivePrice } from '@/lib/live-price';
function toColor(el: HTMLElement, name: string) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!ctx || !raw) return 'rgb(128,128,128)';
  ctx.fillStyle = raw; ctx.fillRect(0,0,1,1);
  const [r,g,b] = ctx.getImageData(0,0,1,1).data;
  return `rgb(${r},${g},${b})`;
}
export function PriceChart({ symbol, minutes, theme, priceFormat, bridge }: { symbol: string; minutes: number; theme: string; priceFormat: PriceSpec; bridge: MutableRefObject<TradeBridge> }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setStatus('Connecting');
    const text = toColor(el,'--t-muted'), grid = toColor(el,'--t-border'), up = toColor(el,'--t-up'), down = toColor(el,'--t-down');
    const chart = createChart(el, { autoSize:true, localization:{locale:'en-US'}, layout:{ background:{ color:'transparent' }, textColor:text }, grid:{ vertLines:{color:grid},horzLines:{color:grid} }, crosshair:{mode:CrosshairMode.MagnetOHLC}, rightPriceScale:{visible:true,borderColor:grid,scaleMargins:{top:0.08,bottom:0.08}}, timeScale:{borderColor:grid,timeVisible:true,barSpacing:8,rightOffset:8} });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries,{upColor:up,downColor:down,wickUpColor:up,wickDownColor:down,borderVisible:false,priceFormat:{type:'price',...priceFormat},priceLineVisible:true,priceLineStyle:LineStyle.Dotted,lastValueVisible:true});
    let stopped = false, hovered = false, frame = 0, ready = false;
    let bars: Bar[] = [], rawBars: Bar[] = [];
    let latest: Bar | undefined;
    let stopStream: (() => void) | undefined;
    let historyRetry: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const interval = NATIVE[minutes] ?? '1m';
    let pendingTrades: {time: number; price: number}[] = [];
    const setLegend = (bar: Bar | null) => {
      const el = legendRef.current; if (!el) return;
      const change = bar ? (bar.close - bar.open) / bar.open * 100 : 0;
      for (const key of ['open','high','low','close'] as const) {
        const value = el.querySelector<HTMLElement>(`[data-value="${key}"]`);
        if (value) { value.textContent = bar ? formatPrice(bar[key], priceFormat) : '—'; value.className = change < 0 ? 'text-t-down' : 'text-t-up'; }
      }
      const value = el.querySelector<HTMLElement>('[data-value="change"]');
      if (value) { value.textContent = bar ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'; value.className = change < 0 ? 'text-t-down' : 'text-t-up'; }
    };
    setLegend(null);
    const flush = () => {
      frame = 0;
      if (stopped || !ready || !latest) return;
      const time = (latest.time / 1000) as UTCTimestamp;
      candles.update({ ...latest,time });
      candles.applyOptions({priceLineColor:latest.close>=latest.open?up:down});
      el.dataset['lastClose'] = formatPrice(latest.close, priceFormat);
      if (!hovered) setLegend({...latest});
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(flush); };
    const receive = (tick: {time: number; price: number}) => {
      if (stopped) return;
      if (!ready) { pendingTrades.push(tick); return; }
      latest = latest ? applyLivePrice(latest, tick.time, tick.price, minutes) : { time: Math.floor(tick.time / (minutes * 60000)) * minutes * 60000, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
      schedule();
    };
    bridge.current.receive = receive;
    chart.subscribeCrosshairMove(param => {
      const data = param.seriesData.get(candles);
      hovered = Boolean(param.point && param.time !== undefined && data && 'open' in data);
      if (hovered && data && 'open' in data) setLegend({time:Number(data.time)*1000,open:data.open,high:data.high,low:data.low,close:data.close});
      else setLegend(latest ? {...latest} : null);
    });
    const handle = (message: any) => {
      const d = message.data ?? message;
      if (!d.k) return;
      const k=d.k;
      const b: Bar = {time:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c)};
      if (!Number.isFinite(b.time) || !Number.isFinite(b.close)) return;
      // Klines may complete historical candles, but cannot set the active trade price.
      const bucket = Math.floor(b.time / (minutes * 60000)) * minutes * 60000;
      if (!ready || !latest || bucket >= latest.time) return;
      if (NATIVE[minutes]) candles.update({ ...b, time: (b.time / 1000) as UTCTimestamp }, true);

    };
    const load = async () => {
      try {
        const response=await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${NATIVE[minutes]?1000:1500}`,{signal:abort.signal});
        if (!response.ok) throw new Error('History unavailable');
        const data=await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error('History unavailable');
        if (stopped) return;
        rawBars=data.map(k=>({time:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}));
        bars=NATIVE[minutes]?rawBars:aggregate(rawBars,minutes);
        latest=bars.at(-1);
        candles.setData(bars.map(b=>({...b,time:(b.time/1000) as UTCTimestamp})));
        ready = true;
        if (!pendingTrades.length && bridge.current.latest) pendingTrades.push(bridge.current.latest);
        for (const tick of pendingTrades) receive(tick);
        pendingTrades = [];
        flush();
        chart.timeScale().scrollToRealTime();
        stopStream=marketStream(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`,handle, live=>{ if (!stopped) setStatus(live?'Live':'Reconnecting'); });
      } catch {
        if (stopped) return;
        setStatus('History unavailable · retrying'); historyRetry=setTimeout(load,5000);
      }
    };
    void load();
    return () => { stopped=true;abort.abort();clearTimeout(historyRetry);stopStream?.();cancelAnimationFrame(frame);if(bridge.current.receive===receive)bridge.current.receive=null;chartRef.current=null;chart.remove(); };
  },[symbol,minutes,theme,priceFormat.precision,priceFormat.minMove,bridge]);

  const zoom = (factor: number) => {
    const scale=chartRef.current?.timeScale(), range=scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const width=Math.max(10,Math.min(2000,(range.to-range.from)*factor));
    const mid=(range.to+range.from)/2;
    scale.setVisibleLogicalRange({from:mid-width/2,to:mid+width/2});
  };
  const reset = () => { const chart=chartRef.current;if (!chart) return;chart.timeScale().applyOptions({barSpacing:8,rightOffset:8});chart.priceScale('right').applyOptions({autoScale:true});chart.timeScale().scrollToRealTime(); };
  return <div className="relative flex h-full min-h-80 w-full flex-col">
    <div ref={legendRef} className="pointer-events-none z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs tabular-nums" data-testid="ohlc-legend">
      <span className="font-semibold text-t-text">{symbol} · {minutes}m</span>
      {(['open','high','low','close'] as const).map(key=><span key={key}><span className="mr-1 capitalize text-t-muted">{key}</span><span data-value={key}>—</span></span>)}
      <span data-value="change">—</span>
    </div>
    <div ref={ref} className="min-h-0 w-full flex-1" aria-label={`${symbol} ${minutes} minute candlestick chart`} />
    <div className="absolute bottom-12 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-md border border-t-border bg-t-panel/95 p-1">
      <Button variant="ghost" size="icon" className="text-t-text hover:bg-t-border" aria-label="Zoom In" title="Zoom In" onClick={()=>zoom(0.75)}><ZoomIn /></Button>
      <Button variant="ghost" size="icon" className="text-t-text hover:bg-t-border" aria-label="Zoom Out" title="Zoom Out" onClick={()=>zoom(1.3333)}><ZoomOut /></Button>
      <Button variant="ghost" size="icon" className="text-t-text hover:bg-t-border" aria-label="Reload" title="Reload — latest candle and default zoom" onClick={reset}><RotateCcw /></Button>
    </div>
    <span role="status" className={`pointer-events-none absolute bottom-2 left-3 text-[10px] ${status==='Live'?'text-t-up':'text-t-muted'}`}>● {status}</span>
  </div>;
}
