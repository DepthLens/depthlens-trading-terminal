import type { Coordinate, ISeriesPrimitive, IPrimitivePaneView, ISeriesPrimitiveAxisView, Logical, Time } from 'lightweight-charts';
import type { OverlayChart, OverlayProbe, OverlaySample, Palette } from './chart-overlays';
import { formatPrice, type PriceSpec } from './market-data';
import { FIB_LEVELS, distToSegment, fibPrice, logicalToTime, measureStats, riskReward, snapPrice, timeToLogical, type Bar4, type Drawing, type Pt } from './drawing-data';

export type Handle = 'a' | 'b' | 'c' | 'body';
export type Hit = { id: string; handle: Handle };
type Ctx = CanvasRenderingContext2D;

const textOn = (hex: string) => { const n = parseInt(hex.slice(1), 16); const l = ((n >> 16) & 255) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114; return l > 150 ? '#000000' : '#FFFFFF'; };
const alpha = (color: string, a: number) => {
  if (color.startsWith('#') && color.length === 7) { const n = parseInt(color.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
};

// Every point is time/price; coordinates are recomputed inside each draw and hit test, so zoom/pan never drifts.
export class DrawingPrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  drawings: Drawing[] = [];
  draft: Drawing | null = null;
  measure: { a: Pt; b: Pt } | null = null;
  selected: string | null = null;
  hidden = false;
  private request = () => {};
  private lastDraw: OverlaySample[] = [];
  private cache: { len: number; last: number; times: number[] } = { len: -1, last: NaN, times: [] };
  constructor(private api: OverlayChart, public minutes: number, private spec: PriceSpec, private colors: Palette, private mobile: boolean) {}
  attached({ requestUpdate }: Parameters<NonNullable<ISeriesPrimitive<Time>['attached']>>[0]) { this.request = requestUpdate; }
  detached() { this.request = () => {}; }
  pause() {}
  samples = () => this.lastDraw;
  update() { this.request(); }
  get step() { return this.minutes * 60; }

  times(): number[] {
    const data = this.api.series.data(), last = data.length ? Number(data[data.length - 1]!.time) : NaN;
    if (data.length !== this.cache.len || last !== this.cache.last) this.cache = { len: data.length, last, times: data.map(d => Number(d.time)) };
    return this.cache.times;
  }
  x(t: number) { return this.api.chart.timeScale().logicalToCoordinate(timeToLogical(this.times(), t, this.step) as Logical); }
  y(p: number) { return this.api.series.priceToCoordinate(p); }
  logicalAt(x: number) { const l = this.api.chart.timeScale().coordinateToLogical(x as Coordinate); return l === null ? null : Number(l); }
  /** Pointer → anchor. Time snaps to the bar under the pointer; magnet snaps price to that bar's OHLC. */
  toPoint(x: number, y: number, magnet: boolean): Pt | null {
    const l = this.logicalAt(x), price = this.api.series.coordinateToPrice(y as Coordinate);
    if (l === null || price === null) return null;
    const idx = Math.round(l), data = this.api.series.data(), bar = data[idx];
    const p = magnet && bar && 'open' in bar ? snapPrice(bar as Bar4, Number(price)) : Number(price);
    return { t: logicalToTime(this.times(), idx, this.step), p };
  }
  private fmt(p: number) { return formatPrice(p, this.spec); }
  private handles(d: Drawing): [Handle, number | null, number | null][] {
    if (d.kind === 'hline' || d.kind === 'hray' || d.kind === 'text') {
      let x: number | null = this.x(d.a.t);
      if (d.kind === 'hline' && x !== null) x = Math.max(12, Math.min(this.api.chart.timeScale().width() - 12, x));
      return [['a', x, this.y(d.a.p)]];
    }
    const out: [Handle, number | null, number | null][] = [['a', this.x(d.a.t), this.y(d.a.p)]];
    if (d.b) out.push(['b', this.x(d.b.t), this.y(d.b.p)]);
    if (d.c && d.b) out.push(['c', this.x(d.b.t), this.y(d.c.p)]);
    return out;
  }

  hit(px: number, py: number): Hit | null {
    if (this.hidden) return null;
    const tol = this.mobile ? 12 : 6, width = this.api.chart.timeScale().width();
    const ordered = [...this.drawings].reverse();
    const sel = ordered.find(d => d.id === this.selected);
    if (sel) for (const [h, x, y] of this.handles(sel)) if (x !== null && y !== null && Math.hypot(px - x, py - y) <= tol + 2) return { id: sel.id, handle: h };
    for (const d of ordered) {
      const xa = this.x(d.a.t), ya = this.y(d.a.p);
      if (xa === null || ya === null) continue;
      const xb = d.b ? this.x(d.b.t) : null, yb = d.b ? this.y(d.b.p) : null;
      let hit = false;
      switch (d.kind) {
        case 'hline': hit = Math.abs(py - ya) <= tol; break;
        case 'hray': hit = px >= xa - tol && px <= width && Math.abs(py - ya) <= tol; break;
        case 'text': { const w = (d.text ?? '').length * 7 + 12; hit = px >= xa - 2 && px <= xa + w && py >= ya - 20 && py <= ya + 2; break; }
        case 'trend': hit = xb !== null && yb !== null && distToSegment(px, py, xa, ya, xb, yb) <= tol; break;
        case 'rect': case 'fib': hit = xb !== null && yb !== null && px >= Math.min(xa, xb) - tol && px <= Math.max(xa, xb) + tol && py >= Math.min(ya, yb) - tol && py <= Math.max(ya, yb) + tol; break;
        case 'long': case 'short': { const yc = d.c ? this.y(d.c.p) : null; hit = xb !== null && yb !== null && yc !== null && px >= Math.min(xa, xb) && px <= Math.max(xa, xb) && py >= Math.min(yb, yc) - tol && py <= Math.max(yb, yc) + tol; break; }
      }
      if (hit) {
        if (d.id === this.selected) for (const [h, x, y] of this.handles(d)) if (x !== null && y !== null && Math.hypot(px - x, py - y) <= tol + 2) return { id: d.id, handle: h };
        return { id: d.id, handle: 'body' };
      }
    }
    return null;
  }

  private label(ctx: Ctx, text: string, x: number, y: number, bg: string, fg: string, align: 'left' | 'center' | 'right' = 'left') {
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10, left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(left, y - 9, w, 18, 3); ctx.fill();
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, left + 5, y);
  }

  private drawOne(ctx: Ctx, d: Drawing, width: number, height: number, draft: boolean) {
    const xa = this.x(d.a.t), ya = this.y(d.a.p);
    if (xa === null || ya === null) return;
    const xb = d.b ? this.x(d.b.t) : null, yb = d.b ? this.y(d.b.p) : null, sel = d.id === this.selected || draft;
    ctx.strokeStyle = d.color; ctx.fillStyle = d.color; ctx.lineWidth = sel ? 2 : 1.5; ctx.setLineDash([]);
    const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    if (!draft) this.lastDraw.push({ name: `Drawing ${d.kind} ${d.id}`, price: d.a.p, drawnY: ya });
    switch (d.kind) {
      case 'hline': line(0, ya, width, ya); break;
      case 'hray': line(xa, ya, width, ya); break;
      case 'trend': if (xb !== null && yb !== null) line(xa, ya, xb, yb); break;
      case 'text': this.label(ctx, d.text || 'Text', xa, ya - 9, alpha(this.colors.labelText, .8), d.color); break;
      case 'rect': if (xb !== null && yb !== null) { ctx.fillStyle = alpha(d.color, .14); ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya)); ctx.strokeRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya)); } break;
      case 'fib': if (xb !== null && yb !== null && d.b) {
        const left = Math.min(xa, xb), right = Math.max(xa, xb);
        let prevY: number | null = null;
        for (const level of FIB_LEVELS) {
          const price = fibPrice(d.a, d.b, level), y = this.y(price);
          if (y === null) continue;
          if (prevY !== null) { ctx.fillStyle = alpha(d.color, level === 0.618 || level === 0.5 ? .12 : .05); ctx.fillRect(left, Math.min(prevY, y), right - left, Math.abs(y - prevY)); }
          ctx.lineWidth = level === 0.5 || level === 0.618 ? 1.5 : 1; line(left, y, right, y);
          ctx.fillStyle = d.color; ctx.font = '10px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
          ctx.fillText(`${level} (${this.fmt(price)})`, left + 3, y - 2);
          prevY = y;
        }
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1; line(xa, ya, xb, yb); ctx.setLineDash([]);
      } break;
      case 'long': case 'short': if (xb !== null && yb !== null && d.b && d.c) {
        const yc = this.y(d.c.p); if (yc === null) break;
        const left = Math.min(xa, xb), w = Math.max(24, Math.abs(xb - xa)), rr = riskReward(d.a.p, d.b.p, d.c.p);
        ctx.fillStyle = alpha(this.colors.up, .18); ctx.fillRect(left, Math.min(ya, yb), w, Math.abs(yb - ya));
        ctx.fillStyle = alpha(this.colors.down, .18); ctx.fillRect(left, Math.min(ya, yc), w, Math.abs(yc - ya));
        ctx.strokeStyle = this.colors.muted; ctx.lineWidth = 1; line(left, ya, left + w, ya);
        const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
        this.label(ctx, `Target ${this.fmt(d.b.p)} (${pct(rr.targetPct)})`, left + w / 2, yb + (yb < ya ? -11 : 11), this.colors.up, this.colors.labelText, 'center');
        this.label(ctx, `Stop ${this.fmt(d.c.p)} (${pct(rr.stopPct)})`, left + w / 2, yc + (yc > ya ? 11 : -11), this.colors.down, this.colors.labelText, 'center');
        this.label(ctx, `${d.kind === 'long' ? 'Long' : 'Short'} · R:R ${rr.ratio.toFixed(2)}`, left + w / 2, ya, alpha(this.colors.labelText, .85), this.colors.muted, 'center');
      } break;
    }
    if (sel) for (const [, x, y] of this.handles(d)) if (x !== null && y !== null) { ctx.beginPath(); ctx.arc(x, y, this.mobile ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = this.colors.labelText; ctx.fill(); ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; ctx.stroke(); }
    void height;
  }

  private drawMeasure(ctx: Ctx) {
    const m = this.measure; if (!m) return;
    const xa = this.x(m.a.t), ya = this.y(m.a.p), xb = this.x(m.b.t), yb = this.y(m.b.p);
    if (xa === null || ya === null || xb === null || yb === null) return;
    const s = measureStats(m.a, m.b, this.minutes), color = s.delta >= 0 ? this.colors.up : this.colors.down;
    ctx.fillStyle = alpha(color, .16); ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    const sign = s.delta >= 0 ? '+' : '−';
    this.label(ctx, `${sign}${this.fmt(Math.abs(s.delta))} (${sign}${Math.abs(s.pct).toFixed(2)}%) · ${Math.abs(s.bars)} bars`, (xa + xb) / 2, Math.max(ya, yb) + 14, color, this.colors.labelText, 'center');
  }

  private views: IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => ({ draw: target => {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.lastDraw = [];
      if (this.hidden && !this.draft && !this.measure) return;
      ctx.save();
      if (!this.hidden) for (const d of this.drawings) this.drawOne(ctx, d, mediaSize.width, mediaSize.height, false);
      if (this.draft) this.drawOne(ctx, this.draft, mediaSize.width, mediaSize.height, true);
      this.drawMeasure(ctx);
      ctx.restore();
    });
  } }) }];
  paneViews() { return this.views; }

  private axisViews: ISeriesPrimitiveAxisView[] = [];
  priceAxisViews() {
    if (this.hidden) return [];
    const levels = this.drawings.filter(d => d.kind === 'hline' || d.kind === 'hray' || d.id === this.selected);
    this.axisViews = levels.map(d => ({
      coordinate: () => this.y(d.a.p) ?? -1000,
      text: () => this.fmt(d.a.p),
      textColor: () => textOn(d.color),
      backColor: () => d.color,
      visible: () => d.kind !== 'text' || d.id === this.selected,
      tickVisible: () => true,
    }));
    return this.axisViews;
  }
}
