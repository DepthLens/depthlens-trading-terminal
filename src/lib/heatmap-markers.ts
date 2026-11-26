// Browser-safe order-book behaviour markers (context only, never signals): Pulled, Iceberg, Absorption.
// Processes columns incrementally so the 1 Hz check stays cheap in live and recorded history.
import type { Column } from './heatmap-data';

export type MarkerKind = 'pulled' | 'iceberg' | 'absorption';
export type Marker = { kind: MarkerKind; time: number; price: number; index: number; side: 'buy' | 'sell' | 'bid' | 'ask'; size: number; detail: string; hidden?: number; buy?: number; sell?: number };
export type MarkerSettings = { pulled: boolean; iceberg: boolean; absorption: boolean };
export const PULL_DROP = 0.7, PULL_WINDOW_MS = 10000, PULL_AWAY = 0.0005, ICE_WINDOW_MS = 30000, ICE_RATIO = 2, ABS_WINDOW_MS = 30000, ABS_PCT = 95, ABS_TICKS = 2;
const DEDUP_MS = 30000;
const cell = (c: Column, i: number) => { const k = i - c.origin; return k >= 0 && k < c.data.length ? c.data[k] ?? 0 : 0; };
const usable = (c: Column | undefined) => Boolean(c && !c.gap && !c.empty && !c.priceOnly && c.data.length);
const tradedAt = (c: Column, i: number) => { const t = c.trades.get(i); return t ? { buy: t.buy, sell: t.sell } : { buy: 0, sell: 0 }; };

export class MarkerEngine {
  markers: Marker[] = [];
  private lastTime = -Infinity;
  private bursts: number[] = [];
  // Same values as `bursts`, kept sorted so the 95th percentile is a lookup instead of a sort per trade price.
  private sortedBursts: number[] = [];
  private seen = new Map<string, number>();
  get processedTo() { return this.lastTime; }
  reset() { this.markers = []; this.lastTime = -Infinity; this.bursts = []; this.sortedBursts = []; this.seen.clear(); }
  private static lowerBound(a: number[], v: number) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < v) lo = m + 1; else hi = m; } return lo; }
  private add(m: Marker) {
    const k = `${m.kind}:${m.index}`, prev = this.seen.get(k);
    if (prev !== undefined && m.time - prev < DEDUP_MS) return;
    this.seen.set(k, m.time); this.markers.push(m);
    if (this.markers.length > 600) this.markers.splice(0, this.markers.length - 600);
  }
  // wallThr: current top-1% resting size; tick: bucket size in price; stepMs: column spacing.
  process(cols: readonly Column[], bucket: number, wallThr: number, s: MarkerSettings, stepMs: number) {
    const lagOf = (ms: number) => Math.max(1, Math.round(ms / Math.max(1000, stepMs)));
    const pullLag = lagOf(PULL_WINDOW_MS), winLag = lagOf(ICE_WINDOW_MS);
    let start = cols.findIndex(c => c.time > this.lastTime);
    if (start < 0) return;
    start = Math.max(start, 1);
    for (let ci = start; ci < cols.length; ci++) {
      const c = cols[ci]!; this.lastTime = c.time;
      if (!usable(c)) continue;
      const pi = Math.floor(c.price / bucket);
      // Pulled: a wall shrinks ≥70% within 10s while price stays ≥0.05% away and almost nothing traded there.
      const before = cols[ci - pullLag];
      if (s.pulled && wallThr > 0 && usable(before)) {
        const lo = Math.max(before!.origin, c.origin), hi = Math.min(before!.origin + before!.data.length, c.origin + c.data.length);
        for (let i = lo; i < hi; i++) {
          const was = cell(before!, i); if (was < wallThr) continue;
          const now = cell(c, i); if (now > was * (1 - PULL_DROP)) continue;
          const price = (i + .5) * bucket;
          if (Math.abs(price - c.price) / c.price < PULL_AWAY) continue;
          let traded = 0; for (let k = ci - pullLag + 1; k <= ci; k++) { const t = cols[k] ? tradedAt(cols[k]!, i) : null; if (t) traded += t.buy + t.sell; }
          if (traded > (was - now) * 0.1) continue;
          this.add({ kind: 'pulled', time: c.time, price, index: i, side: i < pi ? 'bid' : 'ask', size: was - now, detail: `Pulled ${i < pi ? 'bid' : 'ask'}: resting size fell ${Math.round((1 - now / was) * 100)}% in ${Math.round(PULL_WINDOW_MS / 1000)}s with little trading` });
        }
      }
      if (!s.iceberg && !s.absorption) continue;
      for (const i of c.trades.keys()) {
        let buy = 0, sell = 0, minP = Infinity, maxP = -Infinity;
        const from = Math.max(0, ci - winLag + 1);
        for (let k = from; k <= ci; k++) {
          const col = cols[k]!; const t = tradedAt(col, i); buy += t.buy; sell += t.sell;
          if (Number.isFinite(col.price)) { minP = Math.min(minP, col.price); maxP = Math.max(maxP, col.price); }
        }
        const price = (i + .5) * bucket;
        // Iceberg: traded volume over 30s > 2× visible resting size there, while resting size keeps refilling.
        if (s.iceberg) {
          const rest = cell(c, i), old = cols[from] && usable(cols[from]) ? cell(cols[from]!, i) : 0;
          if (rest > 0 && old > 0 && rest >= old * 0.5 && buy + sell > ICE_RATIO * rest) {
            const hidden = buy + sell - rest;
            this.add({ kind: 'iceberg', time: c.time, price, index: i, side: i < pi ? 'bid' : 'ask', size: buy + sell, hidden, buy, sell, detail: `Iceberg: ${Math.round((buy + sell) / rest * 10) / 10}× the visible size traded in 30s while the order refilled` });
          }
        }
        // Absorption: a top-5% aggressive burst into one price, yet price moves < 2 ticks beyond it.
        if (s.absorption) {
          const burst = Math.max(buy, sell);
          if (burst > 0) {
            this.bursts.push(burst); this.sortedBursts.splice(MarkerEngine.lowerBound(this.sortedBursts, burst), 0, burst);
            if (this.bursts.length > 2000) for (const old of this.bursts.splice(0, this.bursts.length - 2000)) this.sortedBursts.splice(MarkerEngine.lowerBound(this.sortedBursts, old), 1);
          }
          if (this.bursts.length >= 50) {
            const sorted = this.sortedBursts, p95 = sorted[Math.floor(sorted.length * ABS_PCT / 100)] ?? Infinity;
            const selling = sell >= buy;
            const beyond = selling ? (price - minP) / bucket : (maxP - price) / bucket;
            if (burst >= p95 && beyond < ABS_TICKS) this.add({ kind: 'absorption', time: c.time, price, index: i, side: selling ? 'sell' : 'buy', size: burst, buy, sell, detail: `Absorption: aggressive ${selling ? 'selling' : 'buying'} met resting orders; price moved < ${ABS_TICKS} ticks beyond` });
          }
        }
      }
    }
  }
}
