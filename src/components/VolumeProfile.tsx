import { useEffect, useRef, type MutableRefObject } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { buildProfile, loadProfile, profileData, type ProfileSettings, type ProfileRow } from '@/lib/volume-profile';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import type { TradeSource } from '@/lib/live-price';

export type ProfileChart = { chart: IChartApi; series: ISeriesApi<'Candlestick'> };
export function VolumeProfile({ chartRef, hostRef, source, symbol, settings, spec, mobile }: { chartRef: MutableRefObject<ProfileChart|null>; hostRef: MutableRefObject<HTMLDivElement|null>; source: TradeSource; symbol: string; settings: ProfileSettings; spec: PriceSpec; mobile: boolean }) {
  const canvasRef=useRef<HTMLCanvasElement>(null), tooltipRef=useRef<HTMLDivElement>(null), noteRef=useRef<HTMLDivElement>(null);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>{
    const canvas=canvasRef.current, host=hostRef.current, tip=tooltipRef.current, note=noteRef.current;
    if(!canvas||!host||!tip||!note)return;
    let disposed=false, rows: {row:ProfileRow;y:number;height:number;x:number;width:number}[]=[], total=0, hasSplit=false;
    const palette=getComputedStyle(host), color=(name:string)=>palette.getPropertyValue(name).trim();
    const paint=()=>{
      const api=chartRef.current,ctx=canvas.getContext('2d');if(disposed||!api||!ctx)return;
      const {chart,series}=api,w=chart.timeScale().width(),h=chart.paneSize().height;
      if(w<=0||h<=0)return;
      const dpr=window.devicePixelRatio||1;
      canvas.width=Math.round(host.clientWidth*dpr);canvas.height=Math.round(host.clientHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,host.clientWidth,host.clientHeight);
      const top=series.coordinateToPrice(0),bottom=series.coordinateToPrice(h);if(top===null||bottom===null||top<=bottom)return;
      const s=settingsRef.current,data=profileData(source,symbol), visible=chart.timeScale().getVisibleRange();
      const now=Date.now(),hours={'4h':4,'12h':12,'24h':24,'3d':72};
      const from=s.range==='Visible'?Number(visible?.from??now/1000)*1000:now-hours[s.range]*3600000;
      const to=s.range==='Visible'?Number(visible?.to??now/1000)*1000+59000:now;
      const p=buildProfile(data.candles,data.live,bottom,top,spec.minMove,s,from,to);
      total=p.total;hasSplit=p.split&&s.split;rows=[];
      note.textContent=data.error||(!p.total?'Loading volume history…':'Estimated from 1m candles');
      canvas.dataset['total']=String(p.total);canvas.dataset['poc']=String(p.poc);canvas.dataset['vah']=String(p.vah);canvas.dataset['val']=String(p.val);canvas.dataset['rows']=String(p.rows.length);canvas.dataset['source']=source;
      if(!total)return;
      const peak=Math.max(...p.rows.map(r=>r.volume)), width=w*(mobile ? .12 : .2);
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
      for(const row of p.rows){const a=series.priceToCoordinate(row.high),b=series.priceToCoordinate(row.low);if(a===null||b===null||!row.volume)continue;
        const y=Math.max(0,a),height=Math.max(1,Math.min(h,b)-y-1),bar=width*row.volume/peak,x=s.position==='right'?w-bar:0;
        if(y>h||b<0)continue;ctx.globalAlpha=s.opacity*(row.inArea?1:.3);
        if(hasSplit){const buy=bar*row.buy/row.volume;ctx.fillStyle=color('--t-up');ctx.fillRect(x,y,buy,height);ctx.fillStyle=color('--t-down');ctx.fillRect(x+buy,y,bar-buy,height);}else{ctx.fillStyle=color('--vp-unsplit');ctx.fillRect(x,y,bar,height);}
        rows.push({row,y,height,x,width:bar});
      }
      ctx.globalAlpha=1;ctx.font='12px sans-serif';
      for(const [name,price] of [['POC',p.poc],['VAH',p.vah],['VAL',p.val]] as const){const y=series.priceToCoordinate(price);if(y===null||y<0||y>h)continue;ctx.strokeStyle=color(name==='POC'?'--vp-poc':'--t-muted');ctx.lineWidth=1;ctx.setLineDash(name==='POC'?[]:[4,4]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
        const label=`${name} ${formatPrice(Math.round(price/spec.minMove)*spec.minMove,spec)}`,textW=ctx.measureText(label).width,x=mobile?Math.max(4,w/2-textW/2):s.position==='right'?8:w-textW-8, textY=Math.min(h-14,Math.max(mobile?140:16,y-16));
        ctx.fillStyle=color('--t-panel');ctx.globalAlpha=.85;ctx.fillRect(x-3,textY-1,textW+6,15);ctx.globalAlpha=1;ctx.fillStyle=color(name==='POC'?'--vp-poc':'--t-muted');ctx.fillText(label,x,textY+11);
      }
      ctx.restore();
    };
    const hover=(e:MouseEvent)=>{const box=host.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top,r=rows.find(r=>y>=r.y&&y<=r.y+r.height&&x>=r.x&&x<=r.x+r.width);if(!r){tip.hidden=true;return;}tip.hidden=false;tip.textContent=`${formatPrice(r.row.low,spec)} – ${formatPrice(r.row.high,spec)}\nTotal: ${r.row.volume.toLocaleString('en-US',{maximumFractionDigits:4})}\nBuy: ${hasSplit?r.row.buy.toLocaleString('en-US',{maximumFractionDigits:4}):'Unavailable'} · Sell: ${hasSplit?r.row.sell.toLocaleString('en-US',{maximumFractionDigits:4}):'Unavailable'}\n${(r.row.volume/total*100).toFixed(2)}% of total`;};
    const leave=()=>{tip.hidden=true;};host.addEventListener('mousemove',hover);host.addEventListener('mouseleave',leave);
    void loadProfile(source,symbol).then(paint);
    const timer=setInterval(paint,500),retry=setInterval(()=>void loadProfile(source,symbol),60000);
    paint();return()=>{disposed=true;clearInterval(timer);clearInterval(retry);host.removeEventListener('mousemove',hover);host.removeEventListener('mouseleave',leave);};
  },[source,symbol,spec.precision,spec.minMove,mobile,chartRef,hostRef]);
  return <><canvas ref={canvasRef} data-testid="volume-profile" aria-label="Volume Profile histogram with POC VAH and VAL" className="pointer-events-none absolute inset-0 z-[2] h-full w-full"/><div ref={noteRef} className="pointer-events-none absolute bottom-8 left-3 z-[3] max-w-[70%] text-xs text-t-muted"/><div ref={tooltipRef} hidden role="tooltip" data-testid="volume-profile-tooltip" className="pointer-events-none absolute bottom-16 left-3 z-20 max-w-[calc(100%-80px)] whitespace-pre-line rounded border border-t-border bg-t-panel/95 p-2 text-xs text-t-text"/></>;
}