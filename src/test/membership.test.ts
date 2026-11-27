import { describe, expect, it } from 'vitest';
import { isPaid, lockTools, nextEnd, planLabel, expiringSoon, toCsv, type Membership } from '@/lib/membership';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const DAY = 86_400_000;
const m = (p: Partial<Membership>): Membership => ({ plan: 'Free', status: 'active', starts_at: null, ends_at: null, ...p });

describe('membership rules', () => {
  it('Weekly from Free ends 7 days from now', () => {
    expect(nextEnd(m({}), 'Weekly', NOW).getTime()).toBe(NOW + 7 * DAY);
  });
  it('Monthly on top of an active plan adds 30 days after the current end', () => {
    const end = new Date(NOW + 7 * DAY).toISOString();
    expect(nextEnd(m({ plan: 'Weekly', ends_at: end }), 'Monthly', NOW).getTime()).toBe(NOW + 37 * DAY);
  });
  it('an expired plan restarts from now', () => {
    expect(nextEnd(m({ plan: 'Weekly', ends_at: new Date(NOW - DAY).toISOString() }), 15, NOW).getTime()).toBe(NOW + 15 * DAY);
  });
  it('only an active paid plan unlocks tools', () => {
    const future = new Date(NOW + DAY).toISOString();
    expect(isPaid(m({}), NOW)).toBe(false);
    expect(isPaid(m({ plan: 'Monthly', ends_at: future }), NOW)).toBe(true);
    expect(isPaid(m({ plan: 'Monthly', ends_at: future, status: 'suspended' }), NOW)).toBe(false);
    expect(isPaid(m({ plan: 'Monthly', ends_at: new Date(NOW - 1).toISOString() }), NOW)).toBe(false);
  });
  it('warns three days before the end', () => {
    expect(expiringSoon(m({ plan: 'Weekly', ends_at: new Date(NOW + 2 * DAY).toISOString() }), NOW)).toBe(true);
    expect(expiringSoon(m({ plan: 'Weekly', ends_at: new Date(NOW + 5 * DAY).toISOString() }), NOW)).toBe(false);
  });
  it('labels the real plan', () => {
    expect(planLabel(m({}), NOW)).toBe('Free');
    expect(planLabel(m({ plan: 'Monthly', ends_at: '2026-12-26T12:00:00Z' }), NOW)).toBe('Monthly – until 26 Dec 2026');
  });
  it('locked terminal keeps only the Candle timer', () => {
    expect(lockTools({ Heatmap: true, 'Candle timer': true, CVD: true })).toEqual({ Heatmap: false, 'Candle timer': true, CVD: false, 'Control & Attack bars': false });
  });
  it('CSV escapes commas and quotes', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"' }])).toBe('a,b\n"x,y","say ""hi"""');
  });
});
