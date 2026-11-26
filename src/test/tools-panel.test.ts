import { describe, expect, it } from 'vitest';
import { TOOL_GROUPS, allToolsOff, filterGroups } from '@/lib/tools-panel';
import { LONG_WINDOWS } from '@/lib/heatmap-recorded';

describe('tools panel', () => {
  it('groups tools in the requested order', () => {
    expect(TOOL_GROUPS.map(g => g.title)).toEqual(['Chart', 'Order book', 'Trades & delta', 'Pressure & flow', 'Derivatives', 'Setups']);
  });
  it('search filters tools by name', () => {
    expect(filterGroups('cvd').flatMap(g => g.rows.map(r => r.id))).toEqual(['CVD']);
  });
  it('turn all off switches Control & Attack bars off explicitly', () => {
    const next = allToolsOff({ Heatmap: true });
    expect(next['Heatmap']).toBe(false);
    expect(next['Control & Attack bars']).toBe(false);
  });
  it('heatmap long windows are 4h only (24h and 7d removed)', () => {
    expect([...LONG_WINDOWS]).toEqual([240]);
  });
});
