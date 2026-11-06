import { describe, it, expect } from 'vitest';
import { buildPopoutUrl, parsePopoutQuery, openPopout, shouldPopout, stripPopoutTools, isSyncMessage, POPOUT_TOOLS } from '@/lib/popout';
import { wmInitial, restoreWm, setMode } from '@/lib/window-manager';

describe('popout URL building and parsing', () => {
  it('round-trips symbol, timeframe, source and follow', () => {
    const url = buildPopoutUrl('Price Pressure', { symbol: 'ETHUSDT', tf: 15, source: 'bybit', follow: false });
    expect(url.startsWith('/popout/price-pressure?')).toBe(true);
    const q = url.split('?')[1]!;
    expect(parsePopoutQuery(q)).toEqual({ symbol: 'ETHUSDT', tf: 15, source: 'bybit', follow: false });
  });
  it('defaults follow to 1 and source to binance', () => {
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

describe('popup lifecycle', () => {
  it('opens with the popup name, features and URL, and focuses it', () => {
    const calls: [string, string, string][] = [];
    const fake = { focus: () => {} } as unknown as Window;
    const w = openPopout('Price Pressure', { symbol: 'BTCUSDT', tf: 1, source: 'binance', follow: true }, (u, n, f) => { calls.push([u, n, f]); return fake; });
    expect(w).toBe(fake);
    expect(calls[0]![1]).toBe('depthlens-price-pressure');
    expect(calls[0]![2]).toContain('popup=yes');
    expect(calls[0]![2]).toContain('width=900');
    expect(calls[0]![2]).toContain('height=520');
  });
  it('returns null when the popup is blocked so the caller can fall back to floating', () => {
    expect(openPopout('Price Pressure', { symbol: 'BTCUSDT', tf: 1, source: 'binance', follow: true }, () => null)).toBeNull();
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
