// Browser-safe Time & Sales ring buffer fed by the existing LiveQuote trade bridge (no sockets).
export type TapeTrade = { t: number; price: number; coin: number; notional: number; side: 'Buy' | 'Sell' };
export const TAPE_MAX = 2000;
export class TapeRing {
  private items: TapeTrade[] = [];
  version = 0;
  push(tr: TapeTrade) { this.items.push(tr); if (this.items.length > TAPE_MAX) this.items.splice(0, this.items.length - TAPE_MAX); this.version++; }
  clear() { this.items = []; this.version++; }
  // Newest first, optionally only trades at or above minNotional.
  latest(n: number, minNotional = 0): TapeTrade[] {
    const out: TapeTrade[] = [];
    for (let i = this.items.length - 1; i >= 0 && out.length < n; i--) { const x = this.items[i]!; if (x.notional >= minNotional) out.push(x); }
    return out;
  }
}
export const heatTape = new TapeRing();
