import { describe, expect, it } from 'vitest';
import { clampWin, closeTool, closeWin, dockWin, dragWin, floatWin, focusWin, isFloating, minimizeWin, MIN_H, MIN_W, openWin, resetWins, resizeWin, restoreWin, restoreWm, setMode, wmInitial, type Win } from '@/lib/window-manager';

const base: Win = { x: 100, y: 100, w: 300, h: 200, min: false, max: false, z: 1 };

describe('window manager', () => {
  it('clamps dragging inside the layer', () => {
    expect(dragWin(base, -500, -500, 1000, 600)).toMatchObject({ x: 0, y: 0 });
    expect(dragWin(base, 5000, 5000, 1000, 600)).toMatchObject({ x: 700, y: 400 });
  });
  it('enforces the 260x180 minimum size', () => {
    expect(clampWin({ ...base, w: 10, h: 10 }, 1000, 600)).toMatchObject({ w: MIN_W, h: MIN_H });
    expect(resizeWin(base, 'se', -1000, -1000, 1000, 600)).toMatchObject({ w: 260, h: 180 });
  });
  it('resizes from west and north keeping the opposite edges', () => {
    const r = resizeWin(base, 'nw', -50, -40, 1000, 600);
    expect(r).toMatchObject({ x: 50, y: 60, w: 350, h: 240 });
    const e = resizeWin(base, 'e', 2000, 0, 1000, 600);
    expect(e.x + e.w).toBe(1000);
  });
  it('raises the focused window to the top', () => {
    let s = openWin(openWin(wmInitial(), 'DOM', 1000, 600), 'Heatmap', 1000, 600);
    expect(s.wins.Heatmap!.z).toBeGreaterThan(s.wins.DOM!.z);
    s = focusWin(s, 'DOM');
    expect(s.wins.DOM!.z).toBeGreaterThan(s.wins.Heatmap!.z);
  });
  it('minimizes and restores', () => {
    let s = openWin(wmInitial(), 'DOM', 1000, 600);
    s = minimizeWin(s, 'DOM'); expect(s.wins.DOM!.min).toBe(true);
    s = restoreWin(s, 'DOM'); expect(s.wins.DOM!.min).toBe(false);
  });
  it('close removes the window and turns the tool switch off', () => {
    const s = closeWin(openWin(wmInitial(), 'DOM', 1000, 600), 'DOM');
    expect(s.wins.DOM).toBeUndefined();
    expect(closeTool({ DOM: true, Heatmap: true }, 'DOM')).toEqual({ DOM: false, Heatmap: true });
  });
  it('persists and restores positions, sizes and minimized state', () => {
    const s = minimizeWin(openWin(wmInitial(), 'Heatmap', 1000, 600), 'Heatmap');
    const r = restoreWm(JSON.stringify(s), 1000, 600);
    expect(r.wins.Heatmap).toEqual(s.wins.Heatmap);
    expect(restoreWm('garbage', 1000, 600)).toEqual(wmInitial());
  });
  it('reset clears all windows', () => {
    expect(resetWins(openWin(wmInitial(), 'DOM', 1000, 600)).wins).toEqual({});
  });
  it('docks and floats per tool, and mode applies to all', () => {
    let s = wmInitial();
    expect(isFloating(s, 'DOM')).toBe(true);
    s = dockWin(s, 'DOM'); expect(isFloating(s, 'DOM')).toBe(false); expect(isFloating(s, 'Heatmap')).toBe(true);
    s = floatWin(s, 'DOM'); expect(isFloating(s, 'DOM')).toBe(true);
    s = setMode(s, 'docked'); expect(isFloating(s, 'Heatmap')).toBe(false);
  });
});
