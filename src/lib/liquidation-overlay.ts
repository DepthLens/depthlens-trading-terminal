import type { ISeriesPrimitive, IPrimitivePaneView, Time, UTCTimestamp } from 'lightweight-charts';
import type { OverlayChart, OverlayProbe, OverlaySample } from './chart-overlays';
import { whaleCandleTime } from './whale-data';
import { formatLiq, liqRadius, type LiqBubble } from './liquidation-data';
// Price/time anchored bubbles; coordinates are derived on every draw (PROTECT overlay rules).
export class LiquidationPrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  bubbles: LiqBubble[] = []; private request = () => {}; private drawn: OverlaySample[] = [];
  constructor(private api: OverlayChart, private minutes: number, private colors: { up: string; down: string; outline: string; text: string }) {}
  attached({ requestUpdate }: Parameters<NonNullable<ISeriesPrimitive<Time>['attached']>>[0]) { this.request = requestUpdate; }
  detached() { this.request = () => {}; }
  paused = false; pause(v: boolean) { this.paused = v; }
  samples = () => this.drawn; refresh() { this.request(); }
  positions() {
    const scale = this.api.chart.timeScale(), h = this.api.chart.paneSize(0).height, w = scale.width(), out: { b: LiqBubble; x: number; y: number; r: number }[] = [];
    for (const b of this.bubbles) {
      const x = scale.timeToCoordinate(whaleCandleTime(b.time, this.minutes) as UTCTimestamp), y = this.api.series.priceToCoordinate(b.price);
      if (x === null || y === null || x < -30 || x > w + 30 || y < -30 || y > h + 30) continue;
      out.push({ b, x, y, r: liqRadius(b.notional) });
    }
    return out;
  }
  at(x: number, y: number) { return this.positions().reverse().find(p => (x - p.x) ** 2 + (y - p.y) ** 2 <= p.r ** 2)?.b; }
  private views: IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => ({ draw: target => target.useMediaCoordinateSpace(({ context: ctx }) => {
    this.drawn = [];
    for (const { b, x, y, r } of this.positions()) {
      ctx.globalAlpha = .45; ctx.fillStyle = b.liq === 'short' ? this.colors.up : this.colors.down;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .9; ctx.strokeStyle = this.colors.outline; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      if (r >= 14) { ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = this.colors.text; ctx.fillText(formatLiq(b.notional), x, y); }
      this.drawn.push({ name: 'Liquidation bubble', price: b.price, drawnY: y });
    }
  }) }) }];
  paneViews() { return this.views; }
}
