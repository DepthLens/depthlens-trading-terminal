import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createChart, CandlestickSeries, CrosshairMode, LineStyle, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toolDemoEnabled, demoBars } from '@/lib/tool-demo';
import { aggregate, applyLivePrice, NATIVE, type Bar } from '@/lib/chart-data';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
export { aggregate } from '@/lib/chart-data';
import type { TradeBridge } from '@/components/LiveQuote';
import { VolumeProfile, type ProfileChart } from '@/components/VolumeProfile';
import type { ProfileSettings } from '@/lib/volume-profile';
import type { TradeSource } from '@/lib/live-price';
import { Footprint } from '@/components/Footprint';
import { FOOTPRINT_FIT_SPACING, type FootprintSettings } from '@/lib/footprint-data';
import { CandleTimerPrimitive, checkOverlayStability } from '@/lib/chart-overlays';
import { WhaleTrades } from '@/components/WhaleTrades';
import type { WhaleSettings } from '@/lib/whale-data';
import { Cvd } from '@/components/Cvd';
import { Liquidations } from '@/components/Liquidations';
import type { LiqSettings } from '@/lib/liquidation-data';
import { PricePressure } from '@/components/PricePressure';
import { ControlBar, AttackBar } from '@/components/FlowBars';
import type { FbSettings } from '@/lib/flow-bars';
import type { PpSettings } from '@/lib/price-pressure';
import type { CvdSettings } from '@/lib/cvd-data';
export type { LivePrice } from '@/lib/live-price';
function toColor(el: HTMLElement, name: string) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!ctx || !raw) return 'rgb(128,128,128)';
  ctx.fillStyle = raw; ctx.fillRect(0,0,1,1);
  const [r,g,b] = ctx.getImageData(0,0,1,1).data;
  return `rgb(${r},${g},${b})`;
}
export function PriceChart({ symbol, minutes, theme, priceFormat, bridge, mobile = false, volumeProfile, profileSettings, source = 'binance', candleTimer = true, footprint = false, footprintSettings, cvd = false, cvdSettings, liquidations = false, liqSettings, onLiqHeight, onCvdHeight, whales = false, whaleSettings, pressure = false, pressureSettings, onPressureChange, flowBars = false, flowSettings, onFlowChange, apiOut, whaleFeedHost }: { apiOut?: MutableRefObject<ProfileChart|null>; whaleFeedHost?: HTMLElement|null; symbol: string; minutes: number; theme: string; priceFormat: PriceSpec; bridge: MutableRefObject<TradeBridge>; mobile?: boolean; volumeProfile?: boolean; profileSettings?: ProfileSettings; source?: TradeSource; candleTimer?: boolean; footprint?: boolean; footprintSettings?: FootprintSettings; cvd?:boolean; cvdSettings?:CvdSettings; liquidations?:boolean; liqSettings?:LiqSettings|undefined; onLiqHeight?:(ratio:number)=>void; onCvdHeight?:(ratio:number)=>void; whales?:boolean; whaleSettings?:WhaleSettings; pressure?:boolean; pressureSettings?:PpSettings; onPressureChange?:(s:PpSettings)=>void; flowBars?:boolean; flowSettings?:FbSettings; onFlowChange?:(s:FbSettings)=>void }) {
  const [legendOpen, setLegendOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const spacingRef = useRef(8);
  const profileChartRef = useRef<ProfileChart|null>(null);
  const legendRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState('Connecting');
  const [chartRevision, setChartRevision] = useState(0);
  const timerRef = useRef<CandleTimerPrimitive | null>(null);
  const sourceRef = useRef(source); sourceRef.current = source;
  const timerEnabledRef = useRef(candleTimer); timerEnabledRef.current = candleTimer;
  useEffect(() => { timerRef.current?.setCountdown(candleTimer); }, [candleTimer]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    delete el.dataset['lastClose'];
    setStatus('Connecting');
    const text = toColor(el,'--t-muted'), grid = getComputedStyle(el).getPropertyValue('--t-grid').trim() || toColor(el,'--t-border'), border = toColor(el,'--t-border'), up = toColor(el,'--flow-up'), down = toColor(el,'--flow-down');
    const soft = theme === 'navy' || theme === 'bw' ? getComputedStyle(el).getPropertyValue('--t-crosshair').trim() : toColor(el,'--t-muted').replace('rgb(','rgba(').replace(')',',0.75)'), labelBg = toColor(el,'--t-border');
    const line = { color: soft, width: 1 as const, style: LineStyle.Dashed, visible: true, labelVisible: true, labelBackgroundColor: labelBg };
    // Magnet mode must be present on every chart creation; theme/pair/timeframe all recreate the chart here.
    const crosshairOptions = { mode: CrosshairMode.MagnetOHLC, vertLine: line, horzLine: line };
    const chart = createChart(el, { autoSize:true, localization:{locale:'en-US'}, layout:{ background:{ color:'transparent' }, textColor:text }, grid:{ vertLines:{color:grid},horzLines:{color:grid} }, crosshair:crosshairOptions, rightPriceScale:{visible:true,borderColor:border,scaleMargins:{top:0.08,bottom:0.08}}, timeScale:{borderColor:border,timeVisible:true,barSpacing:8,rightOffset:8} });
    chart.timeScale().applyOptions({barSpacing:spacingRef.current});
    chartRef.current = chart;
    chart.applyOptions({ crosshair: crosshairOptions });
    (el as any).__crosshairMode = chart.options().crosshair.mode;
    const candles = chart.addSeries(CandlestickSeries,{upColor:up,downColor:down,wickUpColor:up,wickDownColor:down,borderVisible:false,priceFormat:{type:'price',...priceFormat},priceLineVisible:true,priceLineStyle:LineStyle.Dotted,lastValueVisible:false});
    const api: ProfileChart = { chart, series: candles, probes: new Set(), host: el, disposed: false, colors: { up, down, muted: text, poc: toColor(el,'--flow-poc'), unsplit: toColor(el,'--flow-unsplit'), valueArea:toColor(el,'--flow-value-area'), labelText: toColor(el,'--t-bg') } };
    profileChartRef.current = api; if (apiOut) apiOut.current = api;
    setChartRevision(value => value + 1);
    // The primitive owns the live price tag (green up / red down) so it keeps its color even when Footprint outlines candles.
    const timer = new CandleTimerPrimitive(api, minutes, () => sourceRef.current, api.colors, priceFormat);
    timer.countdown = timerEnabledRef.current;
    candles.attachPrimitive(timer); api.probes.add(timer); timerRef.current = timer;
    const selfCheck = () => checkOverlayStability(api);
    (window as Window & { checkOverlayStability?: typeof selfCheck }).checkOverlayStability = selfCheck;
    let stopped = false, hovered = false, frame = 0, ready = false;
    let bars: Bar[] = [], rawBars: Bar[] = [];
    const renderedTimes = new Set<number>();
    let latest: Bar | undefined;
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
      renderedTimes.add(latest.time);
      candles.applyOptions({priceLineColor:latest.close>=latest.open?up:down});
      timerRef.current?.setPrice(latest.close, latest.close >= latest.open);
      el.dataset['lastClose'] = formatPrice(latest.close, priceFormat);
      if (!hovered) setLegend({...latest});
      const axisWidth = Math.round(chart.priceScale('right').width()), axis = `${axisWidth}px`;
      if (axisWidth > 0 && el.parentElement && el.parentElement.style.getPropertyValue('--axis-w') !== axis) el.parentElement.style.setProperty('--axis-w', axis);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(flush); };
    const receive = (tick: {time: number; price: number}) => {
      if (stopped || toolDemoEnabled()) return;
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
      if(toolDemoEnabled())return;
      const d = message.data ?? message;
      if (!d.k) return;
      const k=d.k;
      const b: Bar = {time:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c)};
      if (!Number.isFinite(b.time) || !Number.isFinite(b.close)) return;
      // Live price comes only from trades; a closed kline only corrects that candle's final OHLC.
      if (!k.x || !ready || !latest || !NATIVE[minutes]) return;
      if (b.time > latest.time) return;
      if (b.time < latest.time && !renderedTimes.has(b.time)) return;
      candles.update({ ...b, time: (b.time / 1000) as UTCTimestamp }, b.time < latest.time);
      if (b.time === latest.time) { latest = b; schedule(); }
    };
    bridge.current.kline = handle;
    const load = async () => {
      try {
        if(toolDemoEnabled()){bars=demoBars(symbol==='ETHUSDT'?3000:symbol==='DOGEUSDT'?.15:68000,priceFormat.minMove,minutes);latest=bars.at(-1);candles.setData(bars.map(b=>({...b,time:b.time/1000 as UTCTimestamp})));ready=true;flush();chart.timeScale().scrollToRealTime();setStatus('Demo');return;}
        const response=await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${NATIVE[minutes]?1000:1500}`,{signal:abort.signal});
        if (!response.ok) throw new Error('History unavailable');
        const data=await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error('History unavailable');
        if (stopped) return;
        rawBars=data.map(k=>({time:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}));
        bars=NATIVE[minutes]?rawBars:aggregate(rawBars,minutes);
        latest=bars.at(-1);
        candles.setData(bars.map(b=>({...b,time:(b.time/1000) as UTCTimestamp})));
        for (const bar of bars) renderedTimes.add(bar.time);
        ready = true;
        if (!pendingTrades.length && bridge.current.latest) pendingTrades.push(bridge.current.latest);
        for (const tick of pendingTrades) receive(tick);
        pendingTrades = [];
        flush();
        chart.timeScale().scrollToRealTime();
        setStatus('Chart ready');
      } catch {
        if (stopped) return;
        setStatus('History unavailable · retrying'); historyRetry=setTimeout(load,5000);
      }
    };
    void load();
    return () => { spacingRef.current=chart.timeScale().options().barSpacing;stopped=true;api.disposed=true;timerRef.current?.detached();timerRef.current=null;const debugWindow=window as Window & { checkOverlayStability?: typeof selfCheck };if(debugWindow.checkOverlayStability===selfCheck)delete debugWindow.checkOverlayStability;abort.abort();clearTimeout(historyRetry);cancelAnimationFrame(frame);if(bridge.current.receive===receive)bridge.current.receive=null;if(bridge.current.kline===handle)bridge.current.kline=null;chartRef.current=null;profileChartRef.current=null;if(apiOut&&apiOut.current===api)apiOut.current=null;chart.remove(); };
  },[symbol,minutes,theme,priceFormat.precision,priceFormat.minMove,bridge]);

  const zoom = (factor: number) => {
    const scale=chartRef.current?.timeScale(), range=scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const width=Math.max(10,Math.min(2000,(range.to-range.from)*factor));
    const mid=(range.to+range.from)/2;
    scale.setVisibleLogicalRange({from:mid-width/2,to:mid+width/2});
  };
  const reset = () => { const chart=chartRef.current;if (!chart) return;chart.timeScale().applyOptions({barSpacing:8,rightOffset:8});chart.priceScale('right').applyOptions({autoScale:true});chart.timeScale().scrollToRealTime(); };
  const fitFootprint = () => { const chart = chartRef.current; if (!chart) return; chart.timeScale().applyOptions({ barSpacing: FOOTPRINT_FIT_SPACING, rightOffset: 2 }); chart.timeScale().scrollToRealTime(); };
  const buttonClass = mobile ? 'size-10 bg-t-panel/60 text-t-text hover:bg-t-border' : 'text-t-text hover:bg-t-border';
  const legendItems = <>
    {!mobile && <span className="font-semibold text-t-text">{symbol} · {minutes}m</span>}
    {(['open','high','low','close'] as const).map(key=><span key={key} className={mobile && !legendOpen && key!=='close' ? 'hidden' : undefined}><span className={`mr-1 text-t-muted ${mobile ? 'uppercase' : 'capitalize'}`}>{mobile ? key[0] : key}</span><span data-value={key}>—</span></span>)}
    <span data-value="change">—</span>
  </>;
  const showFlow = flowBars && flowSettings && onFlowChange;
  return <div className={`flex h-full w-full flex-col ${mobile ? 'min-h-0' : 'min-h-80'}`}>
    {showFlow&&<ControlBar chartRef={profileChartRef as any} minutes={minutes} symbol={symbol} settings={flowSettings} onChange={onFlowChange} mobile={mobile}/>}
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
    {mobile
      ? <button type="button" ref={legendRef as any} onClick={()=>setLegendOpen(o=>!o)} aria-expanded={legendOpen} aria-label="OHLC legend, tap to expand or collapse" className="terminal-tabs absolute left-1.5 top-1.5 z-10 flex max-w-[calc(100%-var(--axis-w,64px)-56px)] items-center gap-x-2 overflow-x-auto whitespace-nowrap min-h-10 rounded bg-t-panel/60 px-2 text-xs tabular-nums" data-testid="ohlc-legend">{legendItems}</button>
      : <div ref={legendRef as any} className="pointer-events-none z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs tabular-nums" data-testid="ohlc-legend">{legendItems}</div>}
    {toolDemoEnabled()&&<span className="demo-watermark">DEMO DATA</span>}
    <div ref={ref} className="min-h-0 w-full flex-1" aria-label={`${symbol} ${minutes} minute candlestick chart`} />
    {pressure&&pressureSettings&&onPressureChange&&<PricePressure chartRef={profileChartRef} hostRef={ref} symbol={symbol} minutes={minutes} settings={pressureSettings} onChange={onPressureChange} mobile={mobile} revision={chartRevision} cvd={cvd}/>}
    {whales&&whaleSettings&&<WhaleTrades chartRef={profileChartRef} hostRef={ref} source={source} symbol={symbol} spec={priceFormat} settings={whaleSettings} mobile={mobile} minutes={minutes} revision={chartRevision} feedHost={whaleFeedHost}/>}
    {cvd&&cvdSettings&&onCvdHeight&&<Cvd chartRef={profileChartRef} hostRef={ref} source={source} symbol={symbol} minutes={minutes} settings={cvdSettings} mobile={mobile} revision={chartRevision} onHeight={onCvdHeight}/>}
    {liquidations&&liqSettings&&onLiqHeight&&<Liquidations chartRef={profileChartRef} hostRef={ref} source={source} symbol={symbol} minutes={minutes} spec={priceFormat} settings={liqSettings} mobile={mobile} revision={chartRevision} onHeight={onLiqHeight}/>}
    {volumeProfile && profileSettings && <div className={`pointer-events-none absolute inset-x-0 bottom-[calc(var(--cvd-h,0px)+var(--pp-h,0px)+var(--liq-h,0px))] ${mobile?'top-0':'top-8'}`}><VolumeProfile chartRef={profileChartRef} hostRef={ref} source={source} symbol={symbol} settings={profileSettings} spec={priceFormat} mobile={mobile} minutes={minutes} theme={theme} revision={chartRevision}/></div>}
    {footprint && footprintSettings && <div className={`pointer-events-none absolute inset-x-0 bottom-[calc(var(--cvd-h,0px)+var(--pp-h,0px)+var(--liq-h,0px))] ${mobile?'top-0':'top-8'}`}><Footprint chartRef={profileChartRef} hostRef={ref} source={source} symbol={symbol} settings={footprintSettings} spec={priceFormat} mobile={mobile} minutes={minutes} revision={chartRevision}/></div>}
    <div className={mobile ? 'absolute right-[calc(var(--axis-w,64px)+4px)] top-1.5 z-10 flex flex-col gap-1' : 'absolute bottom-[calc(var(--cvd-h,0px)+var(--pp-h,0px)+var(--liq-h,0px)+48px)] left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-md border border-t-border bg-t-panel/95 p-1'}>
      {footprint && <Button variant="ghost" className={`${buttonClass} ${mobile ? 'h-10 w-10 p-1 text-xs' : 'px-2 text-xs'}`} aria-label="Fit footprint" title="Fit footprint" onClick={fitFootprint}>{mobile ? 'Fit' : 'Fit footprint'}</Button>}
      <Button variant="ghost" size="icon" className={buttonClass} aria-label="Zoom In" title="Zoom In" onClick={()=>zoom(0.75)}><ZoomIn /></Button>
      <Button variant="ghost" size="icon" className={buttonClass} aria-label="Zoom Out" title="Zoom Out" onClick={()=>zoom(1.3333)}><ZoomOut /></Button>
      <Button variant="ghost" size="icon" className={buttonClass} aria-label="Reload" title="Reload — latest candle and default zoom" onClick={reset}><RotateCcw /></Button>
    </div>
    {!mobile && <span role="status" className={`pointer-events-none absolute bottom-[calc(var(--pp-strip,0px)+8px)] left-3 text-[10px] ${status==='Live'?'text-t-up':'text-t-muted'}`}>● {status}</span>}
  </div>
    {showFlow&&<AttackBar chartRef={profileChartRef as any} minutes={minutes} symbol={symbol} settings={flowSettings} onChange={onFlowChange} mobile={mobile}/>}
  </div>;
}
