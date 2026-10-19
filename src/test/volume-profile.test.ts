import { describe,it,expect,vi,afterEach } from 'vitest';
import { buildProfile, PROFILE_DEFAULT, restoreProfile } from '@/lib/volume-profile';
const settings={...PROFILE_DEFAULT,rows:'50' as const};
describe('Volume Profile rules',()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
  it('spreads candle volume evenly across tick-aligned price rows',()=>{
    const p=buildProfile([{time:0,low:10,high:12,volume:90,buy:60}],[],0,50,1,settings,0,60000);
    expect(p.rows.slice(10,13).map(r=>r.volume)).toEqual([30,30,30]);expect(p.total).toBe(90);expect(p.rows[10]?.buy).toBe(20);expect(p.rows[10]?.sell).toBe(10);expect(p.step%1).toBe(0);
  });
  it('builds the default 70 percent Value Area outward from POC',()=>{
    const trades=[10,20,40,20,10].map((volume,i)=>({time:0,price:10+i,volume,buy:volume/2}));
    const p=buildProfile([],trades,0,50,1,settings,0,60000);
    expect(p.poc).toBe(12.5);expect(p.val).toBe(11);expect(p.vah).toBe(14);expect(p.area).toBe(80);
  });
  it('uses approximately 60 Auto rows and supports fixed 50 and 100',()=>{
    for(const [rows,count] of [['Auto',60],['50',50],['100',100]] as const){const p=buildProfile([],[],0,600,.01,{...settings,rows},0,60000);expect(p.rows).toHaveLength(count);}
  });
  it('filters volume to the selected time range',()=>{const p=buildProfile([{time:0,low:10,high:10,volume:20,buy:null},{time:60000,low:10,high:10,volume:50,buy:null}],[],0,50,1,settings,60000,120000);expect(p.total).toBe(50);expect(p.split).toBe(false);});
  it('adds live trade volume to its price row and current minute',()=>{const p=buildProfile([], [{time:60000,price:12,volume:4,buy:4},{time:60000,price:12,volume:3,buy:0}],0,50,1,settings,60000,120000);expect(p.rows[12]).toMatchObject({volume:7,buy:4,sell:3});});
  it('clamps Value Area settings to 50–90 and restores all settings',()=>{expect(restoreProfile(JSON.stringify({...settings,valueArea:99})).valueArea).toBe(90);expect(restoreProfile(JSON.stringify({...settings,valueArea:20})).valueArea).toBe(50);expect(restoreProfile(JSON.stringify({...settings,range:'3d',position:'left',split:false,opacity:.8}))).toMatchObject({range:'3d',position:'left',split:false,opacity:.8});});
  it('pages at most three requests and caches by pair and source',async()=>{
    vi.resetModules();const m=await import('@/lib/volume-profile');const now=Date.now();let n=0;
    const fetcher=vi.fn(async()=>{n++;return {ok:true,status:200,json:async()=>[[String(now-n*60000),'10','12','9','11','100','0','0','0','60']]};});vi.stubGlobal('fetch',fetcher);
    await m.loadProfile('binance','BTCUSDT');expect(fetcher).toHaveBeenCalledTimes(3);await m.loadProfile('binance','BTCUSDT');expect(fetcher).toHaveBeenCalledTimes(3);
    await m.loadProfile('binance','ETHUSDT');expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it.each([429,418])('pauses all profile requests for 60 seconds after %i',async(status)=>{
    vi.resetModules();vi.useFakeTimers();const m=await import('@/lib/volume-profile');const fetcher=vi.fn(async()=>({status,ok:false}));vi.stubGlobal('fetch',fetcher);
    await m.loadProfile('bybit','BTCUSDT');await m.loadProfile('binance','ETHUSDT');expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(59999);await m.loadProfile('bybit','DOGEUSDT');expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);await m.loadProfile('bybit','DOGEUSDT');expect(fetcher).toHaveBeenCalledTimes(2);
  });
});