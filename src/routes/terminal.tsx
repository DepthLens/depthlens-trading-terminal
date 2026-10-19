import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, UserRound, LogOut, List, Settings } from 'lucide-react';
import { PriceChart } from '@/components/PriceChart';
import { Heatmap } from '@/components/Heatmap';
import { VolumeProfileGear, VolumeProfileSettingsPanel } from '@/components/VolumeProfileSettings';
import { PROFILE_DEFAULT, PROFILE_KEY, restoreProfile, type ProfileSettings } from '@/lib/volume-profile';
import logo from '@/assets/depthlens-logo.png.asset.json';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { initialState, restoreState, openPair, closePair, validMinutes, STORAGE_KEY, TOOLS } from '@/lib/terminal-state';
import { marketStream } from '@/lib/market-stream';
import { LiveQuote, SourceSelect, useSourceMode, type TradeBridge } from '@/components/LiveQuote';
import { useTerminalMobile } from '@/hooks/use-terminal-mobile';
import { bybitListQuotes } from '@/lib/market-data';
import { MarketList, QuoteChange } from '@/components/MarketList';
import { BookDebug } from '@/components/BookDebug';
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
  const [showBookDebug,setShowBookDebug]=useState(false);
  const [profileSettings,setProfileSettings]=useState<ProfileSettings>({...PROFILE_DEFAULT});
  const [showProfileSettings,setShowProfileSettings]=useState(false);
  useEffect(()=>{setProfileSettings(restoreProfile(localStorage.getItem(PROFILE_KEY)));},[]);
  const changeProfileSettings=(next:ProfileSettings)=>{setProfileSettings(next);localStorage.setItem(PROFILE_KEY,JSON.stringify(next));};

  const [showProfile,setShowProfile]=useState(false);
  const [showCustom,setShowCustom]=useState(false);
  const [custom,setCustom]=useState('');
  const [customError,setCustomError]=useState('');
  const [notice,setNotice]=useState('');
  const mobile=useTerminalMobile();
  const [mode,changeMode]=useSourceMode();
  const [showPairs,setShowPairs]=useState(false);
  const [listSource,setListSource]=useState<'binance'|'bybit'>('binance');
  const listSourceRef=useRef(listSource);listSourceRef.current=listSource;
  const lastQuoteAt=useRef(0);
  const [listFailing,setListFailing]=useState(false);
  // The pair list follows the active price source: Bybit tickers are polled every 2 s while Bybit is active.
  useEffect(()=>{
    if(listSource!=='bybit')return;
    const abort=new AbortController();
    const poll=()=>fetch('https://api.bybit.com/v5/market/tickers?category=linear',{signal:abort.signal}).then(r=>r.ok?r.json():null).then(d=>{const next=bybitListQuotes(d);if(next&&!abort.signal.aborted){Object.assign(quotes.current,next);lastQuoteAt.current=Date.now();}}).catch(()=>{});
    void poll();const timer=setInterval(poll,2000);
    return()=>{abort.abort();clearInterval(timer);};
  },[listSource]);
  // Warn only when no list prices have arrived for 15 s from either source.
  useEffect(()=>{const start=Date.now();const timer=setInterval(()=>setListFailing(Date.now()-Math.max(lastQuoteAt.current,start)>15000),5000);return()=>clearInterval(timer);},[]);
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
      if(listSourceRef.current==='bybit')return;
      lastQuoteAt.current=Date.now();
      for(const d of data){const price=Number(d.c),open=Number(d.o);if(typeof d.s==='string'&&price>0&&open>0)quotes.current[d.s]={price,change:(price-open)/open*100,quoteVolume:Number(d.q)||0};}

    },setFeedLive,{exchange:'binance',purpose:'markets'});
    // Seed quotes immediately; the single array stream subsequently updates them.
    fetch('https://fapi.binance.com/fapi/v1/ticker/24hr',{signal:abort.signal}).then(r=>r.ok?r.json():[]).then(data=>{if(!Array.isArray(data)||abort.signal.aborted)return;lastQuoteAt.current=lastQuoteAt.current||Date.now();quotes.current={...Object.fromEntries(data.map(d=>[d.symbol,{price:Number(d.lastPrice),change:Number(d.priceChangePercent),quoteVolume:Number(d.quoteVolume)||0}])),...quotes.current};}).catch(()=>{});
    return()=>{abort.abort();clearTimeout(retry);stop();};
  },[]);
  const active=state.tabs.find(t=>t.symbol===state.active)??state.tabs[0]??{symbol:'BTCUSDT',minutes:1};
  useEffect(()=>{setShowCustom(false);setCustomError('');},[active.symbol,active.minutes]);
  const select=(symbol:string)=>{setShowPairs(false);if(state.tabs.length>=10&&!state.tabs.some(t=>t.symbol===symbol)){setNotice('Maximum 10 tabs. Close a tab to open another pair.');return;}setNotice('');setState(s=>openPair(s,symbol));};
  const timeframe=(minutes:number)=>setState(s=>({...s,tabs:s.tabs.map(t=>t.symbol===s.active?{...t,minutes}:t)}));
  const applyCustom=()=>{const n=validMinutes(custom);if(n===null){setCustomError('Enter a whole number from 1 to 1440.');return;}timeframe(n);setShowCustom(false);setCustomError('');};
  const activeSpec=priceSpecs[active.symbol];
  const control='text-t-muted hover:bg-t-border/50 hover:text-t-text';
  const profileMenu=<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`${control} rounded-full border border-t-border mobile:size-10`} aria-label="Profile menu" title="Profile"><UserRound/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} data-mobile={mobile||undefined} align="end" className="border-t-border bg-t-panel text-t-text"><DropdownMenuItem onSelect={()=>setShowProfile(true)} className="focus:bg-t-border focus:text-t-text mobile:min-h-10"><UserRound/>Profile</DropdownMenuItem><DropdownMenuItem asChild className="focus:bg-t-border focus:text-t-text mobile:min-h-10"><Link to="/"><LogOut/>Logout</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  const customForm=showCustom&&<form onSubmit={e=>{e.preventDefault();applyCustom();}} className="flex flex-wrap items-center gap-2"><input autoFocus type="number" min={1} max={1440} step={1} aria-label="Custom timeframe minutes" value={custom} onChange={e=>setCustom(e.target.value)} className="h-8 w-20 rounded-md border border-t-border bg-t-panel px-2 text-xs mobile:h-10 mobile:text-sm"/><Button type="submit" size="sm" className="bg-t-accent text-t-bg hover:bg-t-accent/90 mobile:h-10">Go</Button>{customError&&<span role="alert" className="text-xs text-t-down">{customError}</span>}</form>;
  return <div data-theme={state.theme} data-mobile={mobile||undefined} className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-t-bg text-t-text mobile:min-h-0 mobile:pt-[env(safe-area-inset-top)] mobile:pr-[env(safe-area-inset-right)] mobile:pb-[env(safe-area-inset-bottom)] mobile:pl-[env(safe-area-inset-left)]">
    {mobile?<header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-t-border bg-t-panel px-2 py-1">
      <Link to="/" className="flex h-10 items-center gap-1.5 text-sm font-bold text-t-accent"><img src={logo.url} alt="DepthLens logo" className="size-7 shrink-0 rounded-md" /><span className="max-[379px]:sr-only">DepthLens</span></Link>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden tabular-nums"><div className="flex min-w-0 flex-col leading-tight"><span className="truncate text-xs font-semibold">{active.symbol}</span><div className="flex min-w-0 items-center gap-2 whitespace-nowrap"><LiveQuote symbol={active.symbol} minutes={active.minutes} spec={activeSpec} bridge={bridge} bookEnabled={Boolean(state.tools['Heatmap'] || state.tools['DOM'])} profileEnabled={Boolean(state.tools['Volume Profile'])} mode={mode} onModeChange={changeMode} onSourceChange={src=>setListSource(src==='bybit'?'bybit':'binance')} compact/></div></div></div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className={`size-10 ${control}`} aria-label="Pairs" title="Pairs" onClick={()=>setShowPairs(true)}><List/></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`size-10 ${control}`} aria-label="Settings" title="Settings"><Settings/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} data-mobile="" align="end" className="w-64 space-y-3 border-t-border bg-t-panel p-3 text-sm text-t-text">
          <div className="flex items-center justify-between gap-2"><span className="text-t-muted">24h change</span><QuoteChange symbol={active.symbol} quotes={quotes}/></div>
          <label className="flex items-center justify-between gap-2"><span className="text-t-muted">Price source</span><SourceSelect mode={mode} onChange={changeMode} className="h-10 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text"/></label>
        </DropdownMenuContent></DropdownMenu>
        {profileMenu}
      </div>
    </header>:<header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-t-border bg-t-panel px-4 py-2">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold text-t-accent"><img src={logo.url} alt="DepthLens logo" className="size-8 shrink-0 rounded-md" />DepthLens</Link>
      <div className="flex flex-wrap items-baseline gap-2 tabular-nums"><span className="text-sm font-semibold">{active.symbol}</span><LiveQuote symbol={active.symbol} minutes={active.minutes} spec={activeSpec} bridge={bridge} bookEnabled={Boolean(state.tools['Heatmap'] || state.tools['DOM'])} profileEnabled={Boolean(state.tools['Volume Profile'])} mode={mode} onModeChange={changeMode} onSourceChange={src=>setListSource(src==='bybit'?'bybit':'binance')}/><QuoteChange symbol={active.symbol} quotes={quotes}/></div>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`${control} rounded-full border border-t-border`} aria-label="Profile menu" title="Profile"><UserRound/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} align="end" className="border-t-border bg-t-panel text-t-text"><DropdownMenuItem onSelect={()=>setShowProfile(true)} className="focus:bg-t-border focus:text-t-text"><UserRound/>Profile</DropdownMenuItem><DropdownMenuItem asChild className="focus:bg-t-border focus:text-t-text"><Link to="/"><LogOut/>Logout</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>

      </div>
    </header>}
    {showProfile&&<div role="dialog" aria-modal="true" aria-label="Profile" className="fixed inset-0 z-50 flex items-center justify-center bg-t-bg/80 p-4"><div className="w-full max-w-sm rounded-md border border-t-border bg-t-panel p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Profile</h2><Button variant="ghost" size="icon" className={control} aria-label="Close profile" onClick={()=>setShowProfile(false)}><X/></Button></div><div className="flex items-center gap-3 py-6"><UserRound className="size-10 rounded-full border border-t-border p-2 text-t-accent"/><span>Guest</span></div><Button asChild variant="outline" className="border-t-border bg-t-bg text-t-text"><Link to="/">Logout</Link></Button></div></div>}

    {mobile&&showPairs&&<div className="fixed inset-0 z-50 flex flex-col bg-t-bg/70 pt-[max(1.5rem,env(safe-area-inset-top))]" onClick={()=>setShowPairs(false)}><div role="dialog" aria-modal="true" aria-label="Pairs" onClick={e=>e.stopPropagation()} className="flex min-h-0 flex-1 flex-col rounded-t-xl border-t border-t-border bg-t-panel pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-between px-3 pt-2"><h2 className="text-base font-semibold">Pairs <span className="text-xs font-normal text-t-muted">{pairs.length} USDT futures · {listSource==='bybit'?'Bybit':'Binance'}</span></h2><Button variant="ghost" size="icon" className={`size-10 ${control}`} aria-label="Close pairs" onClick={()=>setShowPairs(false)}><X/></Button></div>
      <div className="p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-t-muted"/><input aria-label="Search futures pairs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pairs" className="h-10 w-full rounded-md border border-t-border bg-t-bg pl-9 pr-2 text-base outline-none focus:border-t-accent"/></div></div>
      {listFailing&&<p role="alert" className="px-3 pb-2 text-xs text-t-warning">Pair prices are not updating. Retrying…</p>}
      <MarketList pairs={pairs} quotes={quotes} specs={priceSpecs} query={query} active={active.symbol} status={pairStatus} select={select}/>
    </div></div>}
    <div className="flex min-h-0 flex-1">
      {!mobile&&<aside className="flex w-44 shrink-0 flex-col border-r border-t-border bg-t-panel sm:w-60 lg:w-72">
        <div className="border-b border-t-border p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-t-muted"/><input aria-label="Search futures pairs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pairs" className="h-9 w-full rounded-md border border-t-border bg-t-bg pl-8 pr-2 text-sm outline-none focus:border-t-accent"/></div></div>
        <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase text-t-muted"><span>USDT Futures</span><span>{pairs.length} pairs</span></div>
        <MarketList pairs={pairs} quotes={quotes} specs={priceSpecs} query={query} active={active.symbol} status={pairStatus} select={select}/>
        <div className="border-t border-t-border px-3 py-2 text-[10px] text-t-muted"><span className={feedLive?'text-t-up':'text-t-down'}>● </span>{feedLive?'Binance Futures · Live':'Binance Futures · Reconnecting'}</div>
      </aside>}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 border-b border-t-border bg-t-panel mobile:h-12">
        <div role="tablist" aria-label="Open pairs" className="terminal-tabs flex min-w-0 flex-1 overflow-x-auto pt-1" onWheel={e=>{if(e.currentTarget.scrollWidth>e.currentTarget.clientWidth){e.currentTarget.scrollLeft+=e.deltaY||e.deltaX;}}}>
          {state.tabs.map(t=><div key={t.symbol} className={`flex shrink-0 items-center border-r border-t-border ${t.symbol===active.symbol?'border-t-2 border-t-t-accent bg-t-bg':'border-t-2 border-t-transparent'}`}><Button role="tab" aria-selected={t.symbol===active.symbol} variant="ghost" onClick={()=>select(t.symbol)} className={`h-full rounded-none px-3 text-xs ${t.symbol===active.symbol?'text-t-text':control}`}>{t.symbol}<span className="text-[10px] text-t-muted mobile:text-xs">{t.minutes}m</span></Button><Button variant="ghost" size="icon" className={`mr-1 size-6 mobile:mr-0 mobile:size-10 ${control}`} aria-label={`Close ${t.symbol}`} title={`Close ${t.symbol}`} disabled={state.tabs.length===1} onClick={()=>{setNotice('');setState(s=>closePair(s,t.symbol));}}><X className="size-3"/></Button></div>)}
        </div>
        </div>
        {mobile?<><div className="flex shrink-0 items-center border-b border-t-border">
          <div className="terminal-tabs flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap px-2 py-1">
            {TFS.map(t=><Button key={t.label} variant="ghost" size="sm" aria-pressed={active.minutes===t.min} onClick={()=>timeframe(t.min)} className={`h-10 shrink-0 px-3 text-sm ${active.minutes===t.min?'bg-t-accent text-t-bg hover:bg-t-accent/90':control}`}>{t.label}</Button>)}
            <Button variant="ghost" size="sm" aria-expanded={showCustom} onClick={()=>{setCustom(String(active.minutes));setShowCustom(s=>!s);}} className={`h-10 shrink-0 text-sm ${!TFS.some(t=>t.min===active.minutes)?'bg-t-accent text-t-bg':control}`}>{!TFS.some(t=>t.min===active.minutes)?`${active.minutes}m · Custom`:'Custom'}<ChevronDown/></Button>
          </div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`mx-1 size-10 shrink-0 border border-t-border ${control}`} aria-label="Orderflow tools" title="Orderflow tools"><SlidersHorizontal/></Button></DropdownMenuTrigger>
            <DropdownMenuContent data-theme={state.theme} data-mobile="" align="end" className="w-[min(20rem,calc(100vw-1rem))] border-t-border bg-t-panel p-2 text-t-text">
              <div className="mb-1 flex justify-between px-2 py-2 text-xs font-semibold"><span>Order flow tools</span><span className="text-t-up">Free · Unlocked</span></div>
              {TOOLS.map(t=><div key={t} className="flex min-h-10 items-center gap-2 px-2 py-1"><label htmlFor={`tool-${t}`} className="flex-1 text-sm">{t}</label><span className="text-xs text-t-muted">{t!=='Volume Profile'&&'Coming soon'}</span>{t==='Volume Profile'&&<VolumeProfileGear onClick={()=>setShowProfileSettings(true)}/>}<Switch id={`tool-${t}`} aria-label={t} checked={state.tools[t]??false} onCheckedChange={checked=>setState(s=>({...s,tools:{...s.tools,[t]:checked}}))} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>)}
              <div className="mt-1 flex min-h-10 items-center gap-2 border-t border-t-border px-2 pt-2"><label htmlFor="tool-book-debug" className="flex-1 text-sm">Book debug</label><Switch id="tool-book-debug" aria-label="Book debug" checked={showBookDebug} onCheckedChange={setShowBookDebug} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>{showCustom&&<div className="shrink-0 border-b border-t-border px-2 py-1">{customForm}</div>}</>:<>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-t-border px-2 py-2">
          {TFS.map(t=><Button key={t.label} variant="ghost" size="sm" aria-pressed={active.minutes===t.min} onClick={()=>timeframe(t.min)} className={`px-2.5 ${active.minutes===t.min?'bg-t-accent text-t-bg hover:bg-t-accent/90':control}`}>{t.label}</Button>)}
          <Button variant="ghost" size="sm" aria-expanded={showCustom} onClick={()=>{setCustom(String(active.minutes));setShowCustom(s=>!s);}} className={!TFS.some(t=>t.min===active.minutes)?'bg-t-accent text-t-bg':control}>{!TFS.some(t=>t.min===active.minutes)?`${active.minutes}m · Custom`:'Custom'}<ChevronDown/></Button>
        <div className="flex shrink-0 items-center px-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className={control}><SlidersHorizontal/>orderflow<ChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent data-theme={state.theme} align="end" className="w-80 border-t-border bg-t-panel p-2 text-t-text">
            <div className="mb-1 flex justify-between px-2 py-2 text-xs font-semibold"><span>Order flow tools</span><span className="text-t-up">Free · Unlocked</span></div>
            {TOOLS.map(t=><div key={t} className="flex items-center gap-2 px-2 py-2.5"><label htmlFor={`tool-${t}`} className="flex-1 text-sm">{t}</label><span className="text-[10px] text-t-muted">{t!=='Volume Profile'&&'Coming soon'}</span>{t==='Volume Profile'&&<VolumeProfileGear onClick={()=>setShowProfileSettings(true)}/>}<Switch id={`tool-${t}`} aria-label={t} checked={state.tools[t]??false} onCheckedChange={checked=>setState(s=>({...s,tools:{...s.tools,[t]:checked}}))} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>)}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
          <Button variant="ghost" size="sm" aria-pressed={showBookDebug} onClick={()=>setShowBookDebug(s=>!s)} className={showBookDebug?'bg-t-border text-t-text':control}>Book debug</Button>
          {showCustom&&<form onSubmit={e=>{e.preventDefault();applyCustom();}} className="flex flex-wrap items-center gap-2"><input autoFocus type="number" min={1} max={1440} step={1} aria-label="Custom timeframe minutes" value={custom} onChange={e=>setCustom(e.target.value)} className="h-8 w-20 rounded-md border border-t-border bg-t-panel px-2 text-xs"/><Button type="submit" size="sm" className="bg-t-accent text-t-bg hover:bg-t-accent/90">Go</Button>{customError&&<span role="alert" className="text-xs text-t-down">{customError}</span>}</form>}
        </div>
        </>}
        {notice&&<div role="alert" className="border-b border-t-border px-3 py-2 text-xs text-t-down">{notice}</div>}
        <div className="relative min-h-0 flex-1">{restored&&activeSpec&&(state.tools['Heatmap']?<Heatmap key={active.symbol} symbol={active.symbol} spec={activeSpec} bridge={bridge} mobile={mobile}/>:<PriceChart key={active.symbol} symbol={active.symbol} minutes={active.minutes} theme={state.theme} priceFormat={activeSpec} bridge={bridge} mobile={mobile} volumeProfile={Boolean(state.tools['Volume Profile'])} profileSettings={profileSettings} source={listSource}/>)} {showBookDebug&&<BookDebug spec={activeSpec}/>}</div>
      </main>
    </div>
    {showProfileSettings&&<VolumeProfileSettingsPanel settings={profileSettings} onChange={changeProfileSettings} onClose={()=>setShowProfileSettings(false)} mobile={mobile} theme={state.theme}/>}
  </div>;
}
