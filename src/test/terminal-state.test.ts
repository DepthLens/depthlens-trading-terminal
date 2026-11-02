import { describe, it, expect } from 'vitest';
import { initialState, openPair, closePair, restoreState, validMinutes, TOOLS } from '@/lib/terminal-state';
import { aggregate, applyTrade } from '@/lib/chart-data';
describe('Terminal rules', () => {
  it('allows at most 10 tabs', () => { let s = initialState(); for (let i = 0; i < 15; i++) s = openPair(s, `PAIR${i}USDT`); expect(s.tabs).toHaveLength(10); expect(openPair(s, 'EXTRAUSDT')).toBe(s); });
  it('activates an already open pair without duplicating it', () => { const s = openPair(openPair(initialState(), 'ETHUSDT'), 'BTCUSDT'); expect(s.tabs).toHaveLength(2); expect(s.active).toBe('BTCUSDT'); });
  it('restores each timeframe, active tab and saved switches', () => { const s = openPair(initialState(), 'ETHUSDT'); s.tabs = [{symbol:'BTCUSDT',minutes:7},{symbol:'ETHUSDT',minutes:45}]; s.tools['Heatmap'] = true; expect(restoreState(JSON.stringify(s))).toEqual(s); });
  it('keeps all tools unlocked and individually switchable', () => { const s = initialState(); for (const t of TOOLS) s.tools[t] = true; expect(Object.values(restoreState(JSON.stringify(s)).tools)).toEqual(Array(9).fill(true)); });
  it('defaults the Candle timer ON including old settings and preserves OFF', () => { expect(initialState().tools['Candle timer']).toBe(true); expect(restoreState(JSON.stringify({tabs:[{symbol:'BTCUSDT',minutes:1}],tools:{}})).tools['Candle timer']).toBe(true); const s=initialState();s.tools['Candle timer']=false;expect(restoreState(JSON.stringify(s)).tools['Candle timer']).toBe(false); });
  it('accepts 7 and 45 minute custom timeframes, rejects invalid values', () => { expect(validMinutes('7')).toBe(7); expect(validMinutes('45')).toBe(45); for (const v of ['0','1441','7.5','7abc']) expect(validMinutes(v)).toBeNull(); });
  it('closing the active tab activates a remaining tab', () => { expect(closePair(openPair(initialState(), 'ETHUSDT'), 'ETHUSDT').active).toBe('BTCUSDT'); });
  it('aggregates 1 minute candles into 7 minute OHLC buckets', () => { const bars = [{ time: 0, open: 10, high: 12, low: 9, close: 11 }, { time: 60000, open: 11, high: 15, low: 8, close: 14 }, { time: 420000, open: 14, high: 16, low: 13, close: 15 }]; expect(aggregate(bars,7)).toEqual([{ time: 0, open:10,high:15,low:8,close:14 },bars[2]]); });
  it('each trade updates close and extremes and opens a new bucket', () => { const b = { time:0,open:10,high:12,low:9,close:11 }; const next = applyTrade(b,60000,8,7); expect(next).toEqual({ ...b,low:8,close:8 }); expect(applyTrade(next,420000,15,7)).toEqual({ time:420000,open:15,high:15,low:15,close:15 }); });
});
