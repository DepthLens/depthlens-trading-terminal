import { describe, it, expect } from 'vitest';
import { buildPopoutUrl, parsePopoutQuery, openPopout, shouldPopout, stripPopoutTools, isSyncMessage, POPOUT_TOOLS, toggleSection, parseSections, pressureButtonActive } from '@/lib/popout';
import { wmInitial, restoreWm, setMode } from '@/lib/window-manager';

describe('popout URL building and parsing', () => {
  it('round-trips symbol, timeframe, source and follow', () => {
    const url = buildPopoutUrl('Price Pressure', { symbol: 'ETHUSDT', tf: 15, source: 'bybit', follow: false, sections: ['pp'] });
    expect(url.startsWith('/popout/pressure?')).toBe(true);
    const q = url.split('?')[1] ?? ''; 
    expect(parsePopoutQuery(q)).toEqual({ symbol: 'ETHUSDT', tf: 15, source: 'bybit', follow: false, sections: ['pp'] });
  });
  it('defaults follow to 1 and source to binance', () => {
    expect(parsePopoutQuery('symbol=DOGEUSDT&tf=5')).toEqual({ symbol: 'DOGEUSDT', tf: 5, source: 'binance', follow: true, sections: ['pp'] });
  });
  it('clamps bad values to safe defaults', () => {
    expect(parsePopoutQuery('symbol=&tf=99999&source=x&follow=0')).toEqual({ symbol: 'BTCUSDT', tf: 1, source: 'binance', follow: false, sections: ['pp'] });
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
    expect(calls[0]?.[1]).toBe('depthlens-pressure');
    expect(calls[0]?.[2]).toContain('popup=yes');
    expect(calls[0]?.[2]).toContain('width=1000');
    expect(calls[0]?.[2]).toContain('height=700');
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

 describe('Pressure sections', () => {
  it('round-trips both sections and preserves an empty selection', () => {
    const url=buildPopoutUrl('Price Pressure',{symbol:'BTCUSDT',tf:1,source:'bybit',follow:true,sections:['pp','ca']});
    expect(parsePopoutQuery(url.split('?')[1] ?? '').sections).toEqual(['pp','ca']);
    expect(parsePopoutQuery('sections=').sections).toEqual([]);
    expect(parseSections('pp,invalid,ca,pp')).toEqual(['pp','ca']);
  });
  it('posts validated toggle messages over a mocked channel', () => {
    const messages: unknown[]=[];
    const channel={postMessage:(m:unknown)=>messages.push(m)};
    const next=toggleSection(['pp'],'ca');
    channel.postMessage({type:'sections',sections:next});
    expect(messages).toEqual([{type:'sections',sections:['pp','ca']}]);
    expect(isSyncMessage(messages[0])).toBe(true);
    expect(isSyncMessage({type:'sections',sections:['invalid']})).toBe(false);
    expect(toggleSection(next,'pp')).toEqual(['ca']);
  });
  it('returns the button to normal on popup close or no selected sections', () => {
    expect(pressureButtonActive(true,['pp'])).toBe(true);
    expect(pressureButtonActive(false,['pp','ca'])).toBe(false);
    expect(pressureButtonActive(true,[])).toBe(false);
  });
});
