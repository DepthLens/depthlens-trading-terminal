import { describe, it, expect } from 'vitest';
import { pickActive } from '@/lib/landing-clips';
import { initialState, withToolParam } from '@/lib/terminal-state';
describe('landing clips', () => {
  it('runs only the most visible clip', () => { expect(pickActive(new Map([['a', .4], ['b', .9], ['c', .6]]))).toBe('b'); });
  it('runs nothing when no clip is mostly visible', () => { expect(pickActive(new Map([['a', .1]]))).toBeNull(); });
  it('Try it link switches the tool on', () => { expect(withToolParam(initialState(), 'Flow Radar').tools['Flow Radar']).toBe(true); });
  it('ignores unknown tool names', () => { expect(withToolParam(initialState(), 'Nope').tools['Nope']).toBeUndefined(); });
});
