import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { aggregate, applyTrade, NATIVE, type Bar } from '@/lib/chart-data';
import { marketStream } from '@/lib/market-stream';
export { aggregate } from '@/lib/chart-data';
export type LiveTick = { price: number; direction: number };
function toColor(el: HTMLElement, name: string) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!ctx || !raw) return 'rgb(128,128,128)';
  ctx.fillStyle = raw; ctx.fillRect(0,0,1,1);
  const [r,g,b] = ctx.getImageData(0,0,1,1).data;
  return `rgb(${r},${g},${b})`;
}
const format = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
export function PriceChart({ symbol, minutes, theme, onTick }: { symbol: string; minutes: number; theme: string; onTick: (tick: LiveTick) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const [legend, setLegend] = useState<Bar | null>(null);
  const [status, setStatus] = useState('Connecting');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLegend(null); setStatus('Connecting');
    const text = toColor(el,'--t-muted'), grid = toColor(el,'--t-border'), up = toColor(el,'--t-up'), down = toColor(el,'--t-down');
    const chart = createChart(el, { autoSize:true, layout:{ background:{ color:'transparent' }, textColor:text }, grid:{ vertLines:{color:grid},horzLines:{color:grid} }, rightPriceScale:{borderColor:grid,scaleMargins:{top:0.13,bottom:0.25}}, timeScale:{borderColor:grid,timeVisible:true,barSpacing:8,rightOffset:5} });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries,{upColor:up,downColor:down,wickUpColor:up,wickDownColor:down,borderVisible:false});
    const volume = chart.addSeries(HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'}});
    chart.priceScale('volume').applyOptions({scaleMargins:{top:0.82,bottom:0}});
    let stopped = false, hovered = false, frame = 0;
    let bars: Bar[] = [], rawBars: Bar[] = [];
    let latest: Bar | undefined;
    let lastPrice: number | undefined, lastId = -1;
    let recentTrades: {time:number;price:number;quantity:number}[] = [];
    let stopStream: (() => void) | undefined;
    let historyRetry: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const interval = NATIVE[minutes] ?? '1m';
    const flush = () => {
      frame = 0;
      if (stopped || !latest) return;
      const time = (latest.time / 1000) as UTCTimestamp;
      candles.update({ ...latest,time });
      volume.update({time,value:latest.volume,color:latest.close>=latest.open?up:down});
      if (!hovered) setLegend({...latest});
      if (lastPrice !== undefined) tickRef.current({price:latest.close,direction:latest.close>lastPrice?1:latest.close<lastPrice?-1:0});
      lastPrice = latest.close;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(flush); };
    chart.subscribeCrosshairMove(param => {
      const data = param.seriesData.get(candles);
      hovered = Boolean(param.point && param.time !== undefined && data && 'open' in data);
      if (hovered && data && 'open' in data) setLegend({time:Number(data.time)*1000,open:data.open,high:data.high,low:data.low,close:data.close,volume:0});
      else setLegend(latest ? {...latest} : null);
    });
    const handle = (message: any) => {
      const d = message.data ?? message;
      if (d.e === 'aggTrade') {
        const id = Number(d.a), time = Number(d.T), price = Number(d.p), quantity = Number(d.q);
        if (id <= lastId || !Number.isFinite(time) || !(price>0) || !(quantity>=0)) return;
        lastId=id;
        recentTrades.push({time,price,quantity});
        recentTrades = recentTrades.filter(t=>t.time>=time-10000);
        const next = applyTrade(latest,time,price,quantity,minutes);
        if (next === latest) return;
        // Flush the previous bucket before advancing, even within one animation frame.
        if (latest && next.time > latest.time) { cancelAnimationFrame(frame); flush(); }
        latest=next; schedule();
      } else if (d.k) {
        const k=d.k;
        const b: Bar = {time:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v)};
        if (!Number.isFinite(b.time) || !Number.isFinite(b.close)) return;
        if (NATIVE[minutes]) {
          if (latest && b.time<latest.time) return;
          let updated=b;
          for (const t of recentTrades.filter(t=>t.time>Number(d.E))) updated=applyTrade(updated,t.time,t.price,t.quantity,minutes);
          if (latest && updated.time>latest.time) { cancelAnimationFrame(frame); flush(); }
          latest=updated;
        } else {
          const bucket=Math.floor(b.time/(minutes*60000))*minutes*60000;
          if (latest && bucket<latest.time) return;
          rawBars=rawBars.filter(x=>x.time>=bucket && x.time!==b.time); rawBars.push(b); rawBars.sort((a,b)=>a.time-b.time);
          let updated=aggregate(rawBars,minutes).at(-1);
          for (const t of recentTrades.filter(t=>t.time>Number(d.E))) updated=applyTrade(updated,t.time,t.price,t.quantity,minutes);
          if (!updated) return;
          if (latest && updated.time>latest.time) { cancelAnimationFrame(frame); flush(); }
          latest=updated;
        }
        schedule();
      }
    };
    const load = async () => {
      try {
        const response=await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${NATIVE[minutes]?1000:1500}`,{signal:abort.signal});
        if (!response.ok) throw new Error('History unavailable');
        const data=await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error('History unavailable');
        if (stopped) return;
        rawBars=data.map(k=>({time:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
        bars=NATIVE[minutes]?rawBars:aggregate(rawBars,minutes);
        latest=bars.at(-1);
        candles.setData(bars.map(b=>({...b,time:(b.time/1000) as UTCTimestamp})));
        volume.setData(bars.map(b=>({time:(b.time/1000) as UTCTimestamp,value:b.volume,color:b.close>=b.open?up:down})));
        if (latest) { setLegend({...latest}); tickRef.current({price:latest.close,direction:0}); lastPrice=latest.close; }
        chart.timeScale().scrollToRealTime();
        stopStream=marketStream(`wss://fstream.binance.com/stream?streams=${symbol.toLowerCase()}@kline_${interval}/${symbol.toLowerCase()}@aggTrade`,handle, live=>{ if (!stopped) setStatus(live?'Live':'Reconnecting'); });
      } catch {
        if (stopped) return;
        setStatus('History unavailable · retrying'); historyRetry=setTimeout(load,5000);
      }
    };
    void load();
    return () => { stopped=true;abort.abort();clearTimeout(historyRetry);stopStream?.();cancelAnimationFrame(frame);chartRef.current=null;chart.remove(); };
  },[symbol,minutes,theme]);
  const zoom = (factor: number) => {
    const scale=chartRef.current?.timeScale(), range=scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const width=Math.max(10,Math.min(2000,(range.to-range.from)*factor));
    const mid=(range.to+range.from)/2;
    scale.setVisibleLogicalRange({from:mid-width/2,to:mid+width/2});
  };
  const reset = () => { const chart=chartRef.current;if (!chart) return;chart.timeScale().applyOptions({barSpacing:8,rightOffset:5});chart.priceScale('right').applyOptions({autoScale:true});chart.timeScale().scrollToRealTime(); };
  const change=legend?(legend.close-legend.open)/legend.open*100:0;
  return <div className="relative h-full min-h-80 w-full">
    <div ref={ref} className="absolute inset-0" aria-label={`${symbol} ${minutes} minute candlestick chart`} />
    <div className="pointer-events-none absolute left-3 right-20 top-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums" data-testid="ohlc-legend">
      <span className="font-semibold text-t-text">{symbol} · {minutes}m</span>
      {(['open','high','low','close'] as const).map(key=><span key={key} className={legend&&change<0?'text-t-down':'text-t-up'}><span className="mr-1 capitalize text-t-muted">{key}</span>{legend?format(legend[key]):'—'}</span>)}
      <span className={change<0?'text-t-down':'text-t-up'}>{legend?`${change>=0?'+':''}${change.toFixed(2)}%`:'—'}</span>
    </div>
    <div className="absolute bottom-12 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-md border border-t-border bg-t-panel/95 p-1">
      <Button variant="ghost" size="icon" className="text-t-text hover:bg-t-border" aria-label="Zoom In" title="Zoom In" onClick={()=>zoom(0.75)}><ZoomIn /></Button>
      <Button variant="ghost" size="icon" className="text-t-text hover:bg-t-border" aria-label="Zoom Out" title="Zoom Out" onClick={()=>zoom(1.3333)}><ZoomOut /></Button>
      <Button variant="ghost" size="icon" className="text-t-text hover:bg-t-border" aria-label="Reload" title="Reload — latest candle and default zoom" onClick={reset}><RotateCcw /></Button>
    </div>
    <span role="status" className={`pointer-events-none absolute bottom-2 left-3 text-[10px] ${status==='Live'?'text-t-up':'text-t-muted'}`}>● {status}</span>
  </div>;
}
