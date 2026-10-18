import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, Palette } from 'lucide-react';
import { PriceChart, type LiveTick } from '@/components/PriceChart';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { initialState, restoreState, openPair, closePair, validMinutes, STORAGE_KEY, THEMES, TOOLS } from '@/lib/terminal-state';
import { marketStream } from '@/lib/market-stream';
import { priceSpec, formatPrice, sortMarkets, type Market, type PriceSpec, type Quote } from '@/lib/market-data';
export const Route = createFileRoute('/terminal')({
  head:()=>({meta:[{title:'Terminal — DepthLens'},{name:'description',content:'Live Binance USDT futures charts, personalized tabs, and order flow tools.'},{property:'og:title',content:'Terminal — DepthLens'},{property:'og:description',content:'Follow live futures markets with DepthLens candlestick charts and order flow tools.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Terminal,
});
const TFS=[{label:'1m',min:1},{label:'5m',min:5},{label:'10',min:10},{label:'15m',min:15},{label:'30',min:30},{label:'1h',min:60},{label:'4h',min:240},{label:'1d',min:1440}];

function Terminal() {
  const [state,setState]=useState(initialState);
  const [restored,setRestored]=useState(false);
  const [pairs,setPairs]=useState<string[]>([]);
  const [priceSpecs,setPriceSpecs]=useState<Record<string,PriceSpec>>({});
  const [quotes,setQuotes]=useState<Record<string,Quote>>({});
  const [query,setQuery]=useState('');
  const [pairStatus,setPairStatus]=useState('Loading markets');
  const [feedLive,setFeedLive]=useState(false);
  const [tick,setTick]=useState<LiveTick|null>(null);
  const [showCustom,setShowCustom]=useState(false);
  const [custom,setCustom]=useState('');
  const [customError,setCustomError]=useState('');
  const [notice,setNotice]=useState('');
  useEffect(()=>{try{setState(restoreState(localStorage.getItem(STORAGE_KEY)));}catch{}setRestored(true);},[]);
  useEffect(()=>{if(restored)try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}},[state,restored]);
  useEffect(()=>{
    const abort=new AbortController();let retry:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{try{
      const r=await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo',{signal:abort.signal});if(!r.ok)throw new Error();
      const d=await r.json();if(!Array.isArray(d.symbols))throw new Error();
      const markets: Market[]=d.symbols.filter((s:{quoteAsset:string;contractType:string;status:string})=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING');
      setPriceSpecs(Object.fromEntries(markets.map(m=>[m.symbol,priceSpec(m)])));setPairs(markets.map(m=>m.symbol));setPairStatus('');
    }catch{if(!abort.signal.aborted){setPairStatus('Markets unavailable · retrying');retry=setTimeout(load,5000);}}};void load();
    let frame=0;const pending:Record<string,Quote>={};
    const stop=marketStream('wss://fstream.binance.com/ws/!miniTicker@arr',data=>{
      if(!Array.isArray(data))return;
      for(const d of data){const price=Number(d.c),open=Number(d.o);if(typeof d.s==='string'&&price>0&&open>0)pending[d.s]={price,change:(price-open)/open*100,quoteVolume:Number(d.q)||0};}
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;setQuotes(prev=>({...prev,...pending}));for(const key of Object.keys(pending))delete pending[key];});
    },setFeedLive);
    // Seed quotes immediately; the single array stream subsequently updates them.
    fetch('https://fapi.binance.com/fapi/v1/ticker/24hr',{signal:abort.signal}).then(r=>r.ok?r.json():[]).then(data=>{if(!Array.isArray(data)||abort.signal.aborted)return;setQuotes(prev=>({...Object.fromEntries(data.map(d=>[d.symbol,{price:Number(d.lastPrice),change:Number(d.priceChangePercent),quoteVolume:Number(d.quoteVolume)||0}])),...prev}));}).catch(()=>{});
    return()=>{abort.abort();clearTimeout(retry);stop();cancelAnimationFrame(frame);};
  },[]);
  const active=state.tabs.find(t=>t.symbol===state.active)??state.tabs[0]??{symbol:'BTCUSDT',minutes:1};
  useEffect(()=>{setTick(null);setShowCustom(false);setCustomError('');},[active.symbol,active.minutes]);
  const filtered=useMemo(()=>sortMarkets(pairs,quotes).filter(p=>p.includes(query.toUpperCase())),[pairs,quotes,query]);
  const select=(symbol:string)=>{if(state.tabs.length>=10&&!state.tabs.some(t=>t.symbol===symbol)){setNotice('Maximum 10 tabs. Close a tab to open another pair.');return;}setNotice('');setState(s=>openPair(s,symbol));};
  const timeframe=(minutes:number)=>setState(s=>({...s,tabs:s.tabs.map(t=>t.symbol===s.active?{...t,minutes}:t)}));
  const applyCustom=()=>{const n=validMinutes(custom);if(n===null){setCustomError('Enter a whole number from 1 to 1440.');return;}timeframe(n);setShowCustom(false);setCustomError('');};
  const activeSpec=priceSpecs[active.symbol];
  const price=tick?.price??quotes[active.symbol]?.price;
  const change=quotes[active.symbol]?.change;
  const control='text-t-muted hover:bg-t-border/50 hover:text-t-text';
  return <div data-theme={state.theme} className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-t-bg text-t-text">
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-t-border bg-t-panel px-4 py-2">
      <div className="flex items-center gap-2 text-lg font-bold text-t-accent"><svg viewBox="0 0 64 64" className="size-8 shrink-0" role="img" aria-label="DepthLens logo"><circle cx="28" cy="28" r="20" fill="none" stroke="var(--logo-lens)" strokeWidth="5"/><line x1="43" y1="43" x2="58" y2="58" stroke="var(--logo-lens)" strokeWidth="6" strokeLinecap="round"/><rect x="16" y="18" width="20" height="4" rx="2" fill="var(--logo-bid)"/><rect x="16" y="26" width="14" height="4" rx="2" fill="var(--logo-bid)"/><rect x="16" y="34" width="18" height="4" rx="2" fill="var(--logo-ask)"/></svg>DepthLens</div>
      <div className="flex flex-wrap items-baseline gap-2 tabular-nums"><span className="text-sm font-semibold">{active.symbol}</span><span data-testid="live-price" className={`text-lg font-semibold ${tick?.direction===1?'text-t-up':tick?.direction===-1?'text-t-down':'text-t-text'}`}><span aria-label={tick?.direction===1?'Price rising':tick?.direction===-1?'Price falling':'Price unchanged'}>{tick?.direction===1?'▲ ':tick?.direction===-1?'▼ ':''}</span>{price!==undefined&&activeSpec?formatPrice(price,activeSpec):'—'}</span>{change!==undefined&&<span className={`text-xs ${change>=0?'text-t-up':'text-t-down'}`}>{change>=0?'+':''}{change.toFixed(2)}% <span className="text-t-muted">24h</span></span>}</div>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={control} aria-label="Theme" title="Theme"><Palette/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} align="end" className="border-t-border bg-t-panel text-t-text">{THEMES.map(theme=><DropdownMenuItem key={theme} onSelect={()=>setState(s=>({...s,theme}))} className="capitalize focus:bg-t-border focus:text-t-text">{theme}{state.theme===theme?' ✓':''}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      </div>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-44 shrink-0 flex-col border-r border-t-border bg-t-panel sm:w-60 lg:w-72">
        <div className="border-b border-t-border p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-t-muted"/><input aria-label="Search futures pairs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pairs" className="h-9 w-full rounded-md border border-t-border bg-t-bg pl-8 pr-2 text-sm outline-none focus:border-t-accent"/></div></div>
        <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase text-t-muted"><span>USDT Futures</span><span>{pairs.length} pairs</span></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{filtered.map(p=>{const q=quotes[p];return <Button key={p} variant="ghost" onClick={()=>select(p)} aria-label={`Open ${p}`} className={`flex h-auto min-h-12 w-full justify-between gap-1 rounded-none border-l-2 px-3 py-2 ${active.symbol===p?'border-t-accent bg-t-border/35 text-t-text':'border-transparent text-t-text hover:bg-t-border/30'}`}><span className="min-w-0 truncate text-xs font-semibold">{p.replace(/USDT$/, '')}USDT<span className="block text-left text-[9px] font-normal text-t-muted">Perp</span></span><span className="min-w-0 text-right tabular-nums"><span className="block truncate text-xs">{q&&priceSpecs[p]?formatPrice(q.price,priceSpecs[p]):'—'}</span><span className={`block text-[10px] ${q&&q.change<0?'text-t-down':'text-t-up'}`}>{q?`${q.change>=0?'+':''}${q.change.toFixed(2)}%`:'—'}</span></span></Button>;})}{!filtered.length&&<p role="status" className="px-3 py-4 text-xs text-t-muted">{pairStatus||'No matching pairs'}</p>}</div>
        <div className="border-t border-t-border px-3 py-2 text-[10px] text-t-muted"><span className={feedLive?'text-t-up':'text-t-down'}>● </span>{feedLive?'Binance Futures · Live':'Binance Futures · Reconnecting'}</div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 border-b border-t-border bg-t-panel">
        <div role="tablist" aria-label="Open pairs" className="flex min-w-0 flex-1 overflow-x-auto pt-1">
          {state.tabs.map(t=><div key={t.symbol} className={`flex shrink-0 items-center border-r border-t-border ${t.symbol===active.symbol?'border-t-2 border-t-t-accent bg-t-bg':'border-t-2 border-t-transparent'}`}><Button role="tab" aria-selected={t.symbol===active.symbol} variant="ghost" onClick={()=>select(t.symbol)} className={`h-full rounded-none px-3 text-xs ${t.symbol===active.symbol?'text-t-text':control}`}>{t.symbol}<span className="text-[10px] text-t-muted">{t.minutes}m</span></Button><Button variant="ghost" size="icon" className={`mr-1 size-6 ${control}`} aria-label={`Close ${t.symbol}`} title={`Close ${t.symbol}`} disabled={state.tabs.length===1} onClick={()=>{setNotice('');setState(s=>closePair(s,t.symbol));}}><X className="size-3"/></Button></div>)}
        </div>
        <div className="flex shrink-0 items-center px-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className={control}><SlidersHorizontal/>Tools<ChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent data-theme={state.theme} align="end" className="w-80 border-t-border bg-t-panel p-2 text-t-text">
            <div className="mb-1 flex justify-between px-2 py-2 text-xs font-semibold"><span>Order flow tools</span><span className="text-t-up">Free · Unlocked</span></div>
            {TOOLS.map(t=><div key={t} className="flex items-center gap-2 px-2 py-2.5"><label htmlFor={`tool-${t}`} className="flex-1 text-sm">{t}</label><span className="text-[10px] text-t-muted">Coming soon</span><Switch id={`tool-${t}`} aria-label={t} checked={state.tools[t]??false} onCheckedChange={checked=>setState(s=>({...s,tools:{...s.tools,[t]:checked}}))} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>)}
          </DropdownMenuContent>
        </DropdownMenu>
        </div></div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-t-border px-2 py-2">
          {TFS.map(t=><Button key={t.label} variant="ghost" size="sm" aria-pressed={active.minutes===t.min} onClick={()=>timeframe(t.min)} className={`px-2.5 ${active.minutes===t.min?'bg-t-accent text-t-bg hover:bg-t-accent/90':control}`}>{t.label}</Button>)}
          <Button variant="ghost" size="sm" aria-expanded={showCustom} onClick={()=>{setCustom(String(active.minutes));setShowCustom(s=>!s);}} className={!TFS.some(t=>t.min===active.minutes)?'bg-t-accent text-t-bg':control}>{!TFS.some(t=>t.min===active.minutes)?`${active.minutes}m · Custom`:'Custom'}<ChevronDown/></Button>
          {showCustom&&<form onSubmit={e=>{e.preventDefault();applyCustom();}} className="flex flex-wrap items-center gap-2"><input autoFocus type="number" min={1} max={1440} step={1} aria-label="Custom timeframe minutes" value={custom} onChange={e=>setCustom(e.target.value)} className="h-8 w-20 rounded-md border border-t-border bg-t-panel px-2 text-xs"/><Button type="submit" size="sm" className="bg-t-accent text-t-bg hover:bg-t-accent/90">Go</Button>{customError&&<span role="alert" className="text-xs text-t-down">{customError}</span>}</form>}
        </div>
        {notice&&<div role="alert" className="border-b border-t-border px-3 py-2 text-xs text-t-down">{notice}</div>}
        <div className="min-h-0 flex-1">{restored&&activeSpec&&<PriceChart symbol={active.symbol} minutes={active.minutes} theme={state.theme} priceFormat={activeSpec} onTick={setTick}/>}</div>
      </main>
    </div>
  </div>;
}
