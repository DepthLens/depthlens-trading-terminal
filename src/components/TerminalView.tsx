import { Link } from '@tanstack/react-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Layers, Check, ChevronDown, UserRound, LogOut, ExternalLink, MoreHorizontal, ArrowLeftRight, Pencil } from 'lucide-react';
import { PriceChart } from '@/components/PriceChart';
import { Heatmap } from '@/components/Heatmap';
import { DomLadder } from '@/components/DomLadder';
import { FootprintGear, FootprintSettingsPanel } from '@/components/FootprintSettings';
import { FOOTPRINT_DEFAULT, FOOTPRINT_KEY, restoreFootprintSettings, type FootprintSettings } from '@/lib/footprint-data';
import { VolumeProfileGear, VolumeProfileSettingsPanel } from '@/components/VolumeProfileSettings';
import { CvdGear, CvdSettingsPanel } from '@/components/CvdSettings';
import { FlowBarsGear } from '@/components/FlowBars';
import { FlowBarsSettingsPanel } from '@/components/FlowBarsSettings';
import { FB_KEY, restoreFlowBars, type FbSettings } from '@/lib/flow-bars';
import { PricePressureGear, PricePressureSettingsPanel } from '@/components/PricePressureSettings';
import { PP_DEFAULT, PP_KEY, restorePressure, type PpSettings } from '@/lib/price-pressure';
import { WhaleGear, WhaleSettingsPanel } from '@/components/WhaleSettings';
import { LiquidationGear, LiquidationSettingsPanel } from '@/components/LiquidationSettings';
import { LIQ_DEFAULT, LIQ_KEY, restoreLiqSettings, type LiqSettings } from '@/lib/liquidation-data';
import { WhaleCount } from '@/components/WhaleTrades';
import { WHALE_DEFAULT, WHALE_KEY, restoreWhaleSettings, type WhaleSettings } from '@/lib/whale-data';
import { CVD_DEFAULT, CVD_KEY, restoreCvd, type CvdSettings } from '@/lib/cvd-data';
import { PROFILE_DEFAULT, PROFILE_KEY, restoreProfile, type ProfileSettings } from '@/lib/volume-profile';
import logo from '@/assets/depthlens-logo.png.asset.json';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { THEME_PRESETS, DEFAULT_THEME, applyTheme } from '@/lib/themes';
import { initialState, restoreState, withToolParam, openPair, closePair, validMinutes, STORAGE_KEY, TOOLS, THEMES, THEME_LABELS } from '@/lib/terminal-state';
import { marketStream } from '@/lib/market-stream';
import { LiveQuote, SourceSelect, useSourceMode, type TradeBridge } from '@/components/LiveQuote';
import { useTerminalMobile } from '@/hooks/use-terminal-mobile';
import { bybitListQuotes } from '@/lib/market-data';
import { QuoteChange } from '@/components/MarketList';
import { PairsSelector } from '@/components/PairsSelector';
import { BookDebug } from '@/components/BookDebug';
import { ToolsPanel } from '@/components/ToolsPanel';
import { EditPanel, HeatmapEditSection, DomEditSection, RadarEditSection, resetDom, resetRadar, type EditSection } from '@/components/EditPanel';
import { editTools, resetToDefault } from '@/lib/edit-panel';
import { heatmapUi } from '@/lib/heatmap-ui';
import { FB_DEFAULT } from '@/lib/flow-bars';
import { allToolsOff } from '@/lib/tools-panel';
import { ToolWindowLayer, type WinContent } from '@/components/ToolWindows';
import { WM_KEY, wmInitial, restoreWm, closeWin, closeTool, type WinId, type WmState } from '@/lib/window-manager';
import { stripPopoutTools, isSyncMessage, SYNC_CHANNEL, type SyncMessage, buildPressureUrl } from '@/lib/popout';
import { signOutApp } from '@/lib/session';
import { useProfile } from '@/hooks/use-profile';
import { FREE, daysLeft, effectiveStatus, expiringSoon, fmtDate, isPaid, lockTools, planLabel } from '@/lib/membership';
import { ProfileModal } from '@/components/ProfileModal';
import { ForexChart } from '@/components/ForexChart';
import { FX_STORAGE_KEY, FX_WM_KEY, FX_TFS, GOLD, GOLD_NOTE, FX_UNAVAILABLE, isSpotFx, fxTf, fxInitial, restoreForexState, fxQuote } from '@/lib/forex-terminal';
import { FOREX_PAIRS, POPULAR_FX, marketClosed, normalizePair, priceDigits } from '@/lib/forex-data';
import { supabase } from '@/integrations/supabase/client';
import { priceSpec, type Market, type PriceSpec, type Quote } from '@/lib/market-data';
const TFS=[{label:'1m',min:1},{label:'5m',min:5},{label:'10m',min:10},{label:'15m',min:15},{label:'30m',min:30},{label:'1h',min:60},{label:'4h',min:240},{label:'1d',min:1440}];

