import { describe, expect, it } from 'vitest';
import { scalePos } from '@/lib/heatmap-pro';
import { colorFor } from '@/lib/heatmap-data';

const lo = 10_000, hi = 5_000_000;
describe('heatmap colour scale', () => {
  it('keeps ordinary depth (200k USDT) dark blue', () => {
    const [r, g, b] = colorFor(scalePos(200_000, lo, hi, 1));
    expect(scalePos(200_000, lo, hi, 1)).toBeLessThan(0.3);
    expect(b).toBeGreaterThan(r); expect(b).toBeGreaterThan(g);
  });
  it('lets the largest wall reach the brightest colour', () => {
    expect(scalePos(hi, lo, hi, 1)).toBe(1);
    expect(scalePos(hi, lo, hi, 1)).toBeGreaterThan(scalePos(1_500_000, lo, hi, 1));
  });
  it('contrast slider brightens and darkens smoothly', () => {
    const v = 800_000;
    expect(scalePos(v, lo, hi, 2)).toBeGreaterThan(scalePos(v, lo, hi, 1));
    expect(scalePos(v, lo, hi, 0.5)).toBeLessThan(scalePos(v, lo, hi, 1));
  });
  it('empty levels stay at zero', () => { expect(scalePos(0, lo, hi, 1)).toBe(0); });
});
