import { useEffect, useRef, type MutableRefObject } from 'react';
import { LineStyle, type IPriceLine } from 'lightweight-charts';
import { buildProfile, loadProfile, profileData, applyProfileDelta, subscribeProfileTrades, type ProfileSettings } from '@/lib/volume-profile';
import { toolDemoEnabled } from '@/lib/tool-demo';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import type { TradeSource } from '@/lib/live-price';
import { ProfilePrimitive, nativeLineSample, type OverlayChart, type OverlayProbe, type Palette } from '@/lib/chart-overlays';

export type ProfileChart = OverlayChart & { disposed: boolean; colors: Palette };
export function VolumeProfile({ chartRef, hostRef, source, symbol, settings, spec, mobile, minutes, theme, revision }: { chartRef: MutableRefObject<ProfileChart|null>; hostRef: MutableRefObject<HTMLDivElement|null>; source: TradeSource; symbol: string; settings: ProfileSettings; spec: PriceSpec; mobile: boolean; minutes: number; theme: string; revision: number }) {
  const tooltipRef=useRef<HTMLDivElement>(null), noteRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const api=chartRef.current,host=hostRef.current,tip=tooltipRef.current,note=noteRef.current;
    if(!api||!host||!tip||!note)return;
    const primitive=new ProfilePrimitive(api,settings,api.colors,mobile);
    api.series.attachPrimitive(primitive);api.probes.add(primitive);
    const lines=new Map<string,IPriceLine>();
    const nativeProbe:OverlayProbe={pause:value=>primitive.pause(value),samples:()=>[...lines].map(([name,line])=>nativeLineSample(api,name,line))};
    api.probes.add(nativeProbe);
    let disposed=false,dragging=false,dirty=true, timer:ReturnType<typeof setTimeout>|undefined;
    let fromTime=0,toTime=0,previousStep=0;
    const demo=toolDemoEnabled();
    const recalculate=()=>{
      if(disposed||api.disposed||dragging||primitive.paused){dirty=true;return;}
      const h=api.chart.paneSize().height,top=api.series.coordinateToPrice(0),bottom=api.series.coordinateToPrice(h);
      if(top===null||bottom===null||top<=bottom){dirty=true;return;}
      const data=demo ? { candles: api.series.data().filter(b=>'open' in b).map((b,i)=>({ time:Number(b.time)*1000,low:b.low,high:b.high,volume:100+i*17,buy:(100+i*17)*.6 })),live:[],error:'' } : profileData(source,symbol);
      const visible=api.chart.timeScale().getVisibleRange(),now=Date.now(),hours={'4h':4,'12h':12,'24h':24,'3d':72};
      const from=settings.range==='Visible'?Number(visible?.from??now/1000)*1000:now-hours[settings.range]*3600000;
      const to=settings.range==='Visible'?Number(visible?.to??now/1000)*1000+59000:now;
      const p=buildProfile(data.candles,data.live,bottom,top,spec.minMove,settings,from,to,previousStep);previousStep=p.step;
      fromTime=from;toTime=to;
      primitive.rows=p.rows;primitive.total=p.total;primitive.split=p.split;dirty=false;
      note.textContent=data.error||(!p.total?'Loading volume history…':`VPVR · ${settings.range} · ${p.rows.length} rows${from<now-3*86400000?' · Showing last 3 days':''}`);
      note.dataset['total']=String(p.total);note.dataset['rows']=String(p.rows.length);note.dataset['source']=source;
      if(p.total)for(const [name,raw] of [['POC',p.poc],['VAH',p.vah],['VAL',p.val]] as const){
        const price=Math.round(raw/spec.minMove)*spec.minMove;
        note.dataset[name.toLowerCase()]=String(price);
        const options={price,color:name==='POC'?api.colors.poc:api.colors.muted,lineWidth:1 as const,lineStyle:name==='POC'?LineStyle.Solid:LineStyle.Dashed,axisLabelVisible:true,title:name};
        const line=lines.get(name);if(line)line.applyOptions(options);else lines.set(name,api.series.createPriceLine(options));
      }
      primitive.refresh();
    };
    const schedule=()=>{dirty=true;clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;recalculate();},200);};
    const down=()=>{dragging=true;clearTimeout(timer);};
    const up=()=>{if(!dragging)return;dragging=false;schedule();};
    const move=()=>{if(dragging)schedule();};
    const hover=(e:MouseEvent)=>{const box=host.getBoundingClientRect(),row=primitive.rowAt(e.clientX-box.left,e.clientY-box.top);if(!row||dragging){tip.hidden=true;return;}tip.hidden=false;tip.textContent=`${formatPrice(row.low,spec)} – ${formatPrice(row.high,spec)}
Total: ${row.volume.toLocaleString('en-US',{maximumFractionDigits:4})}
Buy: ${primitive.split?row.buy.toLocaleString('en-US',{maximumFractionDigits:4}):'Unavailable'} · Sell: ${primitive.split?row.sell.toLocaleString('en-US',{maximumFractionDigits:4}):'Unavailable'}
${(row.volume/primitive.total*100).toFixed(2)}% of total`;};
    const leave=()=>{tip.hidden=true;};
    host.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);host.addEventListener('pointermove',move);host.addEventListener('wheel',schedule,{passive:true});
    host.addEventListener('mousemove',hover);host.addEventListener('mouseleave',leave);
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    const observer=new ResizeObserver(schedule);observer.observe(host);
    if(!demo)void loadProfile(source,symbol).then(schedule);
    const unsubscribe=subscribeProfileTrades(source,symbol,trade=>{if(demo||disposed||api.disposed||!primitive.total)return;primitive.total+=applyProfileDelta(primitive.rows,trade,fromTime,settings.range==='Visible'?toTime:Date.now());note.dataset['total']=String(primitive.total);if(!primitive.paused)primitive.refresh();});
    // Only initialise missing history; continuous trades redraw the existing price-anchored rows,
    // without recomputing the POC or changing bins during dragging.
    const initial=setInterval(()=>{if(dirty&&!dragging&&!timer)recalculate();},500);
    const retry=setInterval(()=>{if(!demo)void loadProfile(source,symbol).then(()=>{if(!primitive.total)schedule();});},60000);
    schedule();
    return()=>{disposed=true;unsubscribe();clearTimeout(timer);clearInterval(initial);clearInterval(retry);observer.disconnect();host.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);host.removeEventListener('pointermove',move);host.removeEventListener('wheel',schedule);host.removeEventListener('mousemove',hover);host.removeEventListener('mouseleave',leave);api.probes.delete(primitive);api.probes.delete(nativeProbe);if(!api.disposed){api.chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);api.series.detachPrimitive(primitive);for(const line of lines.values())api.series.removePriceLine(line);}};
  },[source,symbol,spec.precision,spec.minMove,mobile,chartRef,hostRef,settings,minutes,theme,revision]);
  return <><div ref={noteRef} data-testid="volume-profile" aria-label="Volume Profile histogram with POC VAH and VAL" className="pointer-events-none absolute bottom-14 left-3 z-[3] max-w-[70%] text-xs text-t-muted"/><div ref={tooltipRef} hidden role="tooltip" data-testid="volume-profile-tooltip" className="pointer-events-none absolute bottom-16 left-3 z-20 max-w-[calc(100%-80px)] whitespace-pre-line rounded border border-t-border bg-t-panel/95 p-2 text-xs text-t-text"/></>;
}
