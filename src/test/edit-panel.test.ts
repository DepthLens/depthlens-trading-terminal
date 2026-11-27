import { describe, expect, it } from 'vitest';
import { HEATMAP_VIEW_DEFAULT, editTools, resetToDefault } from '@/lib/edit-panel';
import { CVD_DEFAULT } from '@/lib/cvd-data';
import { DOM_DEFAULT } from '@/lib/dom-ladder';
import { FOOTPRINT_DEFAULT } from '@/lib/footprint-data';

describe('Edit menu', () => {
  it('lists only tools that are on, in Order flow order', () => {
    expect(editTools({ Heatmap: true, Footprint: true, CVD: false, 'Control & Attack bars': false })).toEqual(['Heatmap', 'Footprint']);
  });
  it('Control & Attack bars counts as on unless switched off', () => {
    expect(editTools({})).toEqual(['Control & Attack bars']);
  });
  it('never lists the always-on candle countdown or Heatmap sub-switches', () => {
    const ids = editTools({ 'Candle timer': true, 'Wall lines': true, 'Time & Sales': true, 'Control & Attack bars': false });
    expect(ids).toEqual([]);
  });
  it('Reset to default restores every Footprint setting', () => {
    expect(resetToDefault('Footprint', FOOTPRINT_DEFAULT, { ...FOOTPRINT_DEFAULT, mode: 'delta', ratio: 450, unit: 'coin' })).toEqual(FOOTPRINT_DEFAULT);
  });
  it('Reset to default keeps the CVD pane height and DOM width (layout, not settings)', () => {
    expect(resetToDefault('CVD', CVD_DEFAULT, { ...CVD_DEFAULT, mode: 'Candles', height: 0.3 })).toEqual({ ...CVD_DEFAULT, height: 0.3 });
    expect(resetToDefault('DOM', DOM_DEFAULT, { ...DOM_DEFAULT, rows: 40, width: 350 })).toEqual({ ...DOM_DEFAULT, width: 350 });
  });
  it('Heatmap view defaults are the original screen defaults', () => {
    expect(HEATMAP_VIEW_DEFAULT).toEqual({ intensity: 1, windowMin: 15, grouping: 1, minBubble: 10000, bubblesOn: true });
  });
});
