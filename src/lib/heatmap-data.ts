// Browser-safe heatmap buffer: one order book snapshot column per second, typed arrays, 60 minutes max.
export type TradeSide = 'Buy' | 'Sell';
export type HeatTrade = { buy: number; sell: number; count?: number; price?: number; buyCoin?: number; sellCoin?: number };
export type Column = { time: number; origin: number; data: Float32Array; trades: Map<number, HeatTrade>; price: number; gap: boolean; priceOnly?: boolean; empty?: boolean; pricePath?: number[]; recorded?: boolean };
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

// Near-black navy → dark blue → blue → cyan → green → yellow → orange → red → near-white (biggest walls).
const STOPS: [number, [number, number, number]][] = [
  [0, [6, 10, 26]],
  [0.15, [10, 22, 65]],
  [0.28, [20, 55, 150]],
  [0.4, [20, 190, 225]],
  [0.54, [35, 205, 85]],
  [0.68, [245, 225, 40]],
  [0.82, [250, 140, 30]],
  [0.92, [235, 45, 35]],
  [1, [255, 245, 235]],
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
  bucket: number;
  private cols: Column[] = [];
  private pending = new Map<number, HeatTrade>();
  private pendingPrice = NaN;
  constructor(price: number, bucket = autoBucketSize(price)) {
    this.bucket = bucket;
  }
  configureBucket(bucket: number) {
    if (!(bucket > 0) || bucket === this.bucket) return;
    const old = this.bucket;
    const rebin=(values:Map<number,HeatTrade>)=>{
      const result=new Map<number,HeatTrade>();
      for(const [index,t] of values){const key=Math.floor((index+.5)*old/bucket),target=result.get(key)??{buy:0,sell:0}; const total=target.buy+target.sell+t.buy+t.sell; target.price=total>0?((target.price??(key+.5)*bucket)*(target.buy+target.sell)+(t.price??(index+.5)*old)*(t.buy+t.sell))/total:(key+.5)*bucket;target.buy+=t.buy;target.sell+=t.sell;target.count=(target.count??0)+(t.count??0);target.buyCoin=(target.buyCoin??0)+(t.buyCoin??t.buy/(t.price??(index+.5)*old));target.sellCoin=(target.sellCoin??0)+(t.sellCoin??t.sell/(t.price??(index+.5)*old));result.set(key,target);}
      return result;
    };
    this.pending=rebin(this.pending);
    for (const col of this.cols) {
      const origin=Math.floor(col.price/bucket)-ROWS/2,data=new Float32Array(col.data.length?ROWS:0);
      for(let i=0;i<col.data.length;i++){const value=col.data[i]??0,target=Math.floor((col.origin+i+.5)*old/bucket)-origin;if(target>=0&&target<data.length)data[target]=(data[target]??0)+value;}
      col.trades=rebin(col.trades);col.origin=origin;col.data=data;
    }
    this.bucket = bucket;
  }
  // Drop every column (used only when a broken saved row size is recalibrated).
  clear() { this.cols = []; this.pending = new Map(); this.pendingPrice = NaN; }
  index(price: number) { return Math.floor(price / this.bucket); }
  trade(price: number, size: number, side: TradeSide | undefined, count = 1) {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) return;
    const i = this.index(price);
    const t = this.pending.get(i) ?? { buy: 0, sell: 0 };
    const notional = price * size;
    const total = t.buy + t.sell;
    t.price = ((t.price ?? price) * total + price * notional) / (total + notional);
    t.count = (t.count ?? 0) + count;
    if (side === 'Sell') { t.sell += notional; t.sellCoin = (t.sellCoin ?? 0) + size; }
    else { t.buy += notional; t.buyCoin = (t.buyCoin ?? 0) + size; }
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
  // Add a price/trades-only history column (backfill); never any book colors.
  priceColumn(time: number, price: number, trades: Map<number, { buy: number; sell: number }>) {
    const origin = this.index(price) - ROWS / 2;
    this.cols.push({ time, origin, data: new Float32Array(ROWS), trades, price, gap: false, priceOnly: true });
    if (this.cols.length > MAX_COLUMNS) this.cols.splice(0, this.cols.length - MAX_COLUMNS);
  }
  // Merge older columns (restore/backfill) in front of live ones, sorted by time, deduped.
  merge(older: Column[]) {
    if (!older.length) return;
    const seen = new Set(this.cols.map(c => c.time));
    const fresh = older.filter(c => !seen.has(c.time));
    this.cols = [...fresh, ...this.cols].sort((a, b) => a.time - b.time);
    if (this.cols.length > MAX_COLUMNS) this.cols.splice(0, this.cols.length - MAX_COLUMNS);
  }
  get columns(): readonly Column[] { return this.cols; }
  // Liquidity at an absolute bucket index for one column.
  cell(column: Column, bucketIndex: number): number {
    const i = bucketIndex - column.origin;
    return i >= 0 && i < ROWS ? (column.data[i] ?? 0) : 0;
  }
  // Grouped cell: sum of `grouping` adjacent buckets ending at the row's band.
  groupedCell(column: Column, rowTopIndex: number, grouping: number): number {
    let sum = 0;
    for (let g = 0; g < grouping; g++) sum += this.cell(column, rowTopIndex - g);
    return sum;
  }
}
