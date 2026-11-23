import { describe, it, expect } from 'vitest';
import { pickActive } from '@/lib/landing-clips';
import { initialState, withToolParam } from '@/lib/terminal-state';
describe('landing clips', () => {
  it('runs only the most visible clip', () => { expect(pickActive(new Map([['a', .4], ['b', .9], ['c', .6]]))).toBe('b'); });
  it('runs nothing when no clip is mostly visible', () => { expect(pickActive(new Map([['a', .1]]))).toBeNull(); });
  it('Try it link switches the tool on', () => { expect(withToolParam(initialState(), 'Flow Radar').tools['Flow Radar']).toBe(true); });
  it('ignores unknown tool names', () => { expect(withToolParam(initialState(), 'Nope').tools['Nope']).toBeUndefined(); });
});
import { makeSeries, barAt, radarMarks, L } from '@/lib/landing-clips';
describe('landing clip data', () => {
  it('series loops seamlessly (last close equals first open)', () => { const s = makeSeries(); expect(Math.abs(s[s.length - 1]!.close - s[0]!.open)).toBeLessThan(0.01); });
  it('bars repeat every loop', () => { expect(barAt(5).close).toBe(barAt(5 + L).close); });
  it('Flow Radar marks come from the real engine, not every turn', () => { const m = radarMarks(); expect(m.setups.size + m.pats.size).toBeGreaterThan(0); expect(m.setups.size + m.pats.size).toBeLessThan(L / 2); });
});
import { bubbleR } from '@/lib/landing-clips';
describe('landing preview bubbles', () => {
  it('typical trades stay small, only the largest reach the max', () => { expect(bubbleR(0.2)).toBeLessThan(2); expect(bubbleR(1)).toBe(6); });
});
