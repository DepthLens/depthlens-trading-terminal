import type { ISeriesPrimitive, IPrimitivePaneView, Time } from 'lightweight-charts';
import type { OverlayChart, OverlayProbe, OverlaySample, Palette } from './chart-overlays';
import { formatVolume, type FootprintCandle, type FootprintRow, type FootprintSettings } from './footprint-data';

export type FootprintBar = { time: number; high: number; low: number; fp: FootprintCandle };
const rgba = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `,${a.toFixed(3)})`);

// Retains prices, times and volumes only; every pixel comes from priceToCoordinate/timeToCoordinate during draw.
export class FootprintPrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  bars: FootprintBar[] = [];
  hidden = false;
  paused = false;
  private request = () => {};
  private lastDraw: OverlaySample[] = [];
  private widths = new Map<string, number>();
  constructor(private api: OverlayChart, public settings: FootprintSettings, private colors: Palette, private mobile: boolean) {}
  attached({ requestUpdate }: Parameters<NonNullable<ISeriesPrimitive<Time>['attached']>>[0]) { this.request = requestUpdate; }
  detached() { this.request = () => {}; }
  pause(value: boolean) { this.paused = value; }
  samples = () => this.lastDraw;
  refresh() { this.request(); }
  get minH() { return 9; }
  get minW() { return 56; }
  /** Cells drawn outside their candle's high-low range in the last paint (must stay 0). */
  outside = 0;
  cellWidth() { return this.api.chart.timeScale().options().barSpacing * .92; }
  private measure(ctx: CanvasRenderingContext2D, text: string) {
    const key = `${ctx.font}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) { w = ctx.measureText(text).width; if (this.widths.size > 5000) this.widths.clear(); this.widths.set(key, w); }
    return w;
  }
  private views: IPrimitivePaneView[] = [{ zOrder: () => 'normal', renderer: () => ({ draw: target => target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
    this.lastDraw = []; this.outside = 0;
    if (this.hidden || !this.bars.length) return;
    const ts = this.api.chart.timeScale(), s = this.settings, c = this.colors, w = this.cellWidth(), half = w / 2;
    const numbers = w >= this.minW, fontSize = this.mobile ? 11 : 10;
    ctx.save(); ctx.globalAlpha = s.opacity; ctx.textBaseline = 'middle';
    for (const bar of this.bars) {
      const x = ts.timeToCoordinate(bar.time as Time);
      if (x === null || x < -w || x > mediaSize.width + w || bar.fp.coverage === 'none') continue;
      const left = x - half;
      if (bar.fp.coverage === 'partial') {
        const a = this.api.series.priceToCoordinate(bar.high), b = this.api.series.priceToCoordinate(bar.low);
        if (a !== null && b !== null) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(c.muted, .6); ctx.lineWidth = 1; ctx.strokeRect(left - 1, a - 1, w + 2, b - a + 2); ctx.restore(); }
      }
      const hiY = this.api.series.priceToCoordinate(bar.high), loY = this.api.series.priceToCoordinate(bar.low);
      if (hiY === null || loY === null) continue;
      if (!numbers) {
        // Narrow candles: keep the normal candle and add only a light delta tint over its own range.
        const d = bar.fp.ask - bar.fp.bid;
        ctx.fillStyle = rgba(d >= 0 ? c.up : c.down, .22); ctx.fillRect(left, hiY, w, Math.max(1, loY - hiY));
        continue;
      }
      const rows = bar.fp.rows.filter(r => r.bid + r.ask > 0 && r.high > bar.low && r.low < bar.high);
      const peak = Math.max(1e-12, ...rows.map(r => s.mode === 'delta' ? Math.abs(r.ask - r.bid) : s.mode === 'volume' ? r.ask + r.bid : Math.max(r.ask, r.bid)));
      let topY = Infinity, botY = -Infinity;
      for (const row of rows) {
        // Height is priceToCoordinate(rowTop) - priceToCoordinate(rowBottom), clipped to the candle's high/low.
        const topP = Math.min(row.high, bar.high), botP = Math.max(row.low, bar.low);
        const y1 = this.api.series.priceToCoordinate(topP), y2 = this.api.series.priceToCoordinate(botP);
        if (y1 === null || y2 === null || y2 < 0 || y1 > mediaSize.height) continue;
        if (y1 < hiY - 1 || y2 > loY + 1) this.outside++;
        topY = Math.min(topY, y1); botY = Math.max(botY, y2);
        const h = Math.max(1, y2 - y1 - (y2 - y1 > 4 ? 1 : 0)), text = y2 - y1 >= this.minH, delta = row.ask - row.bid;
        if (this.lastDraw.length < 8) this.lastDraw.push({ name: `Footprint cell ${this.lastDraw.length + 1}`, price: topP, drawnY: y1 });
        if (!text || s.mode !== 'bidask') {
          const v = s.mode === 'volume' ? row.ask + row.bid : Math.abs(delta);
          ctx.fillStyle = rgba(s.mode === 'volume' ? c.unsplit : delta >= 0 ? c.up : c.down, .12 + .6 * v / peak);
          ctx.fillRect(left, y1, w, h);
          if (text) {
            ctx.font = `${fontSize}px ui-monospace, monospace`; ctx.fillStyle = s.mode === 'volume' ? c.muted : delta >= 0 ? c.up : c.down;
            const label = s.mode === 'volume' ? formatVolume(row.ask + row.bid) : `${delta >= 0 ? '+' : ''}${formatVolume(delta)}`;
            ctx.fillText(label, x - this.measure(ctx, label) / 2, y1 + (y2 - y1) / 2);
          }
        } else {
          ctx.fillStyle = rgba(c.down, .06 + .4 * row.bid / peak); ctx.fillRect(left, y1, half - .5, h);
          ctx.fillStyle = rgba(c.up, .06 + .4 * row.ask / peak); ctx.fillRect(x + .5, y1, half - .5, h);
          this.number(ctx, row, 'bid', left + 3, y1, y2, fontSize, half);
          this.number(ctx, row, 'ask', x + half - 3, y1, y2, fontSize, half);
        }
        if (s.poc && bar.fp.poc === row.row) { ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = c.poc; ctx.lineWidth = 1.5; ctx.strokeRect(left + .75, y1 + .75, w - 1.5, Math.max(1, y2 - y1 - 1.5)); ctx.restore(); }
      }
      // Clip probes: report the candle edge when cells stay inside it, otherwise the offending pixel (fails the 1px check).
      if (topY !== Infinity && this.lastDraw.length < 12) {
        this.lastDraw.push({ name: 'Footprint within high', price: bar.high, drawnY: topY < hiY - 1 ? topY : hiY });
        this.lastDraw.push({ name: 'Footprint within low', price: bar.low, drawnY: botY > loY + 1 ? botY : loY });
      }
      if (s.totals && numbers) {
        const low = this.api.series.priceToCoordinate(bar.low);
        if (low !== null && low < mediaSize.height) {
          const d = bar.fp.ask - bar.fp.bid;
          ctx.font = `${fontSize}px ui-monospace, monospace`;
          for (const [i, label, color] of [[0, `Δ ${d >= 0 ? '+' : ''}${formatVolume(d)}`, d >= 0 ? c.up : c.down], [1, `V ${formatVolume(bar.fp.ask + bar.fp.bid)}`, c.muted]] as const) {
            ctx.fillStyle = color; ctx.fillText(label, x - this.measure(ctx, label) / 2, low + 9 + i * 12);
          }
        }
      }
    }
    ctx.restore();
  }) }) }];
  private number(ctx: CanvasRenderingContext2D, row: FootprintRow, side: 'bid' | 'ask', edge: number, y1: number, y2: number, size: number, half: number) {
    if (y2 - y1 < this.minH || half * 2 < this.minW) return;
    const imb = this.settings.imbalance && (side === 'bid' ? row.bidImb : row.askImb), value = row[side];
    if (!value && !imb) return;
    ctx.font = `${imb ? 'bold ' : ''}${size}px ui-monospace, monospace`;
    const label = formatVolume(value), width = this.measure(ctx, label), x = side === 'bid' ? edge : edge - width;
    ctx.fillStyle = side === 'bid' ? this.colors.down : this.colors.up;
    ctx.fillText(label, x, y1 + (y2 - y1) / 2);
    if (imb) { ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.strokeRect(x - 2, y1 + 1, width + 4, Math.max(1, y2 - y1 - 2)); ctx.restore(); }
  }
  paneViews() { return this.views; }
  /** Hit test from current coordinates; returns the candle and, if inside one, the row. */
  at(x: number, y: number) {
    const ts = this.api.chart.timeScale(), half = this.cellWidth() / 2;
    for (const bar of this.bars) {
      const bx = ts.timeToCoordinate(bar.time as Time);
      if (bx === null || Math.abs(x - bx) > half || bar.fp.coverage === 'none') continue;
      const price = this.api.series.coordinateToPrice(y);
      const row = price === null ? undefined : bar.fp.rows.find(r => price >= r.low && price < r.high);
      return { bar, row };
    }
    return null;
  }
}
