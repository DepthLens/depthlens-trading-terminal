import { expect, it } from 'vitest';
import { autoMultiple, buildLadder, isWall, median, rowIndex, restoreDomSettings } from '@/lib/dom-ladder';
import { OrderBookManager } from '@/lib/order-book';

it('bids group down and asks group up on a fixed grid', () => {
  expect(rowIndex(100.07, .05, true) * .05).toBeCloseTo(100.05);
  expect(rowIndex(100.07, .05, false) * .05).toBeCloseTo(100.1);
  expect(rowIndex(100.05, .05, true)).toBe(rowIndex(100.05, .05, false));
  const L = buildLadder(new Map([[100.04, 1]]), new Map([[100.06, 2]]), 100.04, 100.06, .05, 3);
  expect(L.bidCoin[0]).toBe(1); expect(L.askCoin[0]).toBe(2); expect(L.bidStart * .05).toBeCloseTo(100); expect(L.askStart * .05).toBeCloseTo(100.1);
});
it('auto row size covers ~0.3% per side and holds within 40%', () => {
  const m = autoMultiple(68000, .1, 25); expect(m).toBe(100);
  expect(autoMultiple(68000 * 1.3, .1, 25, m)).toBe(100);
  expect(autoMultiple(68000 * 3, .1, 25, m)).toBe(250);
});
it('wall threshold is a multiple of the median of non-empty rows', () => {
  const med = median([0, 1, 2, 3, 0]); expect(med).toBe(2);
  expect(isWall(6, med, 3)).toBe(true); expect(isWall(5.9, med, 3)).toBe(false);
  expect(restoreDomSettings('{"wallMultiple":50,"rows":7}')).toMatchObject({ wallMultiple: 10, rows: 25, grouping: 'auto', unit: 'usdt' });
});
it('best prices match the engine and visible sums equal engine levels in range', () => {
  const book = new OrderBookManager();
  const b: [string, string][] = [], a: [string, string][] = [];
  for (let i = 0; i < 300; i++) { b.push([(100 - i * .013).toFixed(3), String(1 + i % 7)]); a.push([(100.01 + i * .017).toFixed(3), String(2 + i % 5)]); }
  book.bids.apply(b); book.asks.apply(a);
  const bb = book.bids.top()!, ba = book.asks.top()!, row = .05, n = 25;
  const L = buildLadder(book.bids.levels, book.asks.levels, bb, ba, row, n);
  expect(L.bidCoin[0]).toBeGreaterThan(0); expect(rowIndex(bb, row, true)).toBe(L.bidStart);
  const lowB = (L.bidStart - n + 1) * row, highA = (L.askStart + n - 1) * row;
  const engB = [...book.bids.levels].filter(([p]) => rowIndex(p, row, true) * row >= lowB - 1e-9).reduce((s, [, q]) => s + q, 0);
  const engA = [...book.asks.levels].filter(([p]) => rowIndex(p, row, false) * row <= highA + 1e-9).reduce((s, [, q]) => s + q, 0);
  const sum = (x: Float64Array) => x.reduce((s, v) => s + v, 0);
  expect(Math.abs(sum(L.bidCoin) - engB) / engB).toBeLessThan(.001);
  expect(Math.abs(sum(L.askCoin) - engA) / engA).toBeLessThan(.001);
});
