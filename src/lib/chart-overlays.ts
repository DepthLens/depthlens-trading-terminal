import type { IChartApi, IPriceLine, ISeriesApi, ISeriesPrimitive, IPrimitivePaneView, ISeriesPrimitiveAxisView, Time } from 'lightweight-charts';
import { clockOffset, type TradeSource } from './live-price';
import { candleCountdown } from './candle-timer';
import type { ProfileRow, ProfileSettings } from './volume-profile';
import type { PriceSpec } from './market-data';
import { formatPrice } from './market-data';

export type CandleSeries = ISeriesApi<'Candlestick'>;
export type OverlaySample = { name: string; price: number; drawnY: number | null; offset?: number };
export type OverlayProbe = { samples: () => OverlaySample[]; pause: (value: boolean) => void };
export type OverlayChart = { chart: IChartApi; series: CandleSeries; probes: Set<OverlayProbe>; host: HTMLElement };
export type Palette = { up: string; down: string; unsplit: string; poc: string; muted: string; labelText: string };

// This primitive retains price/volume only. Pixel coordinates are derived inside each draw/hit test.
export class ProfilePrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  rows: ProfileRow[] = [];
  split = false;
  total = 0;
  private request = () => {};
  // Measurements are diagnostic output only, never input to the renderer.
  private lastDraw: OverlaySample[] = [];
  paused = false;
  constructor(private api: OverlayChart, public settings: ProfileSettings, private colors: Palette, private mobile: boolean) {}
  attached({ requestUpdate }: Parameters<NonNullable<ISeriesPrimitive<Time>['attached']>>[0]) { this.request = requestUpdate; }
  detached() { this.request = () => {}; }
  pause(value: boolean) { this.paused = value; }
  samples = () => this.lastDraw;
  refresh() { this.request(); }
  private views: IPrimitivePaneView[] = [{ zOrder: () => 'normal', renderer: () => ({ draw: target => {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const peak = Math.max(0, ...this.rows.map(r => r.volume));
      this.lastDraw = [];
      if (!peak) return;
      const width = mediaSize.width * (this.mobile ? .12 : .2);
      for (const row of this.rows) {
        if (!row.volume) continue;
        const a = this.api.series.priceToCoordinate(row.high), b = this.api.series.priceToCoordinate(row.low);
        if (a === null || b === null) continue;
        const bar = width * row.volume / peak, x = this.settings.position === 'right' ? mediaSize.width - bar : 0;
        this.lastDraw.push({ name: `Histogram ${row.low}`, price: row.high, drawnY: a });
        ctx.globalAlpha = this.settings.opacity * (row.inArea ? 1 : .3);
        const height = Math.max(1, b - a - 1);
        // Row-height probe: a bar is never taller than its own price row.
        this.lastDraw.push({ name: 'Volume Profile bar height', price: row.low, drawnY: a + height > b + 1 ? a + height : b });
        if (this.split && this.settings.split) {
          const buy = bar * row.buy / row.volume;
          ctx.fillStyle = this.colors.up; ctx.fillRect(x, a, buy, height);
          ctx.fillStyle = this.colors.down; ctx.fillRect(x + buy, a, bar - buy, height);
        } else { ctx.fillStyle = this.colors.unsplit; ctx.fillRect(x, a, bar, height); }
      }
      ctx.globalAlpha = 1;
    });
  } }) }];
  paneViews() { return this.views; }
  rowAt(x: number, y: number) {
    const price = this.api.series.coordinateToPrice(y);
    if (price === null) return;
    const row = this.rows.find(r => price >= r.low && price <= r.high && r.volume > 0);
    if (!row) return;
    const peak = Math.max(...this.rows.map(r => r.volume)), w = this.api.chart.timeScale().width();
    const width = w * (this.mobile ? .12 : .2) * row.volume / peak;
    if (this.settings.position === 'right' ? x >= w - width && x <= w : x <= width) return row;
    return undefined;
  }
}

