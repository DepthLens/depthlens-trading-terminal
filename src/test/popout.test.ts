import { describe, it, expect } from 'vitest';
import { buildPressureUrl, parsePopoutQuery, shouldPopout, stripPopoutTools, isSyncMessage, POPOUT_TOOLS } from '@/lib/popout';
import { wmInitial, restoreWm, setMode } from '@/lib/window-manager';

describe('Pressure page URL', () => {
  it('opens /pressure with symbol, timeframe and source', () => {
    const url = buildPressureUrl({ symbol: 'ETHUSDT', tf: 15, source: 'bybit' });
    expect(url).toBe('/pressure?symbol=ETHUSDT&tf=15&source=bybit');
    expect(parsePopoutQuery(url.split('?')[1] ?? '')).toEqual({ symbol: 'ETHUSDT', tf: 15, source: 'bybit', follow: true });
  });
  it('defaults source to binance and follow on', () => {
    expect(parsePopoutQuery('symbol=DOGEUSDT&tf=5')).toEqual({ symbol: 'DOGEUSDT', tf: 5, source: 'binance', follow: true });
  });
  it('clamps bad values to safe defaults', () => {
    expect(parsePopoutQuery('symbol=&tf=99999&source=x&follow=0')).toEqual({ symbol: 'BTCUSDT', tf: 1, source: 'binance', follow: false });
    expect(parsePopoutQuery({ symbol: 'btcusdt', tf: 'abc' }).symbol).toBe('BTCUSDT');
  });
});

describe('BroadcastChannel messages', () => {
  it('accepts hello, state, closed and bye', () => {
    expect(isSyncMessage({ type: 'hello', tool: 'Price Pressure' })).toBe(true);
    expect(isSyncMessage({ type: 'state', state: { symbol: 'BTCUSDT', timeframe: 1, source: 'binance', theme: 'navy' } })).toBe(true);
    expect(isSyncMessage({ type: 'closed', tool: 'Price Pressure' })).toBe(true);
    expect(isSyncMessage({ type: 'bye' })).toBe(true);
  });
  it('rejects unknown shapes', () => {
    expect(isSyncMessage(null)).toBe(false);
    expect(isSyncMessage({ type: 'hack' })).toBe(false);
    expect(isSyncMessage('state')).toBe(false);
  });
});

describe('mode and switch rules', () => {
  it('pop-out only on desktop, in popout mode, for supported tools', () => {
    expect(shouldPopout('popout', 'Price Pressure', false)).toBe(true);
    expect(shouldPopout('popout', 'Price Pressure', true)).toBe(false);
    expect(shouldPopout('floating', 'Price Pressure', false)).toBe(false);
    expect(shouldPopout('popout', 'CVD', false)).toBe(false);
  });
  it('popout is the default desktop mode and restores from storage', () => {
    expect(wmInitial().mode).toBe('popout');
    expect(restoreWm(JSON.stringify({ mode: 'popout' }), 1366, 768).mode).toBe('popout');
    expect(setMode(wmInitial(), 'floating').mode).toBe('floating');
  });
  it('pop-out tools never auto-open on page load', () => {
    const tools = { 'Price Pressure': true, CVD: true };
    expect(stripPopoutTools(tools, 'popout')).toEqual({ 'Price Pressure': false, CVD: true });
    expect(stripPopoutTools(tools, 'floating')).toEqual(tools);
    for (const t of POPOUT_TOOLS) expect(stripPopoutTools({ [t]: true }, 'popout')[t]).toBe(false);
  });
});

