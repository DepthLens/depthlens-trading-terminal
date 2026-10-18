// Browser-safe heatmap buffer: one order book snapshot column per second, typed arrays, 60 minutes max.
export type TradeSide = 'Buy' | 'Sell';
export type Column = { time: number; origin: number; data: Float32Array; trades: Map<number, { buy: number; sell: number }>; price: number; gap: boolean };
export const COLUMN_MS = 1000;
export const MAX_COLUMNS = 3600; // 60 minutes of one-second columns
export const ROWS = 1024; // buckets per column, centered on the price at sample time

// Pick a 1/2/5 bucket size so roughly `rows` rows cover ±10% around the price.
export function autoBucketSize(price: number, rows = 200): number {
  if (!Number.isFinite(price) || price <= 0) return 1;
  const raw = (price * 0.2) / rows;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

// Dark navy → blue → cyan → white → yellow → orange.
const STOPS: [number, [number, number, number]][] = [
  [0, [13, 20, 40]],
  [0.2, [30, 58, 138]],
  [0.42, [34, 211, 238]],
  [0.62, [245, 245, 245]],
  [0.82, [250, 204, 21]],
  [1, [249, 115, 22]],
];
export function colorFor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]!;
    if (x <= p1) {
      const [p0, c0] = STOPS[i - 1]!;
      const f = (x - p0) / (p1 - p0);
      return [0, 1, 2].map(k => Math.round(c0[k]! + (c1[k]! - c0[k]!) * f)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1]![1];
}

export class HeatmapBuffer {
  readonly bucket: number;
  private cols: Column[] = [];
  private pending = new Map<number, { buy: number; sell: number }>();
  private pendingPrice = NaN;
  constructor(price: number) {
    this.bucket = autoBucketSize(price);
  }
  index(price: number) { return Math.floor(price / this.bucket); }
  trade(price: number, size: number, side: TradeSide | undefined) {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) return;
    const i = this.index(price);
    const t = this.pending.get(i) ?? { buy: 0, sell: 0 };
    const notional = price * size;
    if (side === 'Sell') t.sell += notional; else t.buy += notional;
    this.pending.set(i, t);
    this.pendingPrice = price;
  }
  // Snapshot the book into one column. Sizes are stored as USDT notional (price × size).
  sample(time: number, bids: Map<number, number>, asks: Map<number, number>, price: number, gap = false) {
    const origin = this.index(price) - ROWS / 2;
    const data = new Float32Array(ROWS);
    if (!gap) {
      for (const [p, q] of bids) { const i = this.index(p) - origin; if (i >= 0 && i < ROWS) data[i]! += p * q; }
      for (const [p, q] of asks) { const i = this.index(p) - origin; if (i >= 0 && i < ROWS) data[i]! += p * q; }
    }
    this.cols.push({ time, origin, data, trades: this.pending, price: Number.isFinite(this.pendingPrice) ? this.pendingPrice : price, gap });
    this.pending = new Map();
    this.pendingPrice = NaN;
    if (this.cols.length > MAX_COLUMNS) this.cols.splice(0, this.cols.length - MAX_COLUMNS);
  }
  markGap(time: number, price: number) { this.sample(time, new Map(), new Map(), price, true); }
  get columns(): readonly Column[] { return this.cols; }
  // Liquidity at an absolute bucket index for one column.
  cell(column: Column, bucketIndex: number): number {
    const i = bucketIndex - column.origin;
    return i >= 0 && i < ROWS ? column.data[i]! : 0;
  }
  // Grouped cell: sum of `grouping` adjacent buckets ending at the row's band.
  groupedCell(column: Column, rowTopIndex: number, grouping: number): number {
    let sum = 0;
    for (let g = 0; g < grouping; g++) sum += this.cell(column, rowTopIndex - g);
    return sum;
  }
}
