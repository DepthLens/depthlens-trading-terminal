import { useEffect, useRef, type MutableRefObject } from 'react';
import { LineStyle, type IPriceLine } from 'lightweight-charts';
import { buildProfile, loadProfile, profileData, applyProfileDelta, subscribeProfileTrades, periodRange, RANGE_LABEL, type ProfileSettings } from '@/lib/volume-profile';
import { coverageNote, isRecordedProfile, levelStats, loadTradeProfile, nakedPocs, profileBin, subscribeTail, tailAfter, type Level } from '@/lib/volume-profile-recorded';
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
    const nativeProbe:OverlayProbe={pause:value=>primitive.pause(value),samples:()=>[...lines,...nakedLines].map(([name,line])=>nativeLineSample(api,name,line))};
    api.probes.add(nativeProbe);
    let disposed=false,dragging=false,dirty=true, timer:ReturnType<typeof setTimeout>|undefined;
    let fromTime=0,toTime=0,previousStep=0;
    const demo=toolDemoEnabled();
    // Binance BTCUSDT builds from recorded trades; every other pair keeps the candle method unchanged.
    const recorded=!demo&&isRecordedProfile(symbol);
    let generation=0,cutoff=Infinity,liveOpen=false,recordedReady=false;
    const setLines=(p:{total:number;poc:number;vah:number;val:number})=>{
      if(p.total)for(const [name,raw] of [['POC',p.poc],['VAH',p.vah],['VAL',p.val]] as const){
        const price=Math.round(raw/spec.minMove)*spec.minMove;
        note.dataset[name.toLowerCase()]=String(price);
        const options={price,color:name==='POC'?api.colors.poc:api.colors.muted,lineWidth:1 as const,lineStyle:name==='POC'?LineStyle.Solid:LineStyle.Dashed,axisLabelVisible:true,title:name};
        const line=lines.get(name);if(line)line.applyOptions(options);else lines.set(name,api.series.createPriceLine(options));
      }
    };
    const window_=()=>{
      const visible=api.chart.timeScale().getVisibleRange(),now=Date.now();
      const vis=visible?{from:Number(visible.from)*1000,to:Number(visible.to)*1000+59000}:null;
      return periodRange(settings,now,vis);
    };
    const candleCalc=(bottom:number,top:number,prefix='')=>{
      const data=demo ? { candles: api.series.data().filter(b=>'open' in b).map((b,i)=>({ time:Number(b.time)*1000,low:b.low,high:b.high,volume:100+i*17,buy:(100+i*17)*.6 })),live:[],error:'' } : profileData(source,symbol);
      const now=Date.now(),{from,to}=window_();
      const p=buildProfile(data.candles,data.live,bottom,top,spec.minMove,settings,from,to,previousStep);previousStep=p.step;
      fromTime=from;toTime=to;
      primitive.rows=p.rows;primitive.total=p.total;primitive.split=p.split;primitive.delta=false;dirty=false;
      note.textContent=prefix+(data.error||(!p.total?'Loading volume history…':`VPVR · ${settings.range} · ${p.rows.length} rows${from<now-3*86400000?' · Showing last 3 days':''}${demo?'':' · Source: candles/live'}`));
      note.dataset['total']=String(p.total);note.dataset['rows']=String(p.rows.length);note.dataset['source']=source;delete note.dataset['coverage'];
      setLines(p);
      primitive.refresh();
    };
    const recordedCalc=(bottom:number,top:number)=>{
      const {from,to}=window_();
      const probe=buildProfile([],[],bottom,top,spec.minMove,settings,from,to,previousStep);
      const bin=profileBin(probe.step,spec.minMove),gen=++generation;
      dirty=false;
      if(!recordedReady){note.textContent='Loading recorded trades…';}
      void loadTradeProfile(from,to,bin).then(rec=>{
        if(disposed||api.disposed||gen!==generation)return;
        const open=to>=Date.now()-60000;
        const live=open?tailAfter(rec.cutoff,Date.now()+1).filter(t=>t.time>=from):[];
        const trades=rec.levels.map(([price,buy,sell])=>({time:from,price,volume:buy+sell,buy}));
        for(const t of live)trades.push({time:t.time,price:t.price,volume:t.size,buy:t.buy});
        const p=buildProfile([],trades,bottom,top,spec.minMove,settings,from,open?Infinity:to,previousStep);previousStep=p.step;
        fromTime=from;toTime=open?Infinity:to;cutoff=open?rec.cutoff:Infinity;liveOpen=open;recordedReady=true;
        primitive.rows=p.rows;primitive.total=p.total;primitive.split=true;primitive.delta=settings.delta;
        const coverage=coverageNote(rec,from,live.length>0);
        note.textContent=`VPVR · ${RANGE_LABEL[settings.range]} · ${p.rows.length} rows · Source: recorded trades (Binance BTCUSDT)${coverage?` · ${coverage}`:''}${open&&source!=='binance'?' · newest trades refresh every 10s':''}`;
        note.dataset['total']=String(p.total);note.dataset['rows']=String(p.rows.length);note.dataset['source']='recorded';note.dataset['coverage']=coverage;note.dataset['bin']=String(bin);note.dataset['from']=String(from);note.dataset['to']=String(to);
        setLines(p);
        primitive.refresh();
      }).catch((error:unknown)=>{
        if(disposed||api.disposed||gen!==generation)return;
        // Without recorded trades (signed out, network), fall back honestly to the candle method.
        candleCalc(bottom,top,`Recorded trades unavailable (${error instanceof Error?error.message:'error'}) · `);
        if(!profileData(source,symbol).candles.length)void loadProfile(source,symbol).then(()=>{if(!disposed)candleCalc(bottom,top,'Recorded trades unavailable · ');});
      });
    };
    const recalculate=()=>{
      if(disposed||api.disposed||dragging||primitive.paused){dirty=true;return;}
      const h=api.chart.paneSize().height,top=api.series.coordinateToPrice(0),bottom=api.series.coordinateToPrice(h);
      if(top===null||bottom===null||top<=bottom){dirty=true;return;}
      if(recorded)recordedCalc(bottom,top);else candleCalc(bottom,top);
    };
    // Naked POCs: previous UTC days' POCs that no later traded price has reached yet (recorded BTCUSDT only).
    const nakedLines=new Map<string,IPriceLine>();
    let nakedAt=0;
    const clearNaked=()=>{if(!api.disposed)for(const l of nakedLines.values())api.series.removePriceLine(l);nakedLines.clear();};
    const updateNaked=async()=>{
      if(!recorded||!settings.naked||disposed){clearNaked();return;}
      if(Date.now()-nakedAt<60000)return;nakedAt=Date.now();
      const DAY=86400000,today=Math.floor(Date.now()/DAY)*DAY,bin=profileBin(spec.minMove*200,spec.minMove);
      try{
        const starts=[5,4,3,2,1].map(i=>today-i*DAY);
        const [cur,...prev]=await Promise.all([loadTradeProfile(today,Date.now(),bin),...starts.map(d=>loadTradeProfile(d,d+DAY,bin))]);
        const days:{day:number;levels:Level[]}[]=starts.map((d,i)=>({day:d,levels:prev[i]?.levels??[]}));
        const tail=cur?tailAfter(cur.cutoff,Date.now()+1):[];
        const ranges=[...days.map(d=>d.levels),cur?.levels??[]].map(l=>l.length?levelStats(l):null);
        const liveRange=tail.length?{low:Math.min(...tail.map(t=>t.price)),high:Math.max(...tail.map(t=>t.price))}:null;
        const later=days.map((_,i)=>[...ranges.slice(i+1).filter((r):r is NonNullable<typeof r>=>r!==null),...(liveRange?[liveRange]:[])]);
        const naked=nakedPocs(days.filter(d=>d.levels.length),later.filter((_,i)=>days[i]?.levels.length),bin);
        if(disposed||api.disposed)return;
        clearNaked();
        for(const n of naked){const label=new Date(n.day).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});nakedLines.set(`nPOC ${label}`,api.series.createPriceLine({price:Math.round(n.price/spec.minMove)*spec.minMove,color:api.colors.muted,lineWidth:1,lineStyle:LineStyle.Dotted,axisLabelVisible:false,title:`nPOC ${label}`}));}
        note.dataset['naked']=String(naked.length);
      }catch{nakedAt=0;}
    };
    const schedule=()=>{dirty=true;clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;recalculate();},200);};
    const down=()=>{dragging=true;clearTimeout(timer);};
    const up=()=>{if(!dragging)return;dragging=false;schedule();};
    const move=()=>{if(dragging)schedule();};
    const hover=(e:MouseEvent)=>{const box=host.getBoundingClientRect(),row=primitive.rowAt(e.clientX-box.left,e.clientY-box.top);if(!row||dragging){tip.hidden=true;return;}tip.hidden=false;tip.textContent=`${formatPrice(row.low,spec)} – ${formatPrice(row.high,spec)}
Total: ${row.volume.toLocaleString('en-US',{maximumFractionDigits:4})}
Buy: ${primitive.split?row.buy.toLocaleString('en-US',{maximumFractionDigits:4}):'Unavailable'} · Sell: ${primitive.split?row.sell.toLocaleString('en-US',{maximumFractionDigits:4}):'Unavailable'}
${primitive.split?`Delta: ${(row.buy-row.sell).toLocaleString('en-US',{maximumFractionDigits:4,signDisplay:'always'})}\n`:''}${(row.volume/primitive.total*100).toFixed(2)}% of period`;};
    const leave=()=>{tip.hidden=true;};
    host.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);host.addEventListener('pointermove',move);host.addEventListener('wheel',schedule,{passive:true});
    host.addEventListener('mousemove',hover);host.addEventListener('mouseleave',leave);
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    const observer=new ResizeObserver(schedule);observer.observe(host);
    if(!demo&&!recorded)void loadProfile(source,symbol).then(schedule);
    const unsubscribeTail=recorded?subscribeTail(t=>{if(disposed||api.disposed||!liveOpen||t.time<cutoff||t.time<fromTime)return;primitive.total+=applyProfileDelta(primitive.rows,{time:t.time,price:t.price,volume:t.size,buy:t.buy},fromTime,Infinity);note.dataset['total']=String(primitive.total);if(!primitive.paused)primitive.refresh();}):()=>{};
    const tailRefresh=recorded?setInterval(()=>{if(liveOpen&&!dragging&&!timer)recalculate();void updateNaked();},10000):undefined;
    void updateNaked();
    const unsubscribe=subscribeProfileTrades(source,symbol,trade=>{if(recorded||demo||disposed||api.disposed||!primitive.total)return;primitive.total+=applyProfileDelta(primitive.rows,trade,fromTime,settings.range==='Visible'?toTime:Date.now());note.dataset['total']=String(primitive.total);if(!primitive.paused)primitive.refresh();});
    // Only initialise missing history; continuous trades redraw the existing price-anchored rows,
    // without recomputing the POC or changing bins during dragging.
    const initial=setInterval(()=>{if(dirty&&!dragging&&!timer)recalculate();},500);
    const retry=setInterval(()=>{if(!demo&&!recorded)void loadProfile(source,symbol).then(()=>{if(!primitive.total)schedule();});},60000);
    schedule();
    return()=>{disposed=true;unsubscribe();unsubscribeTail();clearInterval(tailRefresh);clearNaked();clearTimeout(timer);clearInterval(initial);clearInterval(retry);observer.disconnect();host.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);host.removeEventListener('pointermove',move);host.removeEventListener('wheel',schedule);host.removeEventListener('mousemove',hover);host.removeEventListener('mouseleave',leave);api.probes.delete(primitive);api.probes.delete(nativeProbe);if(!api.disposed){api.chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);api.series.detachPrimitive(primitive);for(const line of lines.values())api.series.removePriceLine(line);}};
  },[source,symbol,spec.precision,spec.minMove,mobile,chartRef,hostRef,settings,minutes,theme,revision]);
  return <><div ref={noteRef} data-testid="volume-profile" aria-label="Volume Profile histogram with POC VAH and VAL" className="pointer-events-none absolute bottom-14 left-3 z-[3] max-w-[70%] text-xs text-t-muted"/><div ref={tooltipRef} hidden role="tooltip" data-testid="volume-profile-tooltip" className="pointer-events-none absolute bottom-16 left-3 z-20 max-w-[calc(100%-80px)] whitespace-pre-line rounded border border-t-border bg-t-panel/95 p-2 text-xs text-t-text"/></>;
}
