import { describe, expect, it } from 'vitest';
import { retentionLine } from '@/lib/heatmap-recorded';
const now = Date.parse('2026-11-26T12:00:00Z');
describe('retention status line', () => {
  it('shows days kept, MB of 400 MB and days that fit', () => {
    expect(retentionLine({ first: '2026-11-20T03:00:00Z', last: '2026-11-26T12:00:00Z', bytes: 210e6, budget: 400e6, perDay: 35e6, oldestRemovedDay: null, warning: null }, now))
      .toBe('History kept: 20 Nov – today (7 days) · Data 210 MB of 400 MB · Approx. 11 days fit at current rate');
  });
  it('adds the oldest removed day only when one was removed', () => {
    expect(retentionLine({ first: '2026-11-20T00:00:00Z', last: null, bytes: 1, budget: 400e6, perDay: null, oldestRemovedDay: '2026-11-19', warning: null }, now)).toContain('Oldest day removed: 19 Nov');
  });
});
