import type { IChartApi, IPanePrimitive, IPanePrimitivePaneView, Time, UTCTimestamp } from 'lightweight-charts';
import type { CvdBar } from './cvd-data';

// Reset marks are anchored to time and drawn by the native CVD pane.
export class CvdResetPrimitive implements IPanePrimitive<Time> {
  times: number[] = [];
  private request = () => {};
  constructor(private chart: IChartApi, private color: string) {}
  attached({ requestUpdate }: Parameters<NonNullable<IPanePrimitive<Time>['attached']>>[0]) { this.request = requestUpdate; }
  detached() { this.request = () => {}; }
  setBars(bars: CvdBar[]) { this.times = bars.filter(b => b.reset).map(b => b.time); this.request(); }
  private views: IPanePrimitivePaneView[] = [{ zOrder: () => 'bottom', renderer: () => ({ draw: target => {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.strokeStyle = this.color; context.globalAlpha = .25; context.lineWidth = 1; context.setLineDash([2,4]);
      for (const time of this.times) {
        const x = this.chart.timeScale().timeToCoordinate(time / 1000 as UTCTimestamp);
        if (x === null || x < 0 || x > mediaSize.width) continue;
        context.beginPath(); context.moveTo(x,0); context.lineTo(x,mediaSize.height); context.stroke();
      }
      context.setLineDash([]); context.globalAlpha = 1;
    });
  } }) }];
  paneViews() { return this.views; }
}

export async function checkPaneAlignment(chart: IChartApi) {
  const main = chart.panes()[0], subs = chart.panes().slice(1), cvd = subs[0], range = chart.timeScale().getVisibleLogicalRange();
  if (!main || !cvd || !range) return [{ name: 'CVD pane present', pass: false, error: Infinity }];
  const results: { name: string; pass: boolean; error: number; main?: number; cvd?: number }[] = [];
  const wait = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  try {
    for (const factor of [1,.75,1.25]) {
      const span = (range.to-range.from)*factor;
      chart.timeScale().setVisibleLogicalRange({ from: range.from+3, to: range.from+3+span }); await wait();
      // Native panes share one time scale. Measure the rendered pane origins and widths,
      // not a second hand-maintained transform. Compare a real candle's global x coordinate.
      const candle = main.getSeries()[0]?.data().find(b => chart.timeScale().timeToCoordinate(b.time) !== null);
      const x = candle ? chart.timeScale().timeToCoordinate(candle.time) : null;
      const mainBox = main.getHTMLElement()?.getBoundingClientRect();
      for (const sub of subs) {
        const i = sub.paneIndex(), name = i === 1 && subs.length === 1 ? 'CVD' : `Pane ${i}`;
        const sx = (sub.getSeries()[0] && candle) ? chart.timeScale().timeToCoordinate(candle.time) : x;
        const cvdBox = sub.getHTMLElement()?.getBoundingClientRect();
        const error = x === null || sx === null || !mainBox || !cvdBox ? Infinity : Math.abs(mainBox.left+x-(cvdBox.left+sx));
        const a = chart.priceScale('right',0).width(), b = chart.priceScale('right',i).width();
        results.push({ name: `${name} candle x (${factor})`, pass: error <= 1, error });
        results.push({ name: `${name} right axes (${factor})`, pass: Math.abs(a-b) <= 1, error: Math.abs(a-b), main:a, cvd:b });
        const widthError = Math.abs((mainBox?.width ?? NaN)-(cvdBox?.width ?? NaN));
        results.push({ name: `${name} pane width (${factor})`, pass: widthError <= 1, error: widthError });
      }
    }
  } finally { chart.timeScale().setVisibleLogicalRange(range); await wait(); }
  for (const r of results) console.info(`[DepthLens] ${r.name}: ${r.pass ? 'PASS' : 'FAIL'} (${r.error.toFixed(2)}px)`);
  return results;
}