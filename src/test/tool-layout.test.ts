import { describe, expect, it, vi } from 'vitest';
import { depthRowSize, profileRowSize, heatColumnWidth, heatFitRows, heatMaxRows, shouldFitFootprint, emptyFootprintColumn } from '@/lib/tool-layout';
import { HeatmapBuffer } from '@/lib/heatmap-data';
import { applyProfileDelta, buildProfile, PROFILE_DEFAULT, subscribeProfileTrades, addProfileTrade } from '@/lib/volume-profile';
import { toolDemoEnabled } from '@/lib/tool-demo';

describe('Depth and layout rules', () => {
  it('BTC depth uses thin tick-aligned rows, not a price-percent bucket', () => {
    expect(depthRowSize(300,.1)).toBe(2);
    expect(depthRowSize(.003,.00001)).toBeCloseTo(.00002);
    expect(depthRowSize(.001,.01)).toBe(.01);
  });
  it('restores saved bucket independently of current price', () => {
    const buffer=new HeatmapBuffer(68000,2);
    buffer.sample(1000,new Map([[67998,2]]),new Map(),68000);
    const restored=new HeatmapBuffer(73000);restored.configureBucket(buffer.bucket);restored.merge([...buffer.columns]);
    const col=restored.columns[0];if(!col)throw new Error('Missing restored column');
    expect(restored.bucket).toBe(2);expect(restored.cell(col,restored.index(67998))).toBe(135996);
  });
  it('profile nice tick size holds within forty percent ideal changes', () => {
    expect(profileRowSize(600,.1,60)).toBe(10);
    expect(profileRowSize(840,.1,60,10)).toBe(10);
    expect(profileRowSize(846,.1,60,10)).toBe(20);
  });
  it('calibration preserves pending notional in the new grid',()=>{
    const buffer=new HeatmapBuffer(68000,50);buffer.trade(68010,2,'Buy');buffer.configureBucket(2);buffer.sample(1000,new Map(),new Map(),68010);
    const col=buffer.columns[0];if(!col)throw new Error('Missing column');expect([...col.trades.values()].reduce((sum,t)=>sum+t.buy,0)).toBe(136020);
    expect([...col.trades.keys()]).toEqual([34012]);
  });
  it('centers on depth times 1.15 and caps zoom at ten percent total', () => {
    expect(heatFitRows(300,2,1)).toBeCloseTo(172.5);
    expect(heatFitRows(300,2,10)).toBe(20);
    expect(heatMaxRows(68000,2,1)).toBe(3400);
  });
  it('columns are between three and twelve pixels', () => {
    expect(heatColumnWidth(1000,240)).toBeCloseTo(1000/240);
    expect(heatColumnWidth(1000,3600)).toBe(3);expect(heatColumnWidth(2000,2)).toBe(12);
  });
  it('fit runs on enable or timeframe, not rerender or zoom', () => {
    expect(shouldFitFootprint(null,true,1)).toBe(true);
    expect(shouldFitFootprint({enabled:true,minutes:1},true,1)).toBe(false);
    expect(shouldFitFootprint({enabled:true,minutes:1},true,5)).toBe(true);
    expect(shouldFitFootprint({enabled:false,minutes:1},true,1)).toBe(true);
    expect(shouldFitFootprint({enabled:true,minutes:1},false,1)).toBe(false);
  });
  it('empty detailed footprint columns keep the grid, narrow ones use candles', () => {
    expect(emptyFootprintColumn(110,false)).toBe(true);expect(emptyFootprintColumn(69,false)).toBe(false);expect(emptyFootprintColumn(110,true)).toBe(false);
  });
  it('applies only each new profile delta directly to its price row', () => {
    const p=buildProfile([],[],0,60,1,PROFILE_DEFAULT,0,60000);
    const stop=subscribeProfileTrades('bybit','TESTUSDT',t=>applyProfileDelta(p.rows,t,0,60000));
    addProfileTrade('TESTUSDT',{time:1000,price:12,size:4,side:'Buy',source:'trade',exchange:'bybit',direction:0});
    addProfileTrade('TESTUSDT',{time:1001,price:12,size:3,side:'Sell',source:'trade',exchange:'bybit',direction:0});
    stop();expect(p.rows[12]).toMatchObject({volume:7,buy:4,sell:3});
    expect(applyProfileDelta(p.rows,{time:120000,price:12,volume:8,buy:8},0,60000)).toBe(0);
  });
  it('synthetic fixtures require exactly demo=1', () => {
    vi.stubGlobal('window',{location:{search:''}});expect(toolDemoEnabled()).toBe(false);
    vi.stubGlobal('window',{location:{search:'?demo=0'}});expect(toolDemoEnabled()).toBe(false);
    vi.stubGlobal('window',{location:{search:'?demo=1'}});expect(toolDemoEnabled()).toBe(true);vi.unstubAllGlobals();
  });
});