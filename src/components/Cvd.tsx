import { useEffect, useRef, type MutableRefObject } from 'react';
import { BaselineSeries, CandlestickSeries, HistogramSeries, LineStyle, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { ProfileChart } from './VolumeProfile';
import { buildCvd, cvdPaneHeight, formatCvd, type CvdBar, type CvdSettings } from '@/lib/cvd-data';
import { cvdData, loadBinanceCvd, loadBybitCvd, subscribeCvd } from '@/lib/cvd-store';
import { CvdResetPrimitive, checkPaneAlignment } from '@/lib/cvd-pane';

export function Cvd({ chartRef, hostRef, symbol, minutes, source, settings, mobile, revision, onHeight }: {
  chartRef:MutableRefObject<ProfileChart|null>; hostRef:MutableRefObject<HTMLDivElement|null>; symbol:string; minutes:number; source:'binance'|'bybit'; settings:CvdSettings; mobile:boolean; revision:number; onHeight:(ratio:number)=>void;
}) {
  const legendRef = useRef<HTMLDivElement>(null), noteRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const heightRef = useRef(onHeight); heightRef.current = onHeight;
  const refreshRef = useRef<(()=>void)|null>(null), sizeRef = useRef<(()=>void)|null>(null);
  useEffect(()=>{ refreshRef.current?.(); },[settings.anchor,settings.unit]);
  useEffect(()=>{ sizeRef.current?.(); },[settings.height]);
  useEffect(()=>{
    const api=chartRef.current, host=hostRef.current, legend=legendRef.current, note=noteRef.current;
    if(!api||api.disposed||!host||!legend||!note)return;
    const chart=api.chart, range=chart.timeScale().getVisibleLogicalRange();
    const oldMin=chart.priceScale('right',0).options().minimumWidth;
    chart.priceScale('right',0).applyOptions({minimumWidth:84});
    chart.applyOptions({layout:{panes:{enableResize:true,separatorColor:api.colors.muted,separatorHoverColor:api.colors.unsplit}}});
    const pane=chart.addPane();
    const common={priceFormat:{type:'custom' as const,formatter:formatCvd,minMove:.01},priceLineVisible:false,lastValueVisible:true};
    let series:ISeriesApi<'Baseline'>|ISeriesApi<'Candlestick'>|ISeriesApi<'Histogram'>;
    if(settings.mode==='Candles') series=chart.addSeries(CandlestickSeries,{...common,upColor:api.colors.up,downColor:api.colors.down,wickUpColor:api.colors.up,wickDownColor:api.colors.down,borderVisible:false},pane.paneIndex());
    else if(settings.mode==='Delta histogram') series=chart.addSeries(HistogramSeries,common,pane.paneIndex());
    else series=chart.addSeries(BaselineSeries,{...common,baseValue:{type:'price',price:0},topLineColor:api.colors.up,bottomLineColor:api.colors.down,topFillColor1:api.colors.up,topFillColor2:'transparent',bottomFillColor1:'transparent',bottomFillColor2:api.colors.down,lineWidth:1},pane.paneIndex());
    series.priceScale().applyOptions({minimumWidth:84,scaleMargins:{top:.24,bottom:.12}});
    series.createPriceLine({price:0,color:api.colors.muted,lineStyle:LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});
    const marks=new CvdResetPrimitive(chart,api.colors.muted);pane.attachPrimitive(marks);
    let disposed=false,frame=0,hoverTime:number|null=null, visibleFrom=-Infinity, rebasing:ReturnType<typeof setTimeout>|undefined;
    let rows:CvdBar[]=[],busy=false,dragged=false,lastHeight=0;
    const position=()=>{
      if(disposed||api.disposed)return;
      const element=pane.getHTMLElement();if(!element||!host.parentElement)return;
      const top=element.getBoundingClientRect().top-host.parentElement.getBoundingClientRect().top;
      legend.style.top=`${Math.round(top+6)}px`;note.style.top=`${Math.round(top+pane.getHeight()-20)}px`;
      const ratio=pane.getHeight()/Math.max(1,chart.paneSize(0).height+pane.getHeight());
      if(lastHeight&&dragged&&Math.abs(lastHeight-pane.getHeight())>1)heightRef.current(ratio);
      lastHeight=pane.getHeight();
    };
    const size=()=>{
      if(disposed||api.disposed)return;
      const total=chart.paneSize(0).height+pane.getHeight();
      pane.setHeight(Math.min(Math.max(90,total-90),cvdPaneHeight(total,mobile,settingsRef.current.height)));position();
    };sizeRef.current=size;
    const showLegend=()=>{
      const selected=hoverTime===null?rows.at(-1):rows.find(b=>b.time===hoverTime);
      const s=settingsRef.current;
      legend.replaceChildren();
      const title=document.createElement('span');title.textContent=`CVD (${s.anchor} · ${s.unit}) `;title.className='text-t-muted';legend.append(title);
      const value=document.createElement('span');value.textContent=selected?formatCvd(selected.close):'—';value.className=(selected?.close??0)>=0?'text-t-up':'text-t-down';legend.append(value);
      const delta=document.createElement('span');delta.textContent=`  Δ candle ${selected?formatCvd(selected.delta):'—'}`;delta.className=(selected?.delta??0)>=0?'text-t-up':'text-t-down';legend.append(delta);
      legend.dataset['value']=String(selected?.close??'');legend.dataset['delta']=String(selected?.delta??'');
    };
    const render=()=>{
      frame=0;if(disposed||api.disposed)return;
      const data=cvdData(source,symbol,minutes,settings.mode==='Candles');
      rows=buildCvd(data.bars,settingsRef.current.anchor,settingsRef.current.unit,visibleFrom);
      const times=new Map(rows.map(b=>[b.time/1000,b]));
      // Whitespace at candle times keeps sparse real Bybit history on the shared grid.
      const all=[...new Set([...api.series.data().map(b=>Number(b.time)),...times.keys()])].sort((a,b)=>a-b);
      if(series.seriesType()==='Candlestick') (series as ISeriesApi<'Candlestick'>).setData(all.map(time=>{const b=times.get(time);return b?{time:time as UTCTimestamp,open:b.open,close:b.close,high:b.path?b.high:Math.max(b.open,b.close),low:b.path?b.low:Math.min(b.open,b.close)}:{time:time as UTCTimestamp};}));
      else if(series.seriesType()==='Histogram') (series as ISeriesApi<'Histogram'>).setData(all.map(time=>{const b=times.get(time);return b?{time:time as UTCTimestamp,value:b.delta,color:b.delta>=0?api.colors.up:api.colors.down}:{time:time as UTCTimestamp};}));
      else (series as ISeriesApi<'Baseline'>).setData(all.map(time=>{const b=times.get(time);return b?{time:time as UTCTimestamp,value:b.close}:{time:time as UTCTimestamp};}));
      marks.setBars(rows);showLegend();position();
      note.textContent=source==='bybit'?`CVD since ${data.first===null?'—':new Date(data.first).toISOString().slice(11,16)} (Bybit has no taker history)${data.error?' · '+data.error:''}`:data.error||(!rows.length?'Loading CVD history…':data.limited?'CVD · Loaded history limit (6 pages)':'');
      legend.dataset['source']=source;legend.dataset['rows']=String(rows.length);legend.dataset['pages']=String(data.pages);
      host.dataset['cvdHeight']=String(pane.getHeight());
    };
    const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(render);};refreshRef.current=schedule;
    const load=()=>{
      if(source==='bybit'){void loadBybitCvd(symbol).then(schedule);return;}
      const visible=chart.timeScale().getVisibleRange();
      const from=visible?Number(visible.from)*1000:Date.now();
      // Include the current anchor's start when the visible range begins mid-day/week.
      const s=settingsRef.current;const anchor=s.anchor==='Daily UTC'?Math.floor(from/86400000)*86400000:s.anchor==='Weekly'?Math.floor((from-4*86400000)/(7*86400000))*7*86400000+4*86400000:from;
      void loadBinanceCvd(symbol,minutes,anchor).then(schedule);
      if(settings.mode==='Candles'&&minutes>1)void loadBinanceCvd(symbol,1,from).then(schedule);
    };
    const viewport=()=>{
      if(busy||disposed)return;clearTimeout(rebasing);
      rebasing=setTimeout(()=>{if(disposed||api.disposed)return;const v=chart.timeScale().getVisibleRange();visibleFrom=v?Number(v.from)*1000:-Infinity;load();schedule();},200);
    };
    const crosshair:Parameters<typeof chart.subscribeCrosshairMove>[0]=event=>{hoverTime=event.time===undefined?null:Number(event.time)*1000;showLegend();};
    const down=()=>{dragged=true;},up=()=>{position();dragged=false;};
    host.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
    chart.subscribeCrosshairMove(crosshair);chart.timeScale().subscribeVisibleLogicalRangeChange(viewport);
    const observer=new ResizeObserver(()=>{position();if(pane.getHeight()<90)pane.setHeight(90);});observer.observe(host);
    const unsubscribe=subscribeCvd(schedule);
    const alignment=()=>checkPaneAlignment(chart);
    (window as Window&{checkPaneAlignment?:typeof alignment}).checkPaneAlignment=alignment;
    size();load();schedule();if(range)chart.timeScale().setVisibleLogicalRange(range);viewport();
    return()=>{
      disposed=true;cancelAnimationFrame(frame);clearTimeout(rebasing);unsubscribe();observer.disconnect();host.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);refreshRef.current=null;sizeRef.current=null;
      const w=window as Window&{checkPaneAlignment?:typeof alignment};if(w.checkPaneAlignment===alignment)delete w.checkPaneAlignment;
      if(!api.disposed){chart.unsubscribeCrosshairMove(crosshair);chart.timeScale().unsubscribeVisibleLogicalRangeChange(viewport);pane.detachPrimitive(marks);chart.removePane(pane.paneIndex());chart.priceScale('right',0).applyOptions({minimumWidth:oldMin});}
    };
  },[chartRef,hostRef,symbol,minutes,source,settings.mode,mobile,revision]);
  return <><div ref={legendRef} data-testid="cvd-legend" className="pointer-events-none absolute left-3 z-10 max-w-[calc(100%-100px)] text-xs tabular-nums"/><div ref={noteRef} data-testid="cvd-note" className="pointer-events-none absolute left-3 z-10 max-w-[calc(100%-100px)] truncate text-[10px] text-t-muted"/></>;
}