import { describe, expect, it, beforeEach } from 'vitest';
import { defaultPosition, fibPrice, loadDrawings, logicalToTime, measureStats, riskReward, saveDrawings, snapPrice, timeToLogical, type Drawing } from '@/lib/drawing-data';

const times = [0, 60, 120, 180];
describe('drawing anchors', () => {
  it('maps times to bars and back, extrapolating past loaded bars', () => {
    expect(timeToLogical(times, 120, 60)).toBe(2);
    expect(timeToLogical(times, 90, 60)).toBe(1.5);
    expect(timeToLogical(times, 300, 60)).toBe(5);
    expect(timeToLogical(times, -60, 60)).toBe(-1);
    expect(logicalToTime(times, 5, 60)).toBe(300);
    expect(logicalToTime(times, 1.5, 60)).toBe(90);
  });
  it('magnet snaps to the nearest open/high/low/close', () => {
    expect(snapPrice({ open: 100, high: 110, low: 95, close: 105 }, 108.9)).toBe(110);
    expect(snapPrice({ open: 100, high: 110, low: 95, close: 105 }, 97)).toBe(95);
    expect(snapPrice(undefined, 97)).toBe(97);
  });
});

describe('measurements', () => {
  it('measure shows price change, percent and bar count', () => {
    const s = measureStats({ t: 0, p: 100 }, { t: 600, p: 110 }, 1);
    expect(s.delta).toBe(10); expect(s.pct).toBeCloseTo(10); expect(s.bars).toBe(10);
  });
  it('fib 0 sits at the end point and 1 at the start point', () => {
    const a = { t: 0, p: 200 }, b = { t: 60, p: 100 };
    expect(fibPrice(a, b, 0)).toBe(100); expect(fibPrice(a, b, 1)).toBe(200); expect(fibPrice(a, b, 0.5)).toBe(150);
  });
  it('new positions start at 2:1 with the stop on the losing side', () => {
    const long = defaultPosition('long', 100, 110);
    expect(long).toEqual({ target: 110, stop: 95 });
    expect(riskReward(100, long.target, long.stop).ratio).toBe(2);
    expect(defaultPosition('short', 100, 90)).toEqual({ target: 90, stop: 105 });
  });
});

describe('saving', () => {
  beforeEach(() => localStorage.clear());
  it('keeps drawings per pair and drops broken entries', () => {
    const d: Drawing = { id: '1', kind: 'hline', a: { t: 60, p: 100 }, color: '#2962FF' };
    saveDrawings('BTCUSDT', [d]);
    expect(loadDrawings('BTCUSDT')).toEqual([d]);
    expect(loadDrawings('ETHUSDT')).toEqual([]);
    localStorage.setItem('depthlens-drawings-ETHUSDT', JSON.stringify([{ id: 'x', kind: 'trend', a: { t: 1, p: 1 }, color: '#fff' }]));
    expect(loadDrawings('ETHUSDT')).toEqual([]);
  });
});
