import { describe, it, expect } from 'vitest';
import { buildProfile, periodRange, PROFILE_DEFAULT, restoreProfile } from '@/lib/volume-profile';
import { addTailTrade, clearTail, coverageNote, nakedPocs, profileBin, profilePages, tailAfter } from '@/lib/volume-profile-recorded';

const H = 3600000, D = 86400000, day = Date.UTC(2026, 10, 26);
const s = (range: typeof PROFILE_DEFAULT.range) => ({ ...PROFILE_DEFAULT, range });

describe('Recorded Volume Profile (BTCUSDT)', () => {
  it('builds buy/sell split rows with POC, VAH and VAL from recorded levels', () => {
    const levels: [number, number, number][] = [[100, 1, 1], [101, 6, 2], [102, 30, 10], [103, 5, 3], [104, 1, 1]];
    const p = buildProfile([], levels.map(([price, buy, sell]) => ({ time: 0, price, volume: buy + sell, buy })), 95, 110, 1, { ...PROFILE_DEFAULT, rows: '50' }, 0, 1);
    const poc = p.rows.find(r => r.low === 102);
    expect(poc).toMatchObject({ volume: 40, buy: 30, sell: 10 });
    expect(p.poc).toBe(102.5); expect(p.val).toBe(101); expect(p.vah).toBe(103); expect(p.total).toBe(60);
  });
  it('uses the Asia, London and New York UTC session windows', () => {
    const now = day + 22 * H;
    expect(periodRange(s('Asia'), now)).toEqual({ from: day, to: day + 9 * H });
    expect(periodRange(s('London'), now)).toEqual({ from: day + 7 * H, to: day + 16 * H });
    expect(periodRange(s('New York'), now)).toEqual({ from: day + 12 * H, to: day + 21 * H });
    expect(periodRange(s('New York'), day + 5 * H)).toEqual({ from: day - D + 12 * H, to: day - D + 21 * H });
    expect(periodRange(s('Today'), day + 5 * H)).toEqual({ from: day, to: day + 5 * H });
    expect(periodRange(s('Yesterday'), day + 5 * H)).toEqual({ from: day - D, to: day });
    expect(periodRange(s('1h'), day + 5 * H)).toEqual({ from: day + 4 * H, to: day + 5 * H });
  });
  it('labels periods before recording and partially recorded periods honestly', () => {
    expect(coverageNote({ levels: [], first: null }, day)).toBe('No recorded trades for this period');
    expect(coverageNote({ levels: [[1, 1, 0]], first: day + 10 * H + 16 * 60000 }, day)).toBe('Partial: recorded from 2026-11-26 10:16 UTC');
    expect(coverageNote({ levels: [[1, 1, 0]], first: day + 5000 }, day)).toBe('');
  });
  it('adds only live trades at or after the recorded cutoff, so nothing is counted twice', () => {
    clearTail();
    const now = Date.now();
    for (const t of [now - 3000, now - 2000, now - 1000]) addTailTrade({ time: t, price: 100, size: 1, buy: 1 });
    expect(tailAfter(now - 2000, now + 1).map(t => t.time)).toEqual([now - 2000, now - 1000]);
    clearTail();
  });
  it('splits a period into cached whole-hour pages plus exact edges and picks a fine price bin', () => {
    expect(profilePages(day + 30 * 60000, day + 3 * H + 60000).map(p => [p.from - day, p.to - day, p.page])).toEqual([[30 * 60000, H, false], [H, 2 * H, true], [2 * H, 3 * H, true], [3 * H, 3 * H + 60000, false]]);
    expect(profileBin(5, .1)).toBe(1); expect(profileBin(.3, .1)).toBe(.1);
  });
  it('keeps a previous day POC naked until a later traded range reaches it', () => {
    const days = [{ day, levels: [[100, 5, 5], [110, 1, 1]] as [number, number, number][] }];
    expect(nakedPocs(days, [[{ low: 102, high: 108 }]], 1)).toEqual([{ day, price: 100 }]);
    expect(nakedPocs(days, [[{ low: 99, high: 101 }]], 1)).toEqual([]);
  });
  it('restores the new period, custom, delta and naked settings', () => {
    const r = restoreProfile(JSON.stringify({ range: 'London', customFrom: '2026-11-25T00:00:00.000Z', customTo: 'bad', delta: true, naked: true }));
    expect(r).toMatchObject({ range: 'London', customFrom: '2026-11-25T00:00:00.000Z', customTo: '', delta: true, naked: true });
    expect(restoreProfile(JSON.stringify({ range: 'nope' })).range).toBe('Visible');
  });
});
