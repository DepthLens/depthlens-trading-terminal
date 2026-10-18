import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, UserRound, LogOut } from 'lucide-react';
import { PriceChart } from '@/components/PriceChart';
import logo from '@/assets/depthlens-logo.png.asset.json';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { initialState, restoreState, openPair, closePair, validMinutes, STORAGE_KEY, TOOLS } from '@/lib/terminal-state';
import { marketStream } from '@/lib/market-stream';
import { LiveQuote, type TradeBridge } from '@/components/LiveQuote';
import { MarketList } from '@/components/MarketList';
import { priceSpec, type Market, type PriceSpec, type Quote } from '@/lib/market-data';
export const Route = createFileRoute('/terminal')({
  head:()=>({meta:[{title:'Terminal — DepthLens'},{name:'description',content:'Live Binance USDT futures charts, personalized tabs, and order flow tools.'},{property:'og:title',content:'Terminal — DepthLens'},{property:'og:description',content:'Follow live futures markets with DepthLens candlestick charts and order flow tools.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Terminal,
});
const TFS=[{label:'1m',min:1},{label:'5m',min:5},{label:'10m',min:10},{label:'15m',min:15},{label:'30m',min:30},{label:'1h',min:60},{label:'4h',min:240},{label:'1d',min:1440}];

function Terminal() {
  const [state,setState]=useState(initialState);
  const [restored,setRestored]=useState(false);
  const [pairs,setPairs]=useState<string[]>([]);
  const [priceSpecs,setPriceSpecs]=useState<Record<string,PriceSpec>>({});
  const quotes=useRef<Record<string,Quote>>({});
  const bridge=useRef<TradeBridge>({latest:null,receive:null});
  const [query,setQuery]=useState('');
  const [pairStatus,setPairStatus]=useState('Loading markets');
  const [feedLive,setFeedLive]=useState(false);

  const [showProfile,setShowProfile]=useState(false);
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

    const stop=marketStream('wss://fstream.binance.com/ws/!miniTicker@arr',data=>{
      if(!Array.isArray(data))return;
      for(const d of data){const price=Number(d.c),open=Number(d.o);if(typeof d.s==='string'&&price>0&&open>0)quotes.current[d.s]={price,change:(price-open)/open*100,quoteVolume:Number(d.q)||0};}

    },setFeedLive);
    // Seed quotes immediately; the single array stream subsequently updates them.
    fetch('https://fapi.binance.com/fapi/v1/ticker/24hr',{signal:abort.signal}).then(r=>r.ok?r.json():[]).then(data=>{if(!Array.isArray(data)||abort.signal.aborted)return;quotes.current={...Object.fromEntries(data.map(d=>[d.symbol,{price:Number(d.lastPrice),change:Number(d.priceChangePercent),quoteVolume:Number(d.quoteVolume)||0}])),...quotes.current};}).catch(()=>{});
    return()=>{abort.abort();clearTimeout(retry);stop();};
  },[]);
  const active=state.tabs.find(t=>t.symbol===state.active)??state.tabs[0]??{symbol:'BTCUSDT',minutes:1};
  useEffect(()=>{setShowCustom(false);setCustomError('');},[active.symbol,active.minutes]);
  const select=(symbol:string)=>{if(state.tabs.length>=10&&!state.tabs.some(t=>t.symbol===symbol)){setNotice('Maximum 10 tabs. Close a tab to open another pair.');return;}setNotice('');setState(s=>openPair(s,symbol));};
  const timeframe=(minutes:number)=>setState(s=>({...s,tabs:s.tabs.map(t=>t.symbol===s.active?{...t,minutes}:t)}));
  const applyCustom=()=>{const n=validMinutes(custom);if(n===null){setCustomError('Enter a whole number from 1 to 1440.');return;}timeframe(n);setShowCustom(false);setCustomError('');};
  const activeSpec=priceSpecs[active.symbol];
  const control='text-t-muted hover:bg-t-border/50 hover:text-t-text';
  return <div data-theme={state.theme} className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-t-bg text-t-text">
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-t-border bg-t-panel px-4 py-2">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold text-t-accent"><img src={logo.url} alt="DepthLens logo" className="size-8 shrink-0 rounded-md" />DepthLens</Link>
      <div className="flex flex-wrap items-baseline gap-2 tabular-nums"><span className="text-sm font-semibold">{active.symbol}</span><LiveQuote symbol={active.symbol} spec={activeSpec} bridge={bridge}/></div>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`${control} rounded-full border border-t-border`} aria-label="Profile menu" title="Profile"><UserRound/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} align="end" className="border-t-border bg-t-panel text-t-text"><DropdownMenuItem onSelect={()=>setShowProfile(true)} className="focus:bg-t-border focus:text-t-text"><UserRound/>Profile</DropdownMenuItem><DropdownMenuItem asChild className="focus:bg-t-border focus:text-t-text"><Link to="/"><LogOut/>Logout</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>

      </div>
    </header>
    {showProfile&&<div role="dialog" aria-modal="true" aria-label="Profile" className="fixed inset-0 z-50 flex items-center justify-center bg-t-bg/80 p-4"><div className="w-full max-w-sm rounded-md border border-t-border bg-t-panel p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Profile</h2><Button variant="ghost" size="icon" className={control} aria-label="Close profile" onClick={()=>setShowProfile(false)}><X/></Button></div><div className="flex items-center gap-3 py-6"><UserRound className="size-10 rounded-full border border-t-border p-2 text-t-accent"/><span>Guest</span></div><Button asChild variant="outline" className="border-t-border bg-t-bg text-t-text"><Link to="/">Logout</Link></Button></div></div>}

    <div className="flex min-h-0 flex-1">
      <aside className="flex w-44 shrink-0 flex-col border-r border-t-border bg-t-panel sm:w-60 lg:w-72">
        <div className="border-b border-t-border p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-t-muted"/><input aria-label="Search futures pairs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pairs" className="h-9 w-full rounded-md border border-t-border bg-t-bg pl-8 pr-2 text-sm outline-none focus:border-t-accent"/></div></div>
        <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase text-t-muted"><span>USDT Futures</span><span>{pairs.length} pairs</span></div>
        <MarketList pairs={pairs} quotes={quotes} specs={priceSpecs} query={query} active={active.symbol} status={pairStatus} select={select}/>
        <div className="border-t border-t-border px-3 py-2 text-[10px] text-t-muted"><span className={feedLive?'text-t-up':'text-t-down'}>● </span>{feedLive?'Binance Futures · Live':'Binance Futures · Reconnecting'}</div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 border-b border-t-border bg-t-panel">
        <div role="tablist" aria-label="Open pairs" className="terminal-tabs flex min-w-0 flex-1 overflow-x-auto pt-1" onWheel={e=>{if(e.currentTarget.scrollWidth>e.currentTarget.clientWidth){e.currentTarget.scrollLeft+=e.deltaY||e.deltaX;}}}>
          {state.tabs.map(t=><div key={t.symbol} className={`flex shrink-0 items-center border-r border-t-border ${t.symbol===active.symbol?'border-t-2 border-t-t-accent bg-t-bg':'border-t-2 border-t-transparent'}`}><Button role="tab" aria-selected={t.symbol===active.symbol} variant="ghost" onClick={()=>select(t.symbol)} className={`h-full rounded-none px-3 text-xs ${t.symbol===active.symbol?'text-t-text':control}`}>{t.symbol}<span className="text-[10px] text-t-muted">{t.minutes}m</span></Button><Button variant="ghost" size="icon" className={`mr-1 size-6 ${control}`} aria-label={`Close ${t.symbol}`} title={`Close ${t.symbol}`} disabled={state.tabs.length===1} onClick={()=>{setNotice('');setState(s=>closePair(s,t.symbol));}}><X className="size-3"/></Button></div>)}
        </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-t-border px-2 py-2">
          {TFS.map(t=><Button key={t.label} variant="ghost" size="sm" aria-pressed={active.minutes===t.min} onClick={()=>timeframe(t.min)} className={`px-2.5 ${active.minutes===t.min?'bg-t-accent text-t-bg hover:bg-t-accent/90':control}`}>{t.label}</Button>)}
          <Button variant="ghost" size="sm" aria-expanded={showCustom} onClick={()=>{setCustom(String(active.minutes));setShowCustom(s=>!s);}} className={!TFS.some(t=>t.min===active.minutes)?'bg-t-accent text-t-bg':control}>{!TFS.some(t=>t.min===active.minutes)?`${active.minutes}m · Custom`:'Custom'}<ChevronDown/></Button>
        <div className="flex shrink-0 items-center px-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className={control}><SlidersHorizontal/>orderflow<ChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent data-theme={state.theme} align="end" className="w-80 border-t-border bg-t-panel p-2 text-t-text">
            <div className="mb-1 flex justify-between px-2 py-2 text-xs font-semibold"><span>Order flow tools</span><span className="text-t-up">Free · Unlocked</span></div>
            {TOOLS.map(t=><div key={t} className="flex items-center gap-2 px-2 py-2.5"><label htmlFor={`tool-${t}`} className="flex-1 text-sm">{t}</label><span className="text-[10px] text-t-muted">Coming soon</span><Switch id={`tool-${t}`} aria-label={t} checked={state.tools[t]??false} onCheckedChange={checked=>setState(s=>({...s,tools:{...s.tools,[t]:checked}}))} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>)}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
          {showCustom&&<form onSubmit={e=>{e.preventDefault();applyCustom();}} className="flex flex-wrap items-center gap-2"><input autoFocus type="number" min={1} max={1440} step={1} aria-label="Custom timeframe minutes" value={custom} onChange={e=>setCustom(e.target.value)} className="h-8 w-20 rounded-md border border-t-border bg-t-panel px-2 text-xs"/><Button type="submit" size="sm" className="bg-t-accent text-t-bg hover:bg-t-accent/90">Go</Button>{customError&&<span role="alert" className="text-xs text-t-down">{customError}</span>}</form>}
        </div>
        {notice&&<div role="alert" className="border-b border-t-border px-3 py-2 text-xs text-t-down">{notice}</div>}
        <div className="min-h-0 flex-1">{restored&&activeSpec&&<PriceChart key={active.symbol} symbol={active.symbol} minutes={active.minutes} theme={state.theme} priceFormat={activeSpec} bridge={bridge}/>}</div>
      </main>
    </div>
  </div>;
}