export class CandleTimerPrimitive implements ISeriesPrimitive<Time>, OverlayProbe {
  private request = () => {};
  private interval: ReturnType<typeof setInterval> | undefined;
  private draw: OverlaySample[] = [];
  private latest: { price: number; up: boolean } | null = null;
  private paused = false;
  private timerText = '';
  /** The live price tag is always drawn here (direction colored); the countdown below it is optional. */
  countdown = true;
  setCountdown(on: boolean) { this.countdown = on; if (!on) delete this.api.host.dataset['countdown']; this.request(); }
  constructor(private api: OverlayChart, private minutes: number, private source: () => TradeSource, private colors: Palette, private spec: PriceSpec) {}
  attached({ requestUpdate }: Parameters<NonNullable<ISeriesPrimitive<Time>['attached']>>[0]) {
    this.request = requestUpdate;
    this.tick(); this.interval = setInterval(() => this.tick(), 1000);
  }
  detached() { clearInterval(this.interval); this.request = () => {}; }
  private tick() {
    this.timerText = candleCountdown(Date.now(), this.minutes, clockOffset(this.source())).text;
    if (this.countdown) this.api.host.dataset['countdown'] = this.timerText;
    this.api.host.dataset['clockOffset'] = String(clockOffset(this.source()));
    this.request();
  }
  setPrice(price: number, up: boolean) { if (this.paused) return; this.latest = { price, up }; this.request(); }
  pause(value: boolean) { this.paused = value; }
  samples = () => this.draw;
  private y() { return this.latest ? this.api.series.priceToCoordinate(this.latest.price) : null; }
  private visible() { const y = this.y(); return y !== null && y >= 0 && y <= this.api.chart.paneSize().height; }
  private offset() { return this.api.chart.options().layout.fontSize + 8; }
  private axis: ISeriesPrimitiveAxisView[] = [0, 1].map(index => ({
    coordinate: () => -10000,
    fixedCoordinate: () => {
      const y = this.y();
      if (y === null) return undefined;
      const offset = index ? this.offset() : 0;
      return y + offset;
    },
    text: () => index ? this.timerText : this.latest ? formatPrice(this.latest.price, this.spec) : '',
    textColor: () => this.colors.labelText,
    backColor: () => this.latest?.up ? this.colors.up : this.colors.down,
    visible: () => this.visible() && (index === 0 || this.countdown), tickVisible: () => index === 0,
  }));
  priceAxisViews() { return this.axis; }
  private axisPane: IPrimitivePaneView[] = [{ renderer: () => ({ draw: () => {
    const y = this.y(); this.draw = [];
    if (y === null || !this.latest || !this.visible()) return;
    // These are the actual fixed positions consumed by lightweight-charts axis renderers.
    for (const [i, view] of this.axis.entries()) if (i === 0 || this.countdown) this.draw.push({ name: i ? 'Candle timer' : 'Live price tag', price: this.latest.price, drawnY: view.fixedCoordinate?.() ?? null, offset: i ? this.offset() : 0 });
    this.api.host.dataset['timerY'] = String(y + this.offset());
  } }) }];
  priceAxisPaneViews() { return this.axisPane; }
}

// Native price-line diagnostics use the chart's rendered screenshot, not a duplicate price calculation.
export function nativeLineSample(api: OverlayChart, name: string, line: IPriceLine): OverlaySample {
  const price = line.options().price, expected = api.series.priceToCoordinate(price);
  if (expected === null || expected < 0 || expected >= api.chart.paneSize().height) return { name, price, drawnY: null };
  const shot = api.chart.takeScreenshot(), ctx = shot.getContext('2d');
  if (!ctx) return { name, price, drawnY: null };
  const color = document.createElement('canvas').getContext('2d');
  if (!color) return { name, price, drawnY: null };
  color.fillStyle = line.options().color; color.fillRect(0, 0, 1, 1);
  const rgb = color.getImageData(0, 0, 1, 1).data;
  const ratio = window.devicePixelRatio || 1;
  const w = api.chart.timeScale().width(), left = Math.round(w * .3 * ratio), right = Math.round(w * .6 * ratio);
  let best = -1, drawnY: number | null = null;
  for (let y = Math.max(0, Math.floor((expected - 4) * ratio)); y <= Math.min(shot.height - 1, Math.ceil((expected + 4) * ratio)); y++) {
    const pixels = ctx.getImageData(left, y, Math.max(1, right - left), 1).data;
    let hits = 0;
    for (let x = 0; x < pixels.length; x += 4) if ([0, 1, 2].every(c => Math.abs((pixels[x + c] ?? 0) - (rgb[c] ?? 0)) <= 3)) hits++;
    if (hits > best && hits > (right - left) * .25) { best = hits; drawnY = (y + .5) / ratio; }
  }
  return { name, price, drawnY };
}

export async function checkOverlayStability(api: OverlayChart) {
  const range = api.chart.timeScale().getVisibleLogicalRange(), priceRange = api.series.priceScale().getVisibleRange();
  if (!range || !priceRange) return [{ name: 'Chart data', pass: false, error: Infinity }];
  const autoScale = api.series.priceScale().options().autoScale;
  for (const probe of api.probes) probe.pause(true);
  const results = new Map<string, { name: string; pass: boolean; error: number }>();
  const wait = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  try {
    for (const factor of [1, .8, 1.2]) {
      const span = range.to - range.from, pspan = priceRange.to - priceRange.from;
      api.chart.timeScale().setVisibleLogicalRange({ from: range.from + span * (1 - factor), to: range.to + 3 });
      api.series.priceScale().setVisibleRange({ from: priceRange.from - pspan * (1 - factor) / 2, to: priceRange.to + pspan * (1 - factor) / 2 });
      await wait();
      for (const probe of api.probes) for (const sample of probe.samples()) {
        const expected = api.series.priceToCoordinate(sample.price);
        if (expected === null || expected < 0 || expected >= api.chart.paneSize().height) continue;
        const error = sample.drawnY === null ? Infinity : Math.abs(sample.drawnY - (sample.offset ?? 0) - expected);
        const old = results.get(sample.name);
        results.set(sample.name, { name: sample.name, pass: (old?.pass ?? true) && error <= 1, error: Math.max(old?.error ?? 0, error) });
      }
    }
  } finally {
    api.chart.timeScale().setVisibleLogicalRange(range); api.series.priceScale().setVisibleRange(priceRange);
    api.series.priceScale().applyOptions({ autoScale }); await wait();
    for (const probe of api.probes) probe.pause(false);
  }
  if (!results.size) results.set('No rendered overlays', { name: 'No rendered overlays', pass: false, error: Infinity });
  for (const r of results.values()) console.info(`[DepthLens] Overlay ${r.name}: ${r.pass ? 'PASS' : 'FAIL'} (${r.error.toFixed(2)}px)`);
  return [...results.values()];
}