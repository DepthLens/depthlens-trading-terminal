import { expect, it, vi } from 'vitest';
vi.mock('@/lib/heatmap-persist', () => ({ loadHeatmapBuffer: vi.fn().mockResolvedValue(null), saveHeatmapBuffer: vi.fn().mockResolvedValue(undefined) }));
import { bookDepthSpan, dropInsaneCalibration } from '@/lib/heatmap-store';
import { HeatmapBuffer } from '@/lib/heatmap-data';

it('fits the band to the nearest levels, ignoring far-away resting orders', () => {
  const bids = [61600, 61500, 61400, 50000], asks = [61610, 61700, 61800, 85500];
  expect(bookDepthSpan(bids, asks, 61605, 3)).toBe(61800 - 61400);
});
it('never fits wider than 2% of price', () => {
  expect(bookDepthSpan([56000], [67000], 61620)).toBeCloseTo(61620 * .02);
});
it('drops a saved calibration wider than 2% so it recalibrates from the live book', () => {
  const entry = { buffer: new HeatmapBuffer(61620, 50), restored: true, calibrated: true, depthSpan: 11000 };
  expect(dropInsaneCalibration(entry, 61620)).toBe(true);
  expect(entry.calibrated).toBe(false);
  const ok = { buffer: new HeatmapBuffer(61620, 5), restored: true, calibrated: true, depthSpan: 750 };
  expect(dropInsaneCalibration(ok, 61620)).toBe(false);
});
