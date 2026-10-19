import type { TradeSource, LivePrice } from './live-price';

export type ProfileSettings = { range: 'Visible' | '4h' | '12h' | '24h' | '3d'; rows: 'Auto' | '50' | '100'; valueArea: number; split: boolean; position: 'right' | 'left'; opacity: number };
export const PROFILE_KEY = 'depthlens.volume-profile.v1';
export const PROFILE_DEFAULT: ProfileSettings = { range: 'Visible', rows: 'Auto', valueArea: 70, split: true, position: 'right', opacity: .55 };
export function restoreProfile(raw: string | null): ProfileSettings {
  try { const d = JSON.parse(raw ?? 'null'); return { range: ['Visible','4h','12h','24h','3d'].includes(d?.range) ? d.range : 'Visible', rows: ['Auto','50','100'].includes(d?.rows) ? d.rows : 'Auto', valueArea: Math.max(50, Math.min(90, Number(d?.valueArea) || 70)), split: d?.split !== false, position: d?.position === 'left' ? 'left' : 'right', opacity: Math.max(.1, Math.min(.9, Number(d?.opacity) || .55)) }; } catch { return { ...PROFILE_DEFAULT }; }
}
export type VolumeCandle = { time: number; low: number; high: number; volume: number; buy: number | null };
type LiveBucket = { time: number; price: number; volume: number; buy: number; receivedAt: number };
type Entry = { candles: VolumeCandle[]; live: Map<string,LiveBucket>; fetchedAt: number; baselineAt: number; pending?: Promise<void>; error: string };
const cache = new Map<string, Entry>();
let pausedUntil = 0;
function entry(source: TradeSource, symbol: string) { const key = `${source}:${symbol}`; let e = cache.get(key); if (!e) { e = { candles: [], live: new Map(), fetchedAt: 0, baselineAt: 0, error: '' }; cache.set(key,e); } return e; }
export function addProfileTrade(symbol: string, tick: LivePrice) {
  if (tick.source !== 'trade' || !tick.exchange || !tick.size || tick.size <= 0) return;
  const e = entry(tick.exchange,symbol), receivedAt = tick.receivedAt ?? Date.now();
  const time = Math.floor(tick.time / 60000) * 60000, key = `${time}:${tick.price}`, old=e.live.get(key);
  if(old && old.receivedAt>e.baselineAt) {old.volume+=tick.size;old.buy+=tick.side==='Buy'?tick.size:0;old.receivedAt=receivedAt;}
  else e.live.set(key,{ time, price: tick.price, volume: tick.size, buy: tick.side === 'Buy' ? tick.size : 0, receivedAt });
}
export async function loadProfile(source: TradeSource, symbol: string, now = Date.now()): Promise<void> {
  const e = entry(source,symbol);
  if (e.pending) return e.pending;
  if (now < pausedUntil) { e.error = 'Rate limited · retrying in 60s'; return; }
  if (e.fetchedAt && now - e.fetchedAt < 300000) return;
  e.pending = (async () => {
    try {
      const all: VolumeCandle[] = []; let end = now;
      // Record the baseline before requesting the current minute, so trades arriving during paging are retained.
      const baselineAt=Date.now();
      e.baselineAt=baselineAt;
      e.live.clear();
      for (let page = 0; page < 3; page++) {
        const url = source === 'binance' ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1500&endTime=${end}` : `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=1&limit=1000&end=${end}`;
        const r = await fetch(url);
        if (r.status === 429 || r.status === 418) { pausedUntil = Date.now() + 60000; throw new Error('Rate limited · retrying in 60s'); }
        if (!r.ok) throw new Error('Volume history unavailable');
        const body = await r.json(), list = source === 'binance' ? body : body?.result?.list;
        if (!Array.isArray(list) || (source === 'bybit' && body.retCode !== 0)) throw new Error('Volume history unavailable');
        const candles: VolumeCandle[] = list.map((k: string[]) => ({ time: Number(k[0]), low: Number(k[3]), high: Number(k[2]), volume: Number(k[5]), buy: source === 'binance' ? Number(k[9]) : null })).filter(c => Number.isFinite(c.time) && c.high >= c.low && c.volume >= 0);
        if (!candles.length) break;
        all.push(...candles); end = Math.min(...candles.map(c=>c.time)) - 1;
        if (end < now - 3 * 86400000) break;
      }
      e.candles = [...new Map(all.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time);
      // The open candle is a baseline. Never add trades already covered by this snapshot.
      e.fetchedAt = Date.now(); e.error = '';
    } catch (error) { e.error = error instanceof Error ? error.message : 'Volume history unavailable'; }
    finally { delete e.pending; }
  })();
  return e.pending;
}
export function profileData(source: TradeSource, symbol: string) {
  const e = entry(source,symbol), cutoff = Date.now() - 3*86400000;
  for (const [key,t] of e.live) if(t.time<cutoff) e.live.delete(key);
  return { candles: e.candles, live: [...e.live.values()], error: e.error, loading: Boolean(e.pending) };
}
export type ProfileRow = { low: number; high: number; volume: number; buy: number; sell: number; inArea: boolean };
export function buildProfile(candles: VolumeCandle[], trades: Pick<LiveBucket,'time'|'price'|'volume'|'buy'>[], min: number, max: number, tick: number, settings: ProfileSettings, from: number, to: number) {
  const target = settings.rows === 'Auto' ? 60 : Number(settings.rows);
  const step = Math.max(tick, Math.ceil((max-min)/target/tick)*tick);
  const base = Math.floor(min/step)*step, count = Math.min(102, Math.max(1,Math.ceil((max-base)/step)));
  const rows: ProfileRow[] = Array.from({length:count},(_,i)=>({low:base+i*step,high:base+(i+1)*step,volume:0,buy:0,sell:0,inArea:false}));
  for (const c of candles) {
    if(c.time<from || c.time>to || c.high<base || c.low>base+count*step) continue;
    const first = Math.floor(c.low/step), last = Math.floor(c.high/step), n = last-first+1;
    for(let i=Math.max(0,first-Math.round(base/step));i<=Math.min(count-1,last-Math.round(base/step));i++) { const r=rows[i]; if(!r)continue; r.volume+=c.volume/n; r.buy+=(c.buy??0)/n; }
  }
  for(const t of trades) { if(t.time<from || t.time>to)continue; const r=rows[Math.floor((t.price-base)/step)]; if(r){r.volume+=t.volume;r.buy+=t.buy;} }
  let poc=0, total=0;
  rows.forEach((r,i)=>{r.sell=Math.max(0,r.volume-r.buy);total+=r.volume;if(r.volume>(rows[poc]?.volume??0))poc=i;});
  let lower=poc,upper=poc, area=rows[poc]?.volume??0;
  while(area<total*settings.valueArea/100 && (lower>0 || upper<count-1)) {
    if(lower===0 || (upper<count-1 && (rows[upper+1]?.volume??0)>(rows[lower-1]?.volume??0))) {upper++;area+=rows[upper]?.volume??0;} else {lower--;area+=rows[lower]?.volume??0;}
  }
  rows.forEach((r,i)=>{r.inArea=i>=lower&&i<=upper;});
  return { rows,total,poc:base+(poc+.5)*step,vah:base+(upper+1)*step,val:base+lower*step,area,split:candles.some(c=>c.buy!==null),step };
}