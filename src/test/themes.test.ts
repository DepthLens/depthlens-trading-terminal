import { describe, it, expect } from 'vitest';
import { THEME_PRESETS, DEFAULT_THEME, PICKER_THEMES, themeCss } from '@/lib/themes';
import { initialState, restoreState } from '@/lib/terminal-state';

const tok = (id: string, k: string) => THEME_PRESETS.find(p => p.id === id)!.tokens[k];
describe('theme presets', () => {
  it('picker lists exactly the four presets with Black & Gold as default', () => {
    expect(THEME_PRESETS.map(p => p.label)).toEqual(['Black & Gold', 'White & Royal Blue', 'Black & White', 'Navy & Pink']);
    expect(DEFAULT_THEME).toBe('gold'); expect(initialState().theme).toBe('gold');
    expect([tok('gold', '--t-bg'), tok('gold', '--t-accent'), tok('gold', '--t-text')]).toEqual(['#0B0F14', '#F5B83D', '#E6EDF3']);
  });
  it('uses the requested background and accent per preset', () => {
    expect([tok('royal', '--t-bg'), tok('royal', '--t-accent'), tok('royal', '--t-accent-fg')]).toEqual(['#FFFFFF', '#2563EB', '#FFFFFF']);
    expect([tok('bw', '--t-bg'), tok('bw', '--t-accent'), tok('bw', '--t-accent-fg')]).toEqual(['#000000', '#FFFFFF', '#000000']);
    expect([tok('navypink', '--t-bg'), tok('navypink', '--t-accent')]).toEqual(['#0F1B3D', '#FF3D8B']);
  });
  it('remembers a picked preset and falls back to the default for unlisted themes', () => {
    const s = initialState();
    for (const id of PICKER_THEMES) expect(restoreState(JSON.stringify({ ...s, theme: id })).theme).toBe(id);
    expect(restoreState(JSON.stringify({ ...s, theme: 'ocean' })).theme).toBe('gold');
  });
  it('emits CSS for every preset', () => { for (const id of PICKER_THEMES) expect(themeCss()).toContain(`[data-theme="${id}"]`); });
});
