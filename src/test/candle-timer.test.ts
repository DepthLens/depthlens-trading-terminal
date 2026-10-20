import { describe, it, expect } from 'vitest';
import { candleCountdown } from '@/lib/candle-timer';
import { aggregate } from '@/lib/chart-data';
import { updateProfileRows, type ProfileRow } from '@/lib/volume-profile';

describe('candle countdown',()=>{
  it('counts down a UTC 1m candle and resets without zero at close',()=>{
    expect(candleCountdown(59000,1).text).toBe('00:01');
    expect(candleCountdown(59999,1).seconds).toBe(1);
    expect(candleCountdown(60000,1).text).toBe('01:00');
  });
  it('uses UTC five-minute boundaries',()=>{
    expect(candleCountdown(180000,5).text).toBe('02:00');
    expect(candleCountdown(300000,5).text).toBe('05:00');
  });
  it('formats hour-plus remaining time as hh:mm:ss',()=>{
    expect(candleCountdown(0,60).text).toBe('01:00:00');
    expect(candleCountdown(1000,60).text).toBe('59:59');
    expect(candleCountdown(0,240).text).toBe('04:00:00');
  });
  it('uses the same custom-minute bucketing as chart candles',()=>{
    const now=Date.UTC(2026,9,20,10,3,22);
    const bar=aggregate([{time:now,open:1,high:1,low:1,close:1}],7)[0];
    expect(candleCountdown(now,7).closeAt).toBe((bar?.time??0)+420000);
    expect(candleCountdown(419000,7).text).toBe('00:01');
    expect(candleCountdown(420000,7).text).toBe('07:00');
  });
  it('applies the midpoint-derived exchange offset',()=>{
    expect(candleCountdown(58000,1,1000).text).toBe('00:01');
    expect(candleCountdown(60000,1,-1000).text).toBe('00:01');
  });
});
it('adds live volume once without moving anchored bins or value area',()=>{
  const rows:ProfileRow[]=[{low:100,high:101,volume:10,buy:4,sell:6,inArea:true}];
  const seen=new Map<string,{volume:number;buy:number}>();
  const trade={time:60000,price:100.5,volume:2,buy:2};
  expect(updateProfileRows(rows,[trade],seen,0,120000)).toBe(2);
  expect(updateProfileRows(rows,[trade],seen,0,120000)).toBe(0);
  expect(updateProfileRows(rows,[{...trade,volume:5,buy:3}],seen,0,120000)).toBe(3);
  expect(rows[0]).toEqual({low:100,high:101,volume:15,buy:7,sell:8,inArea:true});
});