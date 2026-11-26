import type { ISeriesPrimitive, IPrimitivePaneView, Time } from 'lightweight-charts';
import type { OverlayChart, OverlayProbe, OverlaySample, Palette } from './chart-overlays';
import { deltaStrength, footprintZoomMode, formatVolume, rowImbalance, type FootprintCandle, type FootprintSettings } from './footprint-data';

import { emptyFootprintColumn } from './tool-layout';

export type FootprintBar = { time: number; open: number; close: number; high: number; low: number; fp: FootprintCandle };

// Only prices/times/volumes are renderer inputs; samples are diagnostic output, never reused.
export class FootprintPrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  bars: FootprintBar[] = [];
  hidden = false;
  paused = false;
  outside = 0;
  private request = () => {};
  private lastDraw: OverlaySample[] = [];
  private widths = new Map<string, number>();
  constructor(private api: OverlayChart, public settings: FootprintSettings, private colors: Palette & { clusterText: string; clusterOutline: string; textShadow: string }, private mobile: boolean) {}
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
    const zoom = this.hidden ? 'bodies' : footprintZoomMode(spacing), detailed = zoom === 'detail';
    let texts = 0, cells = 0, imbalances = 0, emptyColumns = 0, stacked = 0, levels = 0, dots = 0;
    // Zoomed out: colour strength is relative to the largest visible candle delta; the delta row collects per candle.
    let maxDelta = 0;
    if (!detailed) for (const b of this.bars) if (b.fp.rows.length) maxDelta = Math.max(maxDelta, Math.abs(b.fp.ask - b.fp.bid));
    const deltaRow: { x: number; delta: number }[] = [];
    ctx.save();
    const range = ts.getVisibleLogicalRange(), data = this.api.series.data();
    const cached = new Map(this.bars.map(bar => [bar.time, bar]));
    const first = range ? Math.max(0, Math.floor(range.from) - 1) : 0;
    const last = range ? Math.min(data.length - 1, Math.ceil(range.to) + 1) : -1;
    for (let index = first; index <= last; index++) {
      const current = data[index]; if (!current || !('open' in current)) continue;
      const time = Number(current.time), saved = cached.get(time);
      const bar: FootprintBar = { time, open: current.open, close: current.close, high: current.high, low: current.low, fp: saved?.fp ?? { start: time * 1000, rows: [], bid: 0, ask: 0, poc: null, peak: 0, coverage: 'none' } };
      const x = ts.timeToCoordinate(bar.time as Time);
      if (x === null || x < -spacing / 2 || x > mediaSize.width + spacing / 2) continue;
      const hi = this.api.series.priceToCoordinate(bar.high), lo = this.api.series.priceToCoordinate(bar.low);
      const open = this.api.series.priceToCoordinate(bar.open), close = this.api.series.priceToCoordinate(bar.close);
      if (hi === null || lo === null || open === null || close === null) continue;
      const hasData = bar.fp.rows.length > 0, cluster = detailed && hasData;
      const left = x - w / 2, candleX = cluster ? left + 3 : x, bodyW = cluster || (detailed&&!hasData) ? 4 : Math.max(1, Math.min(spacing * .6, 20));
      if (detailed || !hasData) {
        ctx.globalAlpha = 1; ctx.strokeStyle = ctx.fillStyle = bar.close >= bar.open ? c.up : c.down;
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(candleX, hi); ctx.lineTo(candleX, lo); ctx.stroke();
        ctx.fillRect(candleX - bodyW / 2, Math.min(open, close), bodyW, Math.max(1, Math.abs(close - open)));
      } else {
        const delta = bar.fp.ask - bar.fp.bid;
        deltaRow.push({ x, delta });
        if (zoom === 'levels') levels += this.drawLevels(ctx, bar, x, w, hi, lo, mediaSize.height);
        else {
          // Narrow: body coloured by candle delta (stronger for bigger delta), thin wick, yellow POC dot.
          const color = delta >= 0 ? c.up : c.down;
          ctx.globalAlpha = .8; ctx.strokeStyle = color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, hi); ctx.lineTo(x, lo); ctx.stroke();
          ctx.globalAlpha = deltaStrength(delta, maxDelta); ctx.fillStyle = color;
          ctx.fillRect(x - bodyW / 2, Math.min(open, close), bodyW, Math.max(1, Math.abs(close - open)));
          const pocRow = s.poc ? bar.fp.rows.find(r => r.row === bar.fp.poc) : undefined;
          const py = pocRow ? this.api.series.priceToCoordinate(Math.min(bar.high, Math.max(bar.low, (pocRow.low + pocRow.high) / 2))) : null;
          if (py !== null) {
            ctx.globalAlpha = 1; ctx.fillStyle = c.poc; ctx.beginPath(); ctx.arc(x, py, Math.max(1.5, Math.min(3, spacing * .22)), 0, Math.PI * 2); ctx.fill(); dots++;
          }
        }
        ctx.globalAlpha = 1;
      }
      if (bar.fp.note === 'not-recorded' && spacing >= 40 && !this.hidden && hi > 14) {
        ctx.save(); ctx.globalAlpha = .45; ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = c.muted; ctx.textBaseline = 'bottom';
        const label = 'not recorded'; ctx.fillText(label, x - this.measure(ctx, label) / 2, hi - 3, Math.max(20, w)); ctx.restore();
      }
      if (!hasData) {
        if(emptyFootprintColumn(spacing,hasData)&&!this.hidden){emptyColumns++;ctx.save();ctx.globalAlpha=.28;ctx.strokeStyle=c.muted;ctx.setLineDash([3,3]);ctx.strokeRect(left+.5,hi+.5,w-1,Math.max(1,lo-hi-1));ctx.restore();this.lastDraw.push({name:'Footprint no-data column',price:bar.high,drawnY:hi});if(w>=100&&lo-hi>18){ctx.font='10px ui-monospace,monospace';ctx.fillStyle=c.muted;ctx.textBaseline='middle';ctx.fillText('No footprint data',left+7,(hi+lo)/2,w-14);}}
        continue;
      }
      if (!cluster) continue;
      const cellLeft = left + 9, cellW = w - 9;
      const rows = bar.fp.rows.filter(r => r.bid + r.ask > 0 && r.high > bar.low && r.low < bar.high);
      const peak = Math.max(1e-12, ...rows.map(r => r.bid + r.ask));
      const stackRuns: { side: 'bid' | 'ask'; low: number; high: number; count: number }[] = [];
      for (const row of rows) {
        const side = s.imbalance ? rowImbalance(row.bid, row.ask, s.ratio) : null, run = stackRuns.at(-1);
        if (side && run && run.side === side && Math.abs(run.high - row.low) < 1e-9 * Math.max(1, row.low)) { run.high = row.high; run.count++; }
        else if (side) stackRuns.push({ side, low: row.low, high: row.high, count: 1 });
      }
      for (const row of rows) {
        const topP = Math.min(row.high, bar.high), bottomP = Math.max(row.low, bar.low);
        const y1 = this.api.series.priceToCoordinate(topP), y2 = this.api.series.priceToCoordinate(bottomP);
        if (y1 === null || y2 === null || y2 <= y1 || y2 < 0 || y1 > mediaSize.height) continue;
        const height = Math.max(0,y2-y1-1);
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
        ctx.fillRect(cellLeft, y1, imbalance ? cellW : cellW * Math.max(.12,(row.bid+row.ask)/peak), height);
        if (imbalance) imbalances++;
        if (s.poc && bar.fp.poc === row.row) {
          ctx.globalAlpha = 1; ctx.strokeStyle = c.clusterOutline; ctx.lineWidth = 1;
          ctx.strokeRect(cellLeft + .5, y1 + .5, cellW - 1, Math.max(0, height - 1));
        }
        if (height >= 14) {
          const delta = row.ask - row.bid;
          const label = s.mode === 'bidask' ? `${formatVolume(row.bid)} x ${formatVolume(row.ask)}` : s.mode === 'delta' ? `${delta >= 0 ? '+' : ''}${formatVolume(delta)}` : formatVolume(row.bid + row.ask);
          ctx.globalAlpha = 1; ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.clusterText;
          const width = Math.min(this.measure(ctx, label), cellW - 4);
          ctx.shadowColor=c.textShadow;ctx.shadowOffsetX=1;ctx.shadowOffsetY=1;
          ctx.strokeStyle=c.textShadow;ctx.lineWidth=2;ctx.strokeText(label,cellLeft+(cellW-width)/2,y1+height/2,cellW-4);
          ctx.fillText(label, cellLeft + (cellW - width) / 2, y1 + height / 2, cellW - 4);
          texts++;
        }
        ctx.restore();
      }
      // Stacked imbalances: 3+ adjacent same-side imbalance rows get a bar on the cell's right edge.
      for (const run of stackRuns) {
        if (run.count < 3) continue;
        const y1 = this.api.series.priceToCoordinate(Math.min(run.high, bar.high)), y2 = this.api.series.priceToCoordinate(Math.max(run.low, bar.low));
        if (y1 === null || y2 === null || y2 <= y1) continue;
        ctx.globalAlpha = 1; ctx.fillStyle = run.side === 'ask' ? c.up : c.down;
        ctx.fillRect(left + w - 3, y1, 3, y2 - y1); stacked++;
      }
      if (s.totals && lo < mediaSize.height - 24) {
        ctx.globalAlpha = 1; ctx.font = '11px ui-monospace, monospace'; ctx.textBaseline = 'middle';
        const delta = bar.fp.ask - bar.fp.bid;
        for (const [i, label, color] of [[0, `Δ ${delta >= 0 ? '+' : ''}${formatVolume(delta)}`, delta >= 0 ? c.up : c.down], [1, `V ${formatVolume(bar.fp.bid + bar.fp.ask)}`, c.muted]] as const) {
          ctx.fillStyle = color; ctx.fillText(label, x - this.measure(ctx, label) / 2, lo + 9 + i * 12, w);
        }
      }
    }
    // Delta row under the chart: numbers when columns are wide enough, coloured mini-bars when narrow.
    if (!detailed && s.totals && deltaRow.length) {
      const mid = mediaSize.height - 14, barW = Math.max(1, Math.min(spacing * .6, 12));
      ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'middle';
      for (const { x, delta } of deltaRow) {
        ctx.fillStyle = delta >= 0 ? c.up : c.down;
        if (spacing >= 48) { const label = `${delta >= 0 ? '+' : ''}${formatVolume(delta)}`; ctx.globalAlpha = 1; ctx.fillText(label, x - this.measure(ctx, label) / 2, mid, spacing - 4); }
        else { const h = Math.max(1, 9 * (maxDelta > 0 ? Math.abs(delta) / maxDelta : 0)); ctx.globalAlpha = deltaStrength(delta, maxDelta); ctx.fillRect(x - barW / 2, delta >= 0 ? mid - h : mid, barW, h); }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    Object.assign(this.api.host.dataset, { footprintMode: zoom, footprintLevels: String(levels), footprintDots: String(dots), footprintDeltaRow: String(!detailed && s.totals ? deltaRow.length : 0), footprintEmpty: String(emptyColumns), footprintOutside: String(this.outside), footprintTexts: String(texts), footprintCells: String(cells), footprintImbalances: String(imbalances), footprintStacked: String(stacked), footprintSpacing: String(spacing) });
  }) }) }];
  paneViews() { return this.views; }
  /** Medium zoom: thin per-level bars inside high–low, coloured by level delta (strength by size), yellow POC tick, thin wick. */
  private drawLevels(ctx: CanvasRenderingContext2D, bar: FootprintBar, x: number, w: number, hi: number, lo: number, height: number) {
    const c = this.colors;
    ctx.globalAlpha = .7; ctx.strokeStyle = bar.close >= bar.open ? c.up : c.down; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, hi); ctx.lineTo(x, lo); ctx.stroke();
    const rows = bar.fp.rows.filter(r => r.bid + r.ask > 0 && r.high > bar.low && r.low < bar.high);
    let peak = 1e-12, peakDelta = 1e-12;
    for (const r of rows) { peak = Math.max(peak, r.bid + r.ask); peakDelta = Math.max(peakDelta, Math.abs(r.ask - r.bid)); }
    let drawn = 0;
    for (const row of rows) {
      const topP = Math.min(row.high, bar.high), bottomP = Math.max(row.low, bar.low);
      const y1 = this.api.series.priceToCoordinate(topP), y2 = this.api.series.priceToCoordinate(bottomP);
      if (y1 === null || y2 === null || y2 <= y1 || y2 < 0 || y1 > height) continue;
      if (y1 < hi - 1 || y2 > lo + 1) this.outside++;
      if (this.lastDraw.length < 24) this.lastDraw.push({ name: 'Footprint within high/low', price: topP, drawnY: y1 });
      const delta = row.ask - row.bid, barW = w * Math.max(.15, (row.bid + row.ask) / peak), h = Math.max(1, Math.min(y2 - y1 - 1, (y2 - y1) * .7));
      ctx.globalAlpha = deltaStrength(delta, peakDelta); ctx.fillStyle = delta >= 0 ? c.up : c.down;
      ctx.fillRect(x - barW / 2, (y1 + y2) / 2 - h / 2, barW, h); drawn++;
    }
    const pocRow = this.settings.poc ? rows.find(r => r.row === bar.fp.poc) : undefined;
    const py = pocRow ? this.api.series.priceToCoordinate((Math.min(pocRow.high, bar.high) + Math.max(pocRow.low, bar.low)) / 2) : null;
    if (py !== null) { ctx.globalAlpha = 1; ctx.fillStyle = c.poc; ctx.fillRect(x - Math.max(3, w * .35), py - 1, Math.max(6, w * .7), 2); }
    ctx.globalAlpha = 1;
    return drawn;
  }
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