export function TerminalView({ forex = false }: { forex?: boolean }) {
  const account=useProfile();
  const [rawState,setState]=useState(forex?fxInitial:initialState);
  // Paid tools need an active Weekly/15 Days/Monthly plan (admin always has access); saved switches are kept, only the view is locked.
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),60_000);return()=>clearInterval(id);},[]);
  const membership=account?.membership??FREE;
  const toolsLocked=!account?.is_admin&&!isPaid(membership,clock);
  const state=useMemo(()=>toolsLocked?{...rawState,tools:lockTools(rawState.tools)}:rawState,[rawState,toolsLocked]);
  const planText=account?.is_admin&&!isPaid(membership,clock)?'Admin':planLabel(membership,clock);
  const planEnd=membership.ends_at,planStatus=effectiveStatus(membership,clock);
  const myPlan=membership.plan!=='Free'&&planStatus==='expired'&&planEnd?`Your membership expired on ${fmtDate(planEnd)}`:membership.plan!=='Free'&&planStatus==='active'&&planEnd?`My plan: ${membership.plan} · active until ${fmtDate(planEnd)} (${daysLeft(membership,clock)} days left)`:`My plan: ${membership.plan}${planStatus==='suspended'?' · suspended':''}`;
  const endingSoon=expiringSoon(membership,clock);
  const [hideEnding,setHideEnding]=useState(false);
  const stateKey=forex?FX_STORAGE_KEY:STORAGE_KEY,wmKey=forex?FX_WM_KEY:WM_KEY;
  const [restored,setRestored]=useState(false);
  const [pairs,setPairs]=useState<string[]>([]);
  const [priceSpecs,setPriceSpecs]=useState<Record<string,PriceSpec>>({});
  const quotes=useRef<Record<string,Quote>>({});
  const bridge=useRef<TradeBridge>({latest:null,receive:null});
  const [query,setQuery]=useState('');
  const [pairStatus,setPairStatus]=useState('Loading markets');
  const [feedLive,setFeedLive]=useState(false);
  const [showBookDebug,setShowBookDebug]=useState(false);
  const [wm,setWmState]=useState<WmState>(wmInitial);
  const [wmRestored,setWmRestored]=useState(false);
  const [feedHost,setFeedHost]=useState<HTMLDivElement|null>(null);
  useEffect(()=>{try{setWmState(restoreWm(localStorage.getItem(wmKey),window.innerWidth,window.innerHeight));}catch{}setWmRestored(true);},[]);
  useEffect(()=>{if(wmRestored)try{localStorage.setItem(wmKey,JSON.stringify(wm));}catch{}},[wm,wmRestored]);
  const setWm=(f:(s:WmState)=>WmState)=>setWmState(f);
  const [profileSettings,setProfileSettings]=useState<ProfileSettings>({...PROFILE_DEFAULT});
  const [showProfileSettings,setShowProfileSettings]=useState(false);
  const [footprintSettings,setFootprintSettings]=useState<FootprintSettings>({...FOOTPRINT_DEFAULT});
  const [showFootprintSettings,setShowFootprintSettings]=useState(false);
  const [whaleSettings,setWhaleSettings]=useState<WhaleSettings>({...WHALE_DEFAULT});
  const [showWhaleSettings,setShowWhaleSettings]=useState(false);
  const [liqSettings,setLiqSettings]=useState<LiqSettings>({...LIQ_DEFAULT});
  const [showLiqSettings,setShowLiqSettings]=useState(false);
  useEffect(()=>{setLiqSettings(restoreLiqSettings(localStorage.getItem(LIQ_KEY)));},[]);
  const changeLiqSettings=(next:LiqSettings)=>{setLiqSettings(next);localStorage.setItem(LIQ_KEY,JSON.stringify(next));};
  useEffect(()=>{setWhaleSettings(restoreWhaleSettings(localStorage.getItem(WHALE_KEY)));},[]);
  const changeWhaleSettings=(next:WhaleSettings)=>{setWhaleSettings(next);localStorage.setItem(WHALE_KEY,JSON.stringify(next));};
  const [cvdSettings,setCvdSettings]=useState<CvdSettings>({...CVD_DEFAULT});
  const [showCvdSettings,setShowCvdSettings]=useState(false);
  const [ppSettings,setPpSettings]=useState<PpSettings>({...PP_DEFAULT});
  const [showPpSettings,setShowPpSettings]=useState(false);
  const [showFbSettings,setShowFbSettings]=useState(false);
  const [fbSettings,setFbSettings]=useState<FbSettings>(()=>restoreFlowBars(null));
  useEffect(()=>{setFbSettings(restoreFlowBars(localStorage.getItem(FB_KEY)));},[]);
  const changeFbSettings=(next:FbSettings)=>{setFbSettings(next);localStorage.setItem(FB_KEY,JSON.stringify(next));};
  useEffect(()=>{setPpSettings(restorePressure(localStorage.getItem(PP_KEY)));},[]);
  const changePpSettings=(next:PpSettings)=>{setPpSettings(next);localStorage.setItem(PP_KEY,JSON.stringify(next));};
  useEffect(()=>{setCvdSettings(restoreCvd(localStorage.getItem(CVD_KEY)));},[]);
  const changeCvdSettings=(next:CvdSettings)=>{setCvdSettings(next);localStorage.setItem(CVD_KEY,JSON.stringify(next));};
  useEffect(()=>{setFootprintSettings(restoreFootprintSettings(localStorage.getItem(FOOTPRINT_KEY)));},[]);
  const changeFootprintSettings=(next:FootprintSettings)=>{setFootprintSettings(next);localStorage.setItem(FOOTPRINT_KEY,JSON.stringify(next));};
  useEffect(()=>{setProfileSettings(restoreProfile(localStorage.getItem(PROFILE_KEY)));},[]);
  const changeProfileSettings=(next:ProfileSettings)=>{setProfileSettings(next);localStorage.setItem(PROFILE_KEY,JSON.stringify(next));};

  const [showProfile,setShowProfile]=useState(false);
  const [showCustom,setShowCustom]=useState(false);
  const [custom,setCustom]=useState('');
  const [customError,setCustomError]=useState('');
  const [notice,setNotice]=useState('');
  const [fxNote,setFxNote]=useState('');
  const mobile=useTerminalMobile();
  const [mode,changeMode]=useSourceMode();
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
  useEffect(()=>{try{setState(withToolParam((forex?restoreForexState:restoreState)(localStorage.getItem(stateKey)),new URLSearchParams(location.search).get('tool')));}catch{}setRestored(true);},[]);
  useEffect(()=>{if(restored)applyTheme(state.theme);},[state.theme,restored]);
  useEffect(()=>{if(restored)try{localStorage.setItem(stateKey,JSON.stringify(rawState));}catch{}},[rawState,restored]);
  useEffect(()=>{
    const abort=new AbortController();let retry:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{try{
      const r=await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo',{signal:abort.signal});if(!r.ok)throw new Error();
      const d=await r.json();if(!Array.isArray(d.symbols))throw new Error();
      const markets: Market[]=d.symbols.filter((s:{quoteAsset:string;contractType:string;status:string})=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING');
      const keep=forex?(d.symbols as Market[]).filter(m=>m.symbol===GOLD):markets;
      setPriceSpecs(Object.fromEntries(keep.map(m=>[m.symbol,priceSpec(m)])));setPairs(forex?[GOLD,...FOREX_PAIRS,...POPULAR_FX]:keep.map(m=>m.symbol));setPairStatus('');
    }catch{if(!abort.signal.aborted){setPairStatus('Markets unavailable · retrying');retry=setTimeout(load,5000);}}};void load();

    const stop=marketStream('wss://fstream.binance.com/market/ws/!miniTicker@arr',data=>{
      if(!Array.isArray(data))return;
      if(listSourceRef.current==='bybit')return;
      lastQuoteAt.current=Date.now();
      for(const d of data){const price=Number(d.c),open=Number(d.o);if(typeof d.s==='string'&&price>0&&open>0)quotes.current[d.s]={price,change:(price-open)/open*100,quoteVolume:Number(d.q)||0};}

    },setFeedLive,{exchange:'binance',purpose:'markets'});
    // Seed quotes immediately; the single array stream subsequently updates them.
    fetch('https://fapi.binance.com/fapi/v1/ticker/24hr',{signal:abort.signal}).then(r=>r.ok?r.json():[]).then(data=>{if(!Array.isArray(data)||abort.signal.aborted)return;lastQuoteAt.current=lastQuoteAt.current||Date.now();quotes.current={...Object.fromEntries(data.map(d=>[d.symbol,{price:Number(d.lastPrice),change:Number(d.priceChangePercent),quoteVolume:Number(d.quoteVolume)||0}])),...quotes.current};}).catch(()=>{});
    return()=>{abort.abort();clearTimeout(retry);stop();};
  },[]);
  // Forex: 24h quotes for spot pairs come from saved 1h candles (never Twelve Data from the browser).
  useEffect(()=>{if(!forex)return;let on=true;const load=async()=>{const since=Math.floor(Date.now()/1000)-3*86400;const{data}=await supabase.from('forex_candles').select('pair,time,close').eq('tf','1h').gte('time',since).order('time',{ascending:true}).limit(5000);if(!on||!data)return;const by:Record<string,{time:number;close:number}[]>={};for(const r of data as {pair:string;time:number;close:number}[])(by[r.pair]??=[]).push({time:Number(r.time),close:r.close});for(const[k,v]of Object.entries(by)){const q=fxQuote(v);if(q)quotes.current[k]=q;}};void load();const id=setInterval(load,5*60_000);return()=>{on=false;clearInterval(id);};},[forex]);
  const active=state.tabs.find(t=>t.symbol===state.active)??state.tabs[0]??{symbol:'BTCUSDT',minutes:1};
  useEffect(()=>{setShowCustom(false);setCustomError('');},[active.symbol,active.minutes]);
  const tabsRef=useRef(state.tabs);tabsRef.current=state.tabs;
  const select=useCallback((symbol:string)=>{setFxNote('');if(tabsRef.current.length>=10&&!tabsRef.current.some(t=>t.symbol===symbol)){setNotice('Maximum 10 tabs. Close a tab to open another pair.');return;}setNotice('');setState(s=>{const n=openPair(s,symbol);return forex&&isSpotFx(symbol)&&!s.tabs.some(t=>t.symbol===symbol)?{...n,tabs:n.tabs.map(t=>t.symbol===symbol?{...t,minutes:60}:t)}:n;});},[forex]);
  const isFx=forex&&isSpotFx(active.symbol);
  const searchEnter=(e:React.KeyboardEvent<HTMLInputElement>)=>{if(!forex||e.key!=='Enter')return;const p=normalizePair(query);if(p){select(p);setQuery('');}};
  const tabSyms=state.tabs.map(t=>t.symbol).join(',');
  const listPairs=useMemo(()=>forex?[...new Set([...pairs,...tabSyms.split(',').filter(Boolean)])]:pairs,[forex,pairs,tabSyms]);
  const listSpecs:Record<string,PriceSpec>=useMemo(()=>forex?{...Object.fromEntries(listPairs.filter(isSpotFx).map(p=>[p,{precision:priceDigits(p),minMove:10**-priceDigits(p)}])),...priceSpecs}:priceSpecs,[forex,listPairs,priceSpecs]);
  const fxTools=TOOLS.filter(t=>t!=='Candle timer'&&(t==='Control & Attack bars'?state.tools[t]!==false:Boolean(state.tools[t])));
  const tfLabel=(t:{symbol:string;minutes:number})=>forex&&isSpotFx(t.symbol)?(FX_TFS.find(x=>x.min===t.minutes)?.label??'1H'):`${t.minutes}m`;
  const timeframe=(minutes:number)=>setState(s=>({...s,tabs:s.tabs.map(t=>t.symbol===s.active?{...t,minutes}:t)}));
  const applyCustom=()=>{const n=validMinutes(custom);if(n===null){setCustomError('Enter a whole number from 1 to 1440.');return;}timeframe(n);setShowCustom(false);setCustomError('');};
  const activeSpec=listSpecs[active.symbol];
  // Floating tool windows (desktop only): a layer above the chart, never inside chart internals.
  // Only Price Pressure ever opens in its own window; every other tool stays inside the chart area.
  const floatOn=(id:WinId)=>!mobile&&id==='Price Pressure';
  const heatmapOn=Boolean(state.tools['Heatmap']),domOn=Boolean(state.tools['DOM']),feedOn=Boolean(state.tools['Whale Trades'])&&whaleSettings.feed;
  const minimized=(id:WinId)=>Boolean(wm.wins[id]?.min);
  const closeWindow=(id:WinId)=>{setWm(s=>closeWin(s,id));if(id==='Book debug')setShowBookDebug(false);else if(id==='Whale feed')changeWhaleSettings({...whaleSettings,feed:false});else setState(s=>({...s,tools:closeTool(s.tools,id)}));};
  const windows:WinContent[]=restored&&activeSpec&&!isFx?[
    ...(heatmapOn&&floatOn('Heatmap')?[{id:'Heatmap' as WinId,node:<Heatmap key={active.symbol} symbol={active.symbol} spec={activeSpec} bridge={bridge} historySource={mode==='binance'||mode==='bybit'?mode:listSource} floating paused={minimized('Heatmap')}/>}]:[]),
    ...(domOn&&floatOn('DOM')?[{id:'DOM' as WinId,node:<DomLadder key={active.symbol} symbol={active.symbol} spec={activeSpec} bridge={bridge} mobile={false} floating paused={minimized('DOM')} onClose={()=>closeWindow('DOM')}/>}]:[]),
    ...(feedOn&&floatOn('Whale feed')?[{id:'Whale feed' as WinId,node:<div ref={setFeedHost} className="flex min-h-0 flex-1 flex-col"/>}]:[]),
    ...(state.tools['Price Pressure']&&floatOn('Price Pressure')?[{id:'Price Pressure' as WinId,node:<iframe key={`${active.symbol}-${active.minutes}-${listSource}`} title="Price Pressure" src={buildPressureUrl({symbol:active.symbol,tf:active.minutes,source:listSource})} className="min-h-0 w-full flex-1 border-0"/>}]:[]),
  ]:[];
  const dockedOn:WinId[]=[];void (['Heatmap','DOM','Whale feed','Book debug'] as WinId[]).filter(id=>!floatOn(id)&&(id==='Heatmap'?heatmapOn:id==='DOM'?domOn:id==='Whale feed'?feedOn:showBookDebug));
  // The Pressure button opens the standalone /pressure page in a new tab; the channel keeps its follow/lock in sync.
  const syncRef=useRef<BroadcastChannel|null>(null);
  const syncStateRef=useRef({symbol:active.symbol,timeframe:active.minutes,source:listSource,theme:state.theme});
  syncStateRef.current={symbol:active.symbol,timeframe:active.minutes,source:listSource,theme:state.theme};
  // Never auto-open popup tools from saved switches. Mobile keeps its in-page settings.
  useEffect(()=>{if(restored&&wmRestored&&!mobile&&wm.mode==='popout')setState(s=>s.tools['Price Pressure']?{...s,tools:stripPopoutTools(s.tools,'popout')}:s);},[restored,wmRestored,mobile]);
  useEffect(()=>{
    const channel=new BroadcastChannel(SYNC_CHANNEL);syncRef.current=channel;
    const post=()=>channel.postMessage({type:'state',state:syncStateRef.current});
    channel.onmessage=ev=>{if(!isSyncMessage(ev.data))return;const m=ev.data;if(m.type==='hello')post();};
    const bye=()=>channel.postMessage({type:'bye'});
    window.addEventListener('beforeunload',bye);
    return()=>{window.removeEventListener('beforeunload',bye);bye();channel.close();syncRef.current=null;};
  },[]);
  useEffect(()=>{const m:SyncMessage={type:'state',state:syncStateRef.current};syncRef.current?.postMessage(m);},[active.symbol,active.minutes,listSource,state.theme]);
  const control='text-t-muted hover:bg-t-border/50 hover:text-t-text';
  const [showFlowSheet,setShowFlowSheet]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const setTheme=(t:string)=>setState(s=>({...s,theme:t}));
  const setTool=(id:string,on:boolean)=>{if(id==='Price Pressure'&&!on)setWm(s=>closeWin(s,'Price Pressure'));setState(s=>({...s,tools:{...s.tools,[id]:on}}));};
  const renderToolSettings=(id:string,back:()=>void)=>id==='Volume Profile'?<VolumeProfileSettingsPanel settings={profileSettings} onChange={changeProfileSettings} onClose={back} mobile={mobile} theme={state.theme}/>:id==='Footprint'&&activeSpec?<FootprintSettingsPanel settings={footprintSettings} onChange={changeFootprintSettings} onClose={back} mobile={mobile} theme={state.theme} source={listSource} symbol={active.symbol} tick={activeSpec.minMove} minutes={active.minutes}/>:id==='Whale Trades'?<WhaleSettingsPanel settings={whaleSettings} onChange={changeWhaleSettings} onClose={back} mobile={mobile} theme={state.theme} source={listSource}/>:id==='CVD'?<CvdSettingsPanel settings={cvdSettings} onChange={changeCvdSettings} onClose={back} mobile={mobile} theme={state.theme}/>:id==='Liquidations'?<LiquidationSettingsPanel settings={liqSettings} onChange={changeLiqSettings} onClose={back} mobile={mobile} theme={state.theme} source={listSource}/>:id==='Price Pressure'?<PricePressureSettingsPanel settings={ppSettings} onChange={changePpSettings} onClose={back} mobile={mobile} theme={state.theme}/>:id==='Control & Attack bars'?<FlowBarsSettingsPanel settings={fbSettings} onChange={changeFbSettings} onClose={back} mobile={mobile} theme={state.theme}/>:null;
  const flowButton=mobile?<Button variant="ghost" size="icon" className="btn-accent mx-1 size-10 shrink-0" aria-label="Order flow tools" title="Order flow tools" aria-expanded={showFlowSheet} onClick={()=>setShowFlowSheet(o=>!o)}><Layers/></Button>:<Button variant="ghost" size="sm" aria-expanded={showFlowSheet} onClick={()=>setShowFlowSheet(o=>!o)} className="btn-accent gap-1.5 font-semibold tracking-wide"><Layers/>Order flow<ChevronDown className="opacity-70"/></Button>;
  const toolsPanel=<ToolsPanel open={showFlowSheet} onClose={()=>setShowFlowSheet(false)} mobile={mobile} theme={state.theme} tools={state.tools} setTool={setTool} allOff={()=>{setWm(s=>closeWin(s,'Price Pressure'));setState(s=>({...s,tools:allToolsOff(s.tools)}));}} disabledReason={isFx?FX_UNAVAILABLE:null} planLabel={planText} locked={toolsLocked} onUpgrade={()=>{setShowFlowSheet(false);setShowProfile(true);}} button={flowButton}/>;
  // Edit menu: settings of tools that are on. Existing settings panels are embedded unchanged (.tools-embed hides their floating frame).
  const embed=(id:string)=><div className="tools-embed">{renderToolSettings(id,()=>{})}</div>;
  const editNames:Record<string,string>={DOM:'DOM ladder'};
  const editBody=(id:string)=>id==='Heatmap'?<HeatmapEditSection mobile={mobile}/>:id==='DOM'?<DomEditSection/>:id==='Flow Radar'?<RadarEditSection minutes={active.minutes}/>:id==='Whale Trades'?<><div className="flex items-center justify-between px-4 text-xs text-t-muted">Whale trades on this pair<WhaleCount source={listSource} symbol={active.symbol} tick={activeSpec?.minMove??.01}/></div>{embed(id)}</>:id==='Price Pressure'?<>{embed(id)}<a href={buildPressureUrl({symbol:active.symbol,tf:active.minutes,source:listSource})} target="_blank" rel="noopener" className="mx-4 inline-flex items-center gap-1.5 text-xs text-t-muted hover:text-t-text"><ExternalLink className="size-3.5"/>Open Price Pressure in new tab</a></>:embed(id);
  const editReset:Record<string,()=>void>={
    'Volume Profile':()=>changeProfileSettings(resetToDefault('Volume Profile',PROFILE_DEFAULT,profileSettings)),
    Heatmap:()=>heatmapUi.get()?.reset(),
    DOM:resetDom,
    Footprint:()=>changeFootprintSettings(resetToDefault('Footprint',FOOTPRINT_DEFAULT,footprintSettings)),
    CVD:()=>changeCvdSettings(resetToDefault('CVD',CVD_DEFAULT,cvdSettings)),
    'Whale Trades':()=>changeWhaleSettings(resetToDefault('Whale Trades',WHALE_DEFAULT,whaleSettings)),
    'Price Pressure':()=>changePpSettings(resetToDefault('Price Pressure',PP_DEFAULT,ppSettings)),
    'Control & Attack bars':()=>changeFbSettings(resetToDefault('Control & Attack bars',FB_DEFAULT,fbSettings)),
    Liquidations:()=>changeLiqSettings(resetToDefault('Liquidations',LIQ_DEFAULT,liqSettings)),
    'Flow Radar':resetRadar,
  };
  const editSections:EditSection[]=showEdit?editTools(state.tools).filter(id=>editReset[id]&&(id!=='Footprint'||activeSpec)).map(id=>({id,name:editNames[id]??id,body:editBody(id),reset:editReset[id]!})):[];
  const editButton=mobile?<Button variant="ghost" size="icon" className="btn-accent mr-1 size-10 shrink-0" aria-label="Edit tool settings" title="Edit tool settings" aria-expanded={showEdit} onClick={()=>setShowEdit(o=>!o)}><Pencil/></Button>:<Button variant="ghost" size="sm" aria-expanded={showEdit} onClick={()=>setShowEdit(o=>!o)} className="btn-accent gap-1.5 font-semibold tracking-wide"><Pencil/>Edit<ChevronDown className="opacity-70"/></Button>;
  const hasEditTools=editTools(state.tools).length>0;
  useEffect(()=>{if(!hasEditTools)setShowEdit(false);},[hasEditTools]);
  const editPanel=!hasEditTools?null:<EditPanel open={showEdit} onClose={()=>setShowEdit(false)} mobile={mobile} theme={state.theme} button={editButton} sections={editSections} disabledReason={isFx?FX_UNAVAILABLE:null}/>;
  const customForm=showCustom&&<form onSubmit={e=>{e.preventDefault();applyCustom();}} className="flex flex-wrap items-center gap-2"><input autoFocus type="number" min={1} max={1440} step={1} aria-label="Custom timeframe minutes" value={custom} onChange={e=>setCustom(e.target.value)} className="h-8 w-20 rounded-md border border-t-border bg-t-panel px-2 text-xs mobile:h-10 mobile:text-sm"/><Button type="submit" size="sm" className="bg-t-accent text-t-bg hover:bg-t-accent/90 mobile:h-10">Go</Button>{customError&&<span role="alert" className="text-xs text-t-down">{customError}</span>}</form>;
  return <div data-mobile={mobile||undefined} className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-t-bg text-t-text mobile:min-h-0 mobile:pt-[env(safe-area-inset-top)] mobile:pr-[env(safe-area-inset-right)] mobile:pb-[env(safe-area-inset-bottom)] mobile:pl-[env(safe-area-inset-left)]">
    {mobile?<header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-t-border bg-t-panel px-2 py-1">
      <Link to="/" aria-label="DepthLens home" className="flex size-10 items-center justify-center"><img src={logo.url} alt="DepthLens logo" className="size-7 shrink-0 rounded-md" /></Link>
      <div className="flex min-w-0 items-center overflow-hidden tabular-nums"><div className="flex min-w-0 flex-col leading-tight"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-[11px] font-bold">{active.symbol}</span><span className="shrink-0 rounded border border-t-border px-1 text-[9px] font-semibold uppercase text-t-muted">{isFx?'FX':listSource==='bybit'?'Bybit':'Binance'}</span><ChevronDown className="size-3 shrink-0 text-t-muted"/></span><div className="flex min-w-0 items-center gap-2 whitespace-nowrap text-base font-bold">{isFx?<FxLast symbol={active.symbol} quotes={quotes} specs={listSpecs}/>:<LiveQuote symbol={active.symbol} minutes={active.minutes} spec={activeSpec} bridge={bridge} bookEnabled={Boolean(state.tools['Heatmap'] || state.tools['DOM'])} profileEnabled={Boolean(state.tools['Volume Profile'])} mode={mode} onModeChange={changeMode} onSourceChange={src=>setListSource(src==='bybit'?'bybit':'binance')} compact/>}<span className="text-xs font-semibold"><QuoteChange symbol={active.symbol} quotes={quotes}/></span></div></div></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`size-11 ${control}`} aria-label="More" title="More"><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} data-mobile="" align="end" className="w-64 border-t-border bg-t-panel p-1 text-sm text-t-text">
        <div className="flex min-h-11 items-center justify-between gap-2 px-2" onKeyDown={e=>e.stopPropagation()}><span className="text-t-muted">Price source</span><SourceSelect mode={mode} onChange={changeMode} className="h-10 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text"/></div>
        <div className="max-w-64 px-2 py-1.5 text-xs text-t-muted">{myPlan}</div><DropdownMenuItem onSelect={()=>setShowProfile(true)} className="min-h-11 focus:bg-t-border focus:text-t-text"><UserRound/>Profile & subscriptions</DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11 focus:bg-t-border focus:text-t-text"><Link to={forex?'/terminal':'/forex'}><ArrowLeftRight/>{forex?'Switch to Futures':'Switch to Forex'}</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>void signOutApp()} className="min-h-11 text-t-down focus:bg-t-border focus:text-t-down"><LogOut/>Sign out</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </header>:<header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-t-border bg-t-panel px-4 py-2">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold text-t-accent"><img src={logo.url} alt="DepthLens logo" className="size-8 shrink-0 rounded-md" />DepthLens</Link>
      <div className="flex flex-wrap items-baseline gap-2 tabular-nums"><span className="text-sm font-semibold">{active.symbol}</span>{isFx?<FxLast symbol={active.symbol} quotes={quotes} specs={listSpecs}/>:<LiveQuote symbol={active.symbol} minutes={active.minutes} spec={activeSpec} bridge={bridge} bookEnabled={Boolean(state.tools['Heatmap'] || state.tools['DOM'])} profileEnabled={Boolean(state.tools['Volume Profile'])} mode={mode} onModeChange={changeMode} onSourceChange={src=>setListSource(src==='bybit'?'bybit':'binance')}/>}<QuoteChange symbol={active.symbol} quotes={quotes}/>{forex&&<ForexBadges isFx={isFx} note={fxNote}/>}</div>
      <div className="ml-auto flex items-center gap-2">{forex&&<ModeSwitch/>}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`${control} rounded-full border border-t-border`} aria-label="Profile menu" title="Profile"><UserRound/></Button></DropdownMenuTrigger><DropdownMenuContent data-theme={state.theme} align="end" className="border-t-border bg-t-panel text-t-text"><div className="max-w-64 px-2 py-1.5 text-xs text-t-muted">{myPlan}</div><DropdownMenuItem onSelect={()=>setShowProfile(true)} className="focus:bg-t-border focus:text-t-text"><UserRound/>Profile</DropdownMenuItem><DropdownMenuItem onSelect={()=>void signOutApp()} className="focus:bg-t-border focus:text-t-text"><LogOut/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>

      </div>
    </header>}
    {endingSoon&&!hideEnding&&planEnd&&<div role="status" className="flex shrink-0 items-center justify-center gap-2 border-b border-t-border bg-t-panel px-3 py-1 text-xs text-t-accent">Your plan ends on {fmtDate(planEnd)}<button type="button" aria-label="Dismiss" onClick={()=>setHideEnding(true)} className="text-t-muted hover:text-t-text">×</button></div>}
    {showProfile&&<ProfileModal account={account} theme={state.theme} setTheme={setTheme} forex={forex} onClose={()=>setShowProfile(false)}/>}

    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 border-b border-t-border bg-t-panel mobile:h-12">
        <div role="tablist" aria-label="Open pairs" className="terminal-tabs flex min-w-0 flex-1 overflow-x-auto pt-1" onWheel={e=>{if(e.currentTarget.scrollWidth>e.currentTarget.clientWidth){e.currentTarget.scrollLeft+=e.deltaY||e.deltaX;}}}>
          {state.tabs.map(t=><div key={t.symbol} className={`flex shrink-0 items-center border-r border-t-border ${t.symbol===active.symbol?'border-t-2 border-t-t-accent bg-t-bg':'border-t-2 border-t-transparent'}`}><Button role="tab" aria-selected={t.symbol===active.symbol} variant="ghost" onClick={()=>select(t.symbol)} className={`h-full rounded-none px-3 text-xs ${t.symbol===active.symbol?'font-semibold text-t-accent':control}`}>{t.symbol}<span className="text-[10px] text-t-muted mobile:text-xs">{tfLabel(t)}</span></Button><Button variant="ghost" size="icon" className={`mr-1 size-6 mobile:mr-0 mobile:size-10 ${control}`} aria-label={`Close ${t.symbol}`} title={`Close ${t.symbol}`} disabled={state.tabs.length===1} onClick={()=>{setNotice('');setState(s=>closePair(s,t.symbol));}}><X className="size-3"/></Button></div>)}
        </div>
        </div>
        {mobile?<><div className="flex shrink-0 items-center border-b border-t-border">
          <div className="terminal-tabs flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap px-2 py-1">
            {(isFx?FX_TFS:TFS).map(t=><Button key={t.label} variant="ghost" size="sm" aria-pressed={active.minutes===t.min} onClick={()=>timeframe(t.min)} className={`h-10 shrink-0 px-3 text-sm ${active.minutes===t.min?'btn-accent':control}`}>{t.label}</Button>)}
            {!isFx&&<Button variant="ghost" size="sm" aria-expanded={showCustom} onClick={()=>{setCustom(String(active.minutes));setShowCustom(s=>!s);}} className={`h-10 shrink-0 text-sm ${!TFS.some(t=>t.min===active.minutes)?'bg-t-accent text-t-bg':control}`}>{!TFS.some(t=>t.min===active.minutes)?`${active.minutes}m · Custom`:'Custom'}<ChevronDown/></Button>}
          </div>
          <div className="ml-1"><PairsSelector pairs={listPairs} quotes={quotes} specs={listSpecs} active={active.symbol} status={pairStatus} select={select} query={query} setQuery={setQuery} onEnter={searchEnter} forex={forex} mobile={mobile}/></div>
          {toolsPanel}{editPanel}
        </div>{showCustom&&<div className="shrink-0 border-b border-t-border px-2 py-1">{customForm}</div>}</>:<>
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-t-border px-2 py-2">
          <div className="mr-1"><PairsSelector pairs={listPairs} quotes={quotes} specs={listSpecs} active={active.symbol} status={pairStatus} select={select} query={query} setQuery={setQuery} onEnter={searchEnter} forex={forex} mobile={mobile}/></div>
          {(isFx?FX_TFS:TFS).map(t=><Button key={t.label} variant="ghost" size="sm" aria-pressed={active.minutes===t.min} onClick={()=>timeframe(t.min)} className={`px-2.5 ${active.minutes===t.min?'btn-accent':control}`}>{t.label}</Button>)}
          {!isFx&&<Button variant="ghost" size="sm" aria-expanded={showCustom} onClick={()=>{setCustom(String(active.minutes));setShowCustom(s=>!s);}} className={!TFS.some(t=>t.min===active.minutes)?'bg-t-accent text-t-bg':control}>{!TFS.some(t=>t.min===active.minutes)?`${active.minutes}m · Custom`:'Custom'}<ChevronDown/></Button>}
        <div className="flex shrink-0 items-center gap-2 px-2">
        {toolsPanel}{editPanel}
        </div>
          {showCustom&&<form onSubmit={e=>{e.preventDefault();applyCustom();}} className="flex flex-wrap items-center gap-2"><input autoFocus type="number" min={1} max={1440} step={1} aria-label="Custom timeframe minutes" value={custom} onChange={e=>setCustom(e.target.value)} className="h-8 w-20 rounded-md border border-t-border bg-t-panel px-2 text-xs"/><Button type="submit" size="sm" className="bg-t-accent text-t-bg hover:bg-t-accent/90">Go</Button>{customError&&<span role="alert" className="text-xs text-t-down">{customError}</span>}</form>}
        </div>
        </>}
        {notice&&<div role="alert" className="border-b border-t-border px-3 py-2 text-xs text-t-down">{notice}</div>}
        <div className="flex min-h-0 flex-1"><div className="relative min-h-0 min-w-0 flex-1">{restored&&isFx&&<><ForexChart key={active.symbol} pair={active.symbol} tf={fxTf(active.minutes)} theme={state.theme} onNote={setFxNote}/>{fxTools.length>0&&<FxUnavailable tools={fxTools} onGold={()=>select(GOLD)}/>}</>}{restored&&!isFx&&forex&&active.symbol===GOLD&&<span className="pointer-events-none absolute bottom-10 left-12 z-20 rounded bg-t-panel/80 px-1.5 py-0.5 text-[10px] text-t-muted">{GOLD_NOTE}</span>}{restored&&!isFx&&activeSpec&&(heatmapOn&&!floatOn('Heatmap')?<Heatmap key={active.symbol} symbol={active.symbol} spec={activeSpec} bridge={bridge} historySource={mode==='binance'||mode==='bybit'?mode:listSource} mobile={mobile}/>:<PriceChart key={active.symbol} symbol={active.symbol} minutes={active.minutes} theme={state.theme} priceFormat={activeSpec} bridge={bridge} mobile={mobile} volumeProfile={Boolean(state.tools['Volume Profile'])} profileSettings={profileSettings} source={listSource} candleTimer footprint={Boolean(state.tools['Footprint'])} footprintSettings={footprintSettings} cvd={Boolean(state.tools['CVD'])} cvdSettings={cvdSettings} liquidations={Boolean(state.tools['Liquidations'])} liqSettings={liqSettings} onLiqHeight={ratio=>changeLiqSettings({...liqSettings,height:ratio})} whales={Boolean(state.tools['Whale Trades'])} whaleSettings={whaleSettings} pressure={Boolean(state.tools['Price Pressure'])&&mobile} pressureSettings={ppSettings} onPressureChange={changePpSettings} flowRadar={Boolean(state.tools['Flow Radar'])} flowBars={state.tools['Control & Attack bars']!==false} flowSettings={fbSettings} onFlowChange={changeFbSettings} onCvdHeight={ratio=>changeCvdSettings({...cvdSettings,height:ratio})} whaleFeedHost={feedOn&&floatOn('Whale feed')?feedHost:null}/>)} {showBookDebug&&!isFx&&!floatOn('Book debug')&&<BookDebug spec={activeSpec}/>}{!mobile&&<ToolWindowLayer wm={wm} setWm={setWm} open={windows} subtitle={`${active.symbol} · ${listSource==='bybit'?'Bybit':'Binance'}`} onDock={closeWindow} onClose={closeWindow}/>}</div>{restored&&!isFx&&activeSpec&&domOn&&!floatOn('DOM')&&<DomLadder key={active.symbol} symbol={active.symbol} spec={activeSpec} bridge={bridge} mobile={mobile} onClose={()=>setState(s=>({...s,tools:{...s.tools,DOM:false}}))}/>}</div>
      </main>
    </div>
    {showFootprintSettings&&activeSpec&&<FootprintSettingsPanel settings={footprintSettings} onChange={changeFootprintSettings} onClose={()=>setShowFootprintSettings(false)} mobile={mobile} theme={state.theme} source={listSource} symbol={active.symbol} tick={activeSpec.minMove} minutes={active.minutes}/>}
    {showLiqSettings&&<LiquidationSettingsPanel settings={liqSettings} onChange={changeLiqSettings} onClose={()=>setShowLiqSettings(false)} mobile={mobile} theme={state.theme} source={listSource}/>}
    {showWhaleSettings&&<WhaleSettingsPanel settings={whaleSettings} onChange={changeWhaleSettings} onClose={()=>setShowWhaleSettings(false)} mobile={mobile} theme={state.theme} source={listSource}/>}
    {showFbSettings&&<FlowBarsSettingsPanel settings={fbSettings} onChange={changeFbSettings} onClose={()=>setShowFbSettings(false)} mobile={mobile} theme={state.theme}/>}
    {showPpSettings&&<PricePressureSettingsPanel settings={ppSettings} onChange={changePpSettings} onClose={()=>setShowPpSettings(false)} mobile={mobile} theme={state.theme}/>}
    {showCvdSettings&&<CvdSettingsPanel settings={cvdSettings} onChange={changeCvdSettings} onClose={()=>setShowCvdSettings(false)} mobile={mobile} theme={state.theme}/>}
    {showProfileSettings&&<VolumeProfileSettingsPanel settings={profileSettings} onChange={changeProfileSettings} onClose={()=>setShowProfileSettings(false)} mobile={mobile} theme={state.theme}/>}
  </div>;
}

