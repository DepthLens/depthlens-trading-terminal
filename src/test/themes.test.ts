import { describe, it, expect } from 'vitest';
import { THEME_PRESETS, DEFAULT_THEME, PICKER_THEMES, themeCss } from '@/lib/themes';
import { initialState, restoreState } from '@/lib/terminal-state';

const tok = (id: string, k: string) => THEME_PRESETS.find(p => p.id === id)!.tokens[k];
describe('theme presets', () => {
  it('picker lists exactly the three presets with White & Royal Blue as default', () => {
    expect(THEME_PRESETS.map(p => p.label)).toEqual(['White & Royal Blue', 'Black & White', 'Navy & Pink']);
    expect(DEFAULT_THEME).toBe('royal'); expect(initialState().theme).toBe('royal');
  });
  it('uses the requested background and accent per preset', () => {
    expect([tok('royal', '--t-bg'), tok('royal', '--t-accent'), tok('royal', '--t-accent-fg')]).toEqual(['#FFFFFF', '#2563EB', '#FFFFFF']);
    expect([tok('bw', '--t-bg'), tok('bw', '--t-accent'), tok('bw', '--t-accent-fg')]).toEqual(['#000000', '#FFFFFF', '#000000']);
    expect([tok('navypink', '--t-bg'), tok('navypink', '--t-accent')]).toEqual(['#0F1B3D', '#FF3D8B']);
  });
  it('remembers a picked preset and falls back to the default for unlisted themes', () => {
    const s = initialState();
    for (const id of PICKER_THEMES) expect(restoreState(JSON.stringify({ ...s, theme: id })).theme).toBe(id);
    expect(restoreState(JSON.stringify({ ...s, theme: 'ocean' })).theme).toBe('royal');
  });
  it('emits CSS for every preset', () => { for (const id of PICKER_THEMES) expect(themeCss()).toContain(`[data-theme="${id}"]`); });
});
