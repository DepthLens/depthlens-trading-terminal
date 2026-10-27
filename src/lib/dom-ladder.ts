// Browser-safe DOM (order book ladder) rules: grouping, auto row size, walls and settings.
export const DOM_KEY = 'depthlens.dom.v1';
export const DOM_GROUPINGS = ['auto', 1, 2, 5, 10, 25, 50, 100] as const;
export type DomGrouping = (typeof DOM_GROUPINGS)[number];
export type DomSettings = { grouping: DomGrouping; rows: 15 | 25 | 40; unit: 'usdt' | 'coin'; cumulative: boolean; walls: boolean; wallMultiple: number; flash: boolean; width: number };
export const DOM_DEFAULT: DomSettings = { grouping: 'auto', rows: 25, unit: 'usdt', cumulative: false, walls: true, wallMultiple: 3, flash: true, width: 280 };
export const clampWidth = (w: number) => Math.min(420, Math.max(220, Math.round(w)));
export function restoreDomSettings(raw: string | null): DomSettings {
  try {
    const d = JSON.parse(raw ?? 'null') ?? {};
    return {
      grouping: DOM_GROUPINGS.includes(d.grouping) ? d.grouping : 'auto',
      rows: [15, 25, 40].includes(d.rows) ? d.rows : 25,
      unit: d.unit === 'coin' ? 'coin' : 'usdt',
      cumulative: d.cumulative === true, walls: d.walls !== false, flash: d.flash !== false,
      wallMultiple: Number.isFinite(d.wallMultiple) ? Math.min(10, Math.max(2, d.wallMultiple)) : 3,
      width: Number.isFinite(d.width) ? clampWidth(d.width) : 280,
    };
  } catch { return { ...DOM_DEFAULT }; }
}
const MULTIPLES = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
/** Auto: rowsPerSide rows cover ~0.3% of price per side; keeps previous unless ideal differs >40%. Returns tick multiple. */
export function autoMultiple(price: number, tick: number, rowsPerSide: number, previous = 0) {
  if (!(price > 0) || !(tick > 0)) return previous || 1;
  const ideal = price * .003 / rowsPerSide / tick;
  if (previous > 0 && Math.abs(ideal / previous - 1) <= .4) return previous;
  let best = 1;
  for (const m of MULTIPLES) if (Math.abs(Math.log(m / ideal)) < Math.abs(Math.log(best / ideal))) best = m;
  return best;
}
const EPS = 1e-9;
/** Row index on a fixed grid: bids group DOWN, asks group UP. */
export const rowIndex = (price: number, row: number, bid: boolean) => bid ? Math.floor(price / row + EPS) : Math.ceil(price / row - EPS);
export type Ladder = { row: number; askStart: number; bidStart: number; asks: Float64Array; bids: Float64Array; askCoin: Float64Array; bidCoin: Float64Array };
/** Groups one side into `count` rows starting at index `start`, going up (asks) or down (bids). Missing rows are 0. */
export function groupSide(levels: Map<number, number>, row: number, start: number, count: number, bid: boolean) {
  const coin = new Float64Array(count), notional = new Float64Array(count);
  for (const [price, size] of levels) {
    const k = bid ? start - rowIndex(price, row, true) : rowIndex(price, row, false) - start;
    if (k < 0 || k >= count) continue;
    coin[k] = (coin[k] ?? 0) + size; notional[k] = (notional[k] ?? 0) + size * price;
  }
  return { coin, notional };
}
export function buildLadder(bids: Map<number, number>, asks: Map<number, number>, bestBid: number, bestAsk: number, row: number, count: number, offset = 0): Ladder {
  const bidStart = rowIndex(bestBid, row, true) + offset, askStart = rowIndex(bestAsk, row, false) + offset;
  const b = groupSide(bids, row, bidStart, count, true), a = groupSide(asks, row, askStart, count, false);
  return { row, askStart, bidStart, asks: a.notional, bids: b.notional, askCoin: a.coin, bidCoin: b.coin };
}
export function median(values: number[]) {
  const v = values.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
export const isWall = (size: number, med: number, multiple: number) => med > 0 && size >= med * multiple;
export const flashes = (previous: number | undefined, next: number) => previous !== undefined && previous > 0 && Math.abs(next - previous) / previous > .5;
/** Demo-only synthetic book; never touches the live engine. */
export function demoBook(price: number, tick: number) {
  const bids = new Map<number, number>(), asks = new Map<number, number>();
  const step = Math.max(tick, price * .00004);
  for (let i = 0; i < 400; i++) {
    const s = .3 + ((i * 37) % 17) / 6 + (i % 23 === 7 ? 25 : 0);
    bids.set(Math.round((price - step * (i + .5)) / tick) * tick, s);
    asks.set(Math.round((price + step * (i + .5)) / tick) * tick, s * (i % 19 === 5 ? 8 : 1));
  }
  return { bids, asks };
}