function FxLast({ symbol, quotes, specs }: { symbol: string; quotes: React.MutableRefObject<Record<string, Quote>>; specs: Record<string, PriceSpec> }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const render = () => { const q = quotes.current[symbol], sp = specs[symbol]; if (ref.current) ref.current.textContent = q && sp ? q.price.toFixed(sp.precision) : '—'; }; render(); const id = setInterval(render, 1000); return () => clearInterval(id); }, [symbol, quotes, specs]);
  return <span ref={ref} data-testid="fx-last" className="text-sm font-semibold tabular-nums">—</span>;
}
function ForexBadges({ isFx, note }: { isFx: boolean; note: string }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => { const f = () => setClosed(marketClosed(Date.now() / 1000)); f(); const id = setInterval(f, 60_000); return () => clearInterval(id); }, []);
  return <>{isFx && closed && <span className="rounded border border-t-border px-1.5 py-0.5 text-[10px] text-t-muted">Market closed</span>}{isFx && note && <span data-testid="fx-note" className="text-[10px] text-t-muted">{note}</span>}</>;
}
function ModeSwitch() {
  return <div className="flex rounded-md border border-t-border p-0.5 text-xs"><Link to="/terminal" className="rounded px-2 py-1 text-t-muted hover:bg-t-border/50">Futures</Link><span className="rounded bg-t-accent px-2 py-1 font-semibold text-t-accent-fg">Forex</span></div>;
}
function FxUnavailable({ tools, onGold }: { tools: string[]; onGold: () => void }) {
  return <div role="note" className="absolute right-3 top-3 z-20 w-[min(20rem,calc(100%-1.5rem))] rounded-md border border-t-border bg-t-panel/95 p-3 text-xs shadow-lg"><p className="font-semibold">{tools.join(', ')}</p><p className="mt-1 text-t-muted">{FX_UNAVAILABLE}</p><Button size="sm" onClick={onGold} className="btn-accent mt-2">Open XAUUSD (full tools)</Button></div>;
}
