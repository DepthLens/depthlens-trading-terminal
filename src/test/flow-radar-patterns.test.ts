import { describe, expect, it } from 'vitest';
import { DEFAULT_PATTERNS, patternLayer, restorePatternSettings } from '@/lib/flow-radar-pattern-layer';
import { isAtlasTimeframe } from '@/lib/flow-radar-patterns';
import { RADAR_DEFAULT, findSetups, scoreSetups, type RadarBar } from '@/lib/flow-radar';

const bars: RadarBar[] = Array.from({ length: 90 }, (_, i) => ({ time: i * 900000, open: 100, high: 101, low: 99, close: 100, volume: 10, takerBuy: 5 }));
bars[65] = { time: 65 * 900000, open: 100, high: 102, low: 98, close: 98.5, volume: 30, takerBuy: 3 };
const have = new Set(bars.map(b => b.time / 1000)), colors = { up: 'green', down: 'red' };
describe('Short-TF Patterns add-on', () => {
  it('defaults off with the four requested patterns and restores saved selection', () => {
    expect(restorePatternSettings({})).toEqual({ patternsOn: false, patterns: ['R_reversal_watch', 'X2_upthrust_spring', 'B_prevday_sweep', 'X3_div_volume'] });
    expect(restorePatternSettings({ patternsOn: true, patterns: ['R_reversal_watch', 'invalid'] })).toEqual({ patternsOn: true, patterns: ['R_reversal_watch'] });
    expect(restorePatternSettings({ patterns: [] }).patterns).toEqual([]);
  });
  it('off adds no markers and leaves setups and scoreboard unchanged', () => {
    const before = findSetups(bars, RADAR_DEFAULT), score = scoreSetups(before, 'momentum', RADAR_DEFAULT, 89 * 900000);
    expect(patternLayer(bars, '1h', { patternsOn: false, patterns: DEFAULT_PATTERNS }, 15, have, colors).markers).toEqual([]);
    expect(findSetups(bars, { ...RADAR_DEFAULT, ...restorePatternSettings({}) })).toEqual(before);
    expect(scoreSetups(before, 'momentum', RADAR_DEFAULT, 89 * 900000)).toEqual(score);
  });
  it('15m markers are price/time anchored with describeEvent measured hover lines', () => {
    const layer = patternLayer(bars, '15m', { patternsOn: true, patterns: DEFAULT_PATTERNS }, 15, have, colors);
    expect(layer.markers.length).toBeGreaterThan(0);
    const marker = layer.markers.find(m => m.time === 65 * 900);
    expect(marker).toMatchObject({ shape: 'circle', text: 'Watch', color: 'red', price: 102, position: 'atPriceTop' });
    expect([...layer.details.values()].some(lines => lines.some(l => /Seen .*×\/month on 15m/.test(l)))).toBe(true);
  });
  it('supports only 1m, 5m, 15m, 30m, 1h, 4h and adds nothing on 2h', () => {
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h']) expect(isAtlasTimeframe(tf)).toBe(true);
    expect(isAtlasTimeframe('2h')).toBe(false);
    expect(patternLayer(bars, '2h', { patternsOn: true, patterns: DEFAULT_PATTERNS }, 120, have, colors).markers).toEqual([]);
    expect(patternLayer(bars, '15m', { patternsOn: true, patterns: DEFAULT_PATTERNS }, 15, new Set(), colors).markers).toEqual([]);
  });
});