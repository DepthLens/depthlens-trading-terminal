import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('repeated Binance live snapshots replace delta without double counting trades',async()=>{
  const {addCvdKline,cvdData}=await import('@/lib/cvd-store');
  addCvdKline('TESTUSDT',5,{k:{t:0,v:10,q:1000,V:7,Q:700}});
  addCvdKline('TESTUSDT',5,{k:{t:0,v:10,q:1000,V:7,Q:700}});
  expect(cvdData('binance','TESTUSDT',5).bars[0]?.quote).toBe(400);
});
it('Bybit processes every Buy and Sell and deduplicates recent/live execution ids',async()=>{
  const now=Date.now(), {addCvdTrade,loadBybitCvd,cvdData}=await import('@/lib/cvd-store');
  addCvdTrade('TESTUSDT',{time:now,price:100,size:3,side:'Buy',exchange:'bybit',source:'trade',direction:0,tradeId:'a'});
  addCvdTrade('TESTUSDT',{time:now+1,price:100,size:1,side:'Sell',exchange:'bybit',source:'trade',direction:0,tradeId:'b'});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({retCode:0,result:{list:[{execId:'a',time:now,price:'100',size:'3',side:'Buy'}]}})}));
  await loadBybitCvd('TESTUSDT');
  expect(cvdData('bybit','TESTUSDT',1).bars.reduce((s,b)=>s+b.quote,0)).toBe(200);
  expect(cvdData('bybit','TESTUSDT',1).bars.reduce((s,b)=>s+b.coin,0)).toBe(2);
});
it('Binance visible paging never exceeds six cached 1500-candle requests',async()=>{
  const fetcher=vi.fn().mockImplementation(async(url:string)=>{
    const end=Number(new URL(url).searchParams.get('endTime')??900000000);
    return {ok:true,json:async()=>Array.from({length:1500},(_,i)=>[end-(1499-i)*60000,0,0,0,0,1,0,100,0,.7,70])};
  });vi.stubGlobal('fetch',fetcher);
  const {loadBinanceCvd}=await import('@/lib/cvd-store');
  await loadBinanceCvd('TESTUSDT',1,-Infinity);await loadBinanceCvd('TESTUSDT',1,-Infinity);
  expect(fetcher).toHaveBeenCalledTimes(6);
  for(const [url]of fetcher.mock.calls)expect(new URL(url).searchParams.get('limit')).toBe('1500');
});
it('Custom candles aggregate exact one-minute deltas',async()=>{
  const {addCvdKline,cvdData}=await import('@/lib/cvd-store');
  for(let i=0;i<7;i++)addCvdKline('TESTUSDT',7,{k:{t:i*60000,v:10,q:1000,V:7,Q:700}});
  expect(cvdData('binance','TESTUSDT',7).bars[0]).toMatchObject({quote:2800,coin:28});
});