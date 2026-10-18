import { connectionManager, type ConnectionSource } from './market-stream';

type Levels = [string, string][];
type Diff = { U: number; u: number; pu: number; b: Levels; a: Levels };
export type BookDebug = { source: string; symbol: string; state: 'Synced' | 'Resyncing'; enabled: boolean; bestBid: number | null; bestAsk: number | null; spread: number | null; bidLevels: number; askLevels: number; totalBidSize: number; totalAskSize: number; updatesPerSecond: number };

class Side {
  readonly levels = new Map<number, number>();
  total = 0;
  best: number | null = null;
  private dirty = false;
  constructor(private bid: boolean) {}
  clear() { this.levels.clear(); this.total = 0; this.best = null; this.dirty = false; }
  apply(levels: Levels) {
    for (const [p, q] of levels) {
      const price = Number(p), size = Number(q);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size < 0) continue;
      const old = this.levels.get(price) ?? 0;
      this.total += size - old;
      if (size === 0) { this.levels.delete(price); if (this.best === price) this.dirty = true; }
      else {
        this.levels.set(price, size);
        if (this.best === null || (this.bid ? price > this.best : price < this.best)) this.best = price;
      }
    }
  }
  top() {
    if (this.dirty) {
      this.best = null;
      for (const price of this.levels.keys()) if (this.best === null || (this.bid ? price > this.best : price < this.best)) this.best = price;
      this.dirty = false;
    }
    return this.best;
  }
}

// One active book. Snapshot work is asynchronous; diff application is O(changed levels).
export class OrderBookManager {
  readonly bids = new Side(true);
  readonly asks = new Side(false);
  private symbol = '';
  private source: ConnectionSource | null = null;
  private enabled = false;
  private state: BookDebug['state'] = 'Resyncing';
  private unsubscribe: (() => void) | undefined;
  private request?: AbortController;
  private retry?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private connected = false;
  private buffer: Diff[] = [];
  private lastUpdate: number | null = null;
  private bybitUpdate: number | null = null;
  private fetching = false;
  private updates: number[] = [];
  setActive(symbol: string, source: ConnectionSource | null) { this.configure(symbol, source, this.enabled); }
  setEnabled(enabled: boolean) { this.configure(this.symbol, this.source, enabled); }
  configure(symbol: string, source: ConnectionSource | null, enabled: boolean) {
    if (symbol === this.symbol && source === this.source && enabled === this.enabled) return;
    this.stop(); this.symbol = symbol; this.source = source; this.enabled = enabled;
    if (!enabled || !source || !symbol) return;
    const token = this.generation;
    const topic = source === 'bybit' ? `orderbook.200.${symbol}` : `${symbol.toLowerCase()}@depth@100ms`;
    this.unsubscribe = connectionManager.subscribe(source, topic, message => {
      if (token !== this.generation) return;
      if (source === 'bybit') this.bybit(message); else this.binance(message.data ?? message);
    }, open => {
      if (token !== this.generation) return;
      this.connected = open; this.reset();
      this.request?.abort(); clearTimeout(this.retry); this.fetching = false;
      if (open && source === 'binance') void this.snapshot(token);
    });
  }
  private reset() { this.bids.clear(); this.asks.clear(); this.buffer = []; this.lastUpdate = null; this.bybitUpdate = null; this.state = 'Resyncing'; this.updates = []; }
  private stop() {
    this.generation++; this.unsubscribe?.(); this.unsubscribe = undefined;
    this.request?.abort(); clearTimeout(this.retry); this.fetching = false; this.connected = false; this.reset();
  }
  dispose() { this.stop(); this.enabled = false; this.source = null; this.symbol = ''; }
  private changed(b: Levels, a: Levels) {
    this.bids.apply(b); this.asks.apply(a);
    const now = Date.now(); this.updates.push(now);
    this.trimUpdates(now);
  }
  private trimUpdates(now: number) { while (this.updates.length && (this.updates[0] ?? now) < now - 1000) this.updates.shift(); }
  private bybit(message: any) {
    const d = message.data;
    if (!d || d.s !== this.symbol || !Array.isArray(d.b) || !Array.isArray(d.a)) return;
    if (message.type === 'snapshot') {
      this.reset(); this.changed(d.b, d.a); this.bybitUpdate = Number(d.u); this.state = 'Synced';
    } else if (message.type === 'delta' && this.state === 'Synced') {
      // Bybit u is not necessarily contiguous; ignore stale duplicates, not skipped IDs.
      if (Number(d.u) <= (this.bybitUpdate ?? -1)) return;
      this.changed(d.b, d.a); this.bybitUpdate = Number(d.u);
    }
  }
  private binance(d: any) {
    if (d.e !== 'depthUpdate' || d.s !== this.symbol || !Array.isArray(d.b) || !Array.isArray(d.a) || ![d.U, d.u, d.pu].every(Number.isFinite)) return;
    if (this.state !== 'Synced') {
      if (this.buffer.length >= 10000) { this.request?.abort(); this.fetching = false; this.buffer = []; }
      this.buffer.push(d);
      if (this.lastUpdate !== null) this.drain();
      if (!this.fetching && this.lastUpdate === null) void this.snapshot(this.generation);
      return;
    }
    if (d.u <= (this.lastUpdate ?? -1)) return;
    if (d.pu !== this.lastUpdate) { this.resync(d); return; }
    this.changed(d.b, d.a); this.lastUpdate = d.u;
  }
  private resync(first?: Diff) {
    this.reset(); if (first) this.buffer.push(first);
    this.request?.abort(); this.fetching = false; clearTimeout(this.retry);
    if (this.connected) void this.snapshot(this.generation);
  }
  private drain() {
    if (this.lastUpdate === null) return;
    // Futures: discard u < snapshot ID; first event must contain that ID (inclusive).
    const pending = this.buffer; this.buffer = [];
    for (const d of pending) {
      if (this.state !== 'Synced') {
        if (d.u < this.lastUpdate) continue;
        if (d.U > this.lastUpdate) { this.resync(d); return; }
      } else {
        if (d.u <= this.lastUpdate) continue;
        if (d.pu !== this.lastUpdate) { this.resync(d); return; }
      }
      this.changed(d.b, d.a); this.lastUpdate = d.u; this.state = 'Synced';
    }
  }
  private async snapshot(token: number) {
    if (this.fetching || !this.connected) return;
    this.fetching = true;
    const controller = new AbortController(); this.request = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${this.symbol}&limit=1000`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Snapshot unavailable');
      const data = await response.json();
      if (token !== this.generation || this.request !== controller || !this.connected) return;
      if (!Number.isFinite(data.lastUpdateId) || !Array.isArray(data.bids) || !Array.isArray(data.asks)) throw new Error('Invalid snapshot');
      this.bids.clear(); this.asks.clear(); this.bids.apply(data.bids); this.asks.apply(data.asks);
      this.lastUpdate = data.lastUpdateId; this.fetching = false; this.drain();
    } catch {
      if (token === this.generation && this.request === controller && this.connected) {
        this.fetching = false; this.retry = setTimeout(() => void this.snapshot(token), 1000);
      }
    } finally { clearTimeout(timeout); }
  }
  debug(): BookDebug {
    this.trimUpdates(Date.now());
    const bestBid = this.bids.top(), bestAsk = this.asks.top();
    return { source: this.source ?? 'Offline', symbol: this.symbol, state: this.state, enabled: this.enabled, bestBid, bestAsk, spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null, bidLevels: this.bids.levels.size, askLevels: this.asks.levels.size, totalBidSize: Math.max(0, this.bids.total), totalAskSize: Math.max(0, this.asks.total), updatesPerSecond: this.updates.length };
  }
}
export const orderBook = new OrderBookManager();
if (import.meta.hot) import.meta.hot.dispose(() => orderBook.dispose());