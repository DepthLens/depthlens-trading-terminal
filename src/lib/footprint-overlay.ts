import type { ISeriesPrimitive, IPrimitivePaneView, Time } from 'lightweight-charts';
import type { OverlayChart, OverlayProbe, OverlaySample, Palette } from './chart-overlays';
import { FOOTPRINT_DETAIL_SPACING, formatVolume, rowImbalance, type FootprintCandle, type FootprintSettings } from './footprint-data';

export type FootprintBar = { time: number; open: number; close: number; high: number; low: number; fp: FootprintCandle };
const rgba = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `,${a.toFixed(3)})`);

// Only prices/times/volumes are renderer inputs; samples are diagnostic output, never reused.
export class FootprintPrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  bars: FootprintBar[] = [];
  hidden = false;
  paused = false;
  outside = 0;
  private request = () => {};
  private lastDraw: OverlaySample[] = [];
  private widths = new Map<string, number>();
  constructor(private api: OverlayChart, public settings: FootprintSettings, private colors: Palette & { clusterText: string; clusterOutline: string }, private mobile: boolean) {}
  attached({ requestUpdate }: Parameters<NonNullable<ISeriesPrimitive<Time>['attached']>>[0]) { this.request = requestUpdate; }
  detached() { this.request = () => {}; }
  pause(value: boolean) { this.paused = value; }
  samples = () => this.lastDraw;
  refresh() { this.request(); }
  cellWidth() { return this.api.chart.timeScale().options().barSpacing * .9; }
  private measure(ctx: CanvasRenderingContext2D, text: string) {
    const key = `${ctx.font}|${text}`;
    let width = this.widths.get(key);
    if (width === undefined) { width = ctx.measureText(text).width; if (this.widths.size > 5000) this.widths.clear(); this.widths.set(key, width); }
    return width;
  }
  private views: IPrimitivePaneView[] = [{ zOrder: () => 'normal', renderer: () => ({ draw: target => target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
    this.lastDraw = []; this.outside = 0;
    const ts = this.api.chart.timeScale(), spacing = ts.options().barSpacing, w = this.cellWidth(), s = this.settings, c = this.colors;
    const detailed = spacing >= FOOTPRINT_DETAIL_SPACING && !this.hidden;
    let texts = 0, cells = 0, imbalances = 0;
    ctx.save();
    for (const bar of this.bars) {
      const x = ts.timeToCoordinate(bar.time as Time);
      if (x === null || x < -spacing / 2 || x > mediaSize.width + spacing / 2) continue;
      const hi = this.api.series.priceToCoordinate(bar.high), lo = this.api.series.priceToCoordinate(bar.low);
      const open = this.api.series.priceToCoordinate(bar.open), close = this.api.series.priceToCoordinate(bar.close);
      if (hi === null || lo === null || open === null || close === null) continue;
      const hasData = bar.fp.rows.length > 0, cluster = detailed && hasData;
      const left = x - w / 2, candleX = cluster ? left + 3 : x, bodyW = cluster ? 4 : Math.max(1, Math.min(spacing * .6, 20));
      ctx.globalAlpha = 1; ctx.strokeStyle = ctx.fillStyle = bar.close >= bar.open ? c.up : c.down;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(candleX, hi); ctx.lineTo(candleX, lo); ctx.stroke();
      ctx.fillRect(candleX - bodyW / 2, Math.min(open, close), bodyW, Math.max(1, Math.abs(close - open)));
      if (!hasData) continue;
      if (!cluster) {
        ctx.fillStyle = rgba(bar.fp.ask >= bar.fp.bid ? c.up : c.down, .18);
        ctx.fillRect(left, hi, w, Math.max(0, lo - hi));
        continue;
      }
      const cellLeft = left + 9, cellW = w - 9;
      const rows = bar.fp.rows.filter(r => r.bid + r.ask > 0 && r.high > bar.low && r.low < bar.high);
      const peak = Math.max(1e-12, ...rows.map(r => r.bid + r.ask));
      for (const row of rows) {
        const topP = Math.min(row.high, bar.high), bottomP = Math.max(row.low, bar.low);
        const y1 = this.api.series.priceToCoordinate(topP), y2 = this.api.series.priceToCoordinate(bottomP);
        if (y1 === null || y2 === null || y2 <= y1 || y2 < 0 || y1 > mediaSize.height) continue;
        const height = y2 - y1;
        if (y1 < hi - 1 || y2 > lo + 1) this.outside++;
        if (this.lastDraw.length < 24) {
          this.lastDraw.push({ name: `Footprint cell ${cells + 1}`, price: topP, drawnY: y1 });
          this.lastDraw.push({ name: 'Footprint within high/low', price: y1 < hi - 1 ? bar.high : bottomP, drawnY: y1 < hi - 1 ? y1 : y2 });
        }
        cells++;
        const imbalance = s.imbalance ? rowImbalance(row.bid, row.ask, s.ratio) : null;
        const color = (imbalance ? imbalance === 'ask' : row.ask >= row.bid) ? c.up : c.down;
        ctx.save(); ctx.beginPath(); ctx.rect(cellLeft, y1, cellW, height); ctx.clip();
        ctx.globalAlpha = imbalance ? 1 : s.opacity * .6;
        ctx.fillStyle = color;
        ctx.fillRect(cellLeft, y1, imbalance ? cellW : cellW * (row.bid + row.ask) / peak, height);
        if (imbalance) imbalances++;
        if (s.poc && bar.fp.poc === row.row) {
          ctx.globalAlpha = 1; ctx.strokeStyle = c.clusterOutline; ctx.lineWidth = 1;
          ctx.strokeRect(cellLeft + .5, y1 + .5, cellW - 1, Math.max(0, height - 1));
        }
        if (height >= 14) {
          const delta = row.ask - row.bid;
          const label = s.mode === 'bidask' ? `${formatVolume(row.bid)} x ${formatVolume(row.ask)}` : s.mode === 'delta' ? `${delta >= 0 ? '+' : ''}${formatVolume(delta)}` : formatVolume(row.bid + row.ask);
          ctx.globalAlpha = 1; ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.clusterText;
          ctx.fillText(label, cellLeft + (cellW - this.measure(ctx, label)) / 2, y1 + height / 2, cellW - 4);
          texts++;
        }
        ctx.restore();
      }
      if (s.totals && lo < mediaSize.height - 24) {
        ctx.globalAlpha = 1; ctx.font = '11px ui-monospace, monospace'; ctx.textBaseline = 'middle';
        const delta = bar.fp.ask - bar.fp.bid;
        for (const [i, label, color] of [[0, `Δ ${delta >= 0 ? '+' : ''}${formatVolume(delta)}`, delta >= 0 ? c.up : c.down], [1, `V ${formatVolume(bar.fp.bid + bar.fp.ask)}`, c.muted]] as const) {
          ctx.fillStyle = color; ctx.fillText(label, x - this.measure(ctx, label) / 2, lo + 9 + i * 12, w);
        }
      }
    }
    ctx.restore();
    Object.assign(this.api.host.dataset, { footprintOutside: String(this.outside), footprintTexts: String(texts), footprintCells: String(cells), footprintImbalances: String(imbalances), footprintSpacing: String(spacing) });
  }) }) }];
  paneViews() { return this.views; }
  at(x: number, y: number) {
    const ts = this.api.chart.timeScale(), half = this.cellWidth() / 2;
    for (const bar of this.bars) {
      const bx = ts.timeToCoordinate(bar.time as Time);
      if (bx === null || Math.abs(x - bx) > half || !bar.fp.rows.length) continue;
      const price = this.api.series.coordinateToPrice(y);
      const row = price === null || price < bar.low || price > bar.high ? undefined : bar.fp.rows.find(r => price >= r.low && price < r.high);
      return { bar, row };
    }
    return null;
  }
}
