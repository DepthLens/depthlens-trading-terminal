import { describe, expect, it } from 'vitest';
import { ROWS, type Column, type HeatTrade } from '@/lib/heatmap-data';
import { bookImbalance, replayAdvance, restoreProSettings, scalePos, scaleRange, sessionProfile } from '@/lib/heatmap-pro';
import { MarkerEngine } from '@/lib/heatmap-markers';
import { AlertGate } from '@/lib/heatmap-alerts';

const B = 1; // bucket
function col(time: number, price: number, book: Record<number, number>, trades: Record<number, Partial<HeatTrade>> = {}): Column {
  const origin = Math.floor(price) - ROWS / 2, data = new Float32Array(ROWS);
  for (const [i, v] of Object.entries(book)) data[Number(i) - origin] = v;
  const m = new Map<number, HeatTrade>(); for (const [i, t] of Object.entries(trades)) m.set(Number(i), { buy: 0, sell: 0, ...t });
  return { time, origin, data, trades: m, price, gap: false };
}

describe('colour scale', () => {
  it('uses percentiles so one huge order does not darken the rest', () => {
    const values = [...Array(999).fill(100), 1e9];
    const { hi } = scaleRange(values, 5, 99.5);
    expect(hi).toBeLessThan(101);
    expect(scalePos(100, 1, hi, 1)).toBeGreaterThan(0.99);
  });
});

describe('order book imbalance', () => {
  it('is +1 with only bids and -1 with only asks within the range', () => {
    expect(bookImbalance(col(0, 1000, { 999: 50 }), B, 0.1)).toBe(1);
    expect(bookImbalance(col(0, 1000, { 1001: 50 }), B, 0.1)).toBe(-1);
  });
});

describe('session volume profile', () => {
  it('only counts trades since 00:00 UTC and finds the POC', () => {
    const day = 86400000 * 100;
    const p = sessionProfile([col(day - 1000, 1000, {}, { 1000: { buy: 999 } }), col(day + 1000, 1000, {}, { 1001: { buy: 10 }, 1002: { sell: 30 } })], B, day + 5000);
    expect(p.poc).toBe(1002);
    expect(p.bins.has(1000)).toBe(false);
  });
});

describe('markers', () => {
  it('marks a wall that loses 70% within 10s far from price with little trading as Pulled', () => {
    const cols: Column[] = [];
    for (let s = 0; s <= 12; s++) cols.push(col(s * 1000, 1000, { 1010: s < 11 ? 1000 : 200 }));
    const e = new MarkerEngine(); e.process(cols, B, 500, { pulled: true, iceberg: false, absorption: false }, 1000);
    expect(e.markers.some(m => m.kind === 'pulled' && m.index === 1010)).toBe(true);
  });
  it('does not mark Pulled when the size was traded away', () => {
    const cols: Column[] = [];
    for (let s = 0; s <= 12; s++) cols.push(col(s * 1000, 1000, { 1010: s < 11 ? 1000 : 200 }, s === 11 ? { 1010: { buy: 800 } } : {}));
    const e = new MarkerEngine(); e.process(cols, B, 500, { pulled: true, iceberg: false, absorption: false }, 1000);
    expect(e.markers.some(m => m.kind === 'pulled')).toBe(false);
  });
  it('marks an Iceberg when 30s traded volume exceeds 2× the refilling visible size', () => {
    const cols: Column[] = [];
    for (let s = 0; s < 31; s++) cols.push(col(s * 1000, 1000, { 1000: 100 }, { 1000: { sell: 10 } }));
    const e = new MarkerEngine(); e.process(cols, B, 1e9, { pulled: false, iceberg: true, absorption: false }, 1000);
    const m = e.markers.find(x => x.kind === 'iceberg');
    expect(m).toBeDefined();
    expect(m!.hidden).toBeGreaterThan(100);
  });
});

describe('alerts', () => {
  it('fires once per key within 5 minutes', () => {
    const g = new AlertGate();
    expect(g.allow('wall:1', 0)).toBe(true);
    expect(g.allow('wall:1', 299000)).toBe(false);
    expect(g.allow('wall:1', 300000)).toBe(true);
  });
});

describe('replay and settings', () => {
  it('20× replay moves 2 seconds per 100ms and stops at the end', () => {
    expect(replayAdvance(0, 100, 20, 10000)).toEqual({ t: 2000, done: false });
    expect(replayAdvance(9000, 100, 20, 10000)).toEqual({ t: 10000, done: true });
  });
  it('Time & Sales is off by default and imbalance range is clamped', () => {
    const s = restoreProSettings(JSON.stringify({ imbPct: 5 }));
    expect(s.tape).toBe(false); expect(s.imbPct).toBe(0.5);
  });
});
