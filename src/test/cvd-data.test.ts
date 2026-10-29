import { describe, expect, it } from 'vitest';
import { aggregateDeltas, anchorBucket, binanceDelta, buildCvd, CVD_DEFAULT, CVD_PAGE_LIMIT, CVD_PAGE_SIZE, cvdPaneHeight, deltaBar, formatCvd, klineDelta, restoreCvd } from '@/lib/cvd-data';

describe('CVD exact exchange and pane rules',()=>{
  it('closed Binance quote delta equals twice takerBuyQuote minus quoteVolume',()=>{
    expect(binanceDelta([0,0,0,0,0,10,0,1000,0,7,700])).toMatchObject({quote:400,coin:4});
  });
  it('one-minute delta sum matches the own-timeframe candle within 0.01 percent',()=>{
    const minutes=[600,450,700,550,800].map((buy,i)=>binanceDelta([i*60000,0,0,0,0,10,0,1000,0,buy/100,buy]));
    const bars=minutes.filter((b):b is NonNullable<typeof b>=>b!==null);
    const candle=binanceDelta([0,0,0,0,0,50,0,5000,0,31,3100]);
    if(!candle)throw new Error('Missing candle');
    const aggregated=aggregateDeltas(bars,5)[0];
    expect(Math.abs((aggregated?.quote??NaN)-candle.quote)/Math.abs(candle.quote)).toBeLessThanOrEqual(.0001);
    expect(aggregated?.quote).toBe(1200);
  });
  it('WebSocket Q and V are absolute totals, not extra trades',()=>{
    expect(klineDelta({t:0,v:10,q:1000,V:7,Q:700})?.quote).toBe(400);
    expect(klineDelta({t:0,v:12,q:1200,V:8,Q:800})?.quote).toBe(400);
  });
  it('Daily UTC resets at midnight by default',()=>{
    expect(CVD_DEFAULT.anchor).toBe('Daily UTC');
    expect(buildCvd([deltaBar(86340000,10,1),deltaBar(86400000,-3,-.3)],'Daily UTC','USDT').map(b=>[b.open,b.close,b.reset])).toEqual([[0,10,true],[0,-3,true]]);
  });
  it('Weekly resets on Monday UTC, not Sunday',()=>{
    expect(anchorBucket(Date.UTC(2026,9,25),'Weekly')).toBe(anchorBucket(Date.UTC(2026,9,24),'Weekly'));
    expect(anchorBucket(Date.UTC(2026,9,26),'Weekly')).toBe(anchorBucket(Date.UTC(2026,9,25),'Weekly')+1);
  });
  it('Visible start excludes earlier deltas and Continuous retains them',()=>{
    const data=[deltaBar(0,10,1),deltaBar(60000,20,2)];
    expect(buildCvd(data,'Visible start','USDT',60000)[0]?.close).toBe(20);
    expect(buildCvd(data,'Continuous','USDT').at(-1)?.close).toBe(30);
  });
  it('coin units use base taker delta',()=>{
    expect(buildCvd([deltaBar(0,400,4)],'Continuous','coin')[0]?.close).toBe(4);
  });
  it('minute paths retain intra-candle running-total extrema',()=>{
    const b=aggregateDeltas([deltaBar(0,10,1),deltaBar(60000,-20,-2),deltaBar(120000,15,1.5)],5)[0];
    expect(b).toMatchObject({quote:5,quoteHigh:10,quoteLow:-10,path:true});
  });
  it('history is capped at six pages of 1500',()=>{expect(CVD_PAGE_LIMIT).toBe(6);expect(CVD_PAGE_SIZE).toBe(1500);});
  it('pane defaults are 22 percent desktop and 25 percent mobile, minimum 90px',()=>{
    expect(cvdPaneHeight(1000,false,null)).toBe(220);expect(cvdPaneHeight(1000,true,null)).toBe(250);expect(cvdPaneHeight(300,false,null)).toBe(90);
  });
  it('saved settings validate modes and reset pane size',()=>{
    expect(restoreCvd('{"mode":"Candles","unit":"coin","height":0.4}')).toMatchObject({mode:'Candles',unit:'coin',height:.4});
    expect(restoreCvd('broken')).toEqual(CVD_DEFAULT);
  });
  it('signed axes abbreviate K and M',()=>{expect(formatCvd(1200)).toBe('+1.2K');expect(formatCvd(-2500000)).toBe('−2.5M');});
});