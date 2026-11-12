import { useEffect, useRef, type MutableRefObject } from 'react';
import { HistogramSeries, LineStyle, type UTCTimestamp } from 'lightweight-charts';
import type { ProfileChart } from './VolumeProfile';
import { bucketLiq, formatLiq, liqThreshold, mergeLiq, type LiqBar, type LiqSettings } from '@/lib/liquidation-data';
import { liqStore, liquidationFeed } from '@/lib/liquidation-store';
import { LiquidationPrimitive } from '@/lib/liquidation-overlay';
import { checkPaneAlignment, paneLabels } from '@/lib/cvd-pane';
import { toolDemoEnabled, demoLiquidations } from '@/lib/tool-demo';
import type { PriceSpec } from '@/lib/market-data';

export function Liquidations({ chartRef, hostRef, source, symbol, minutes, spec, settings, mobile, revision, onHeight }: { chartRef: MutableRefObject<ProfileChart | null>; hostRef: MutableRefObject<HTMLDivElement | null>; source: 'binance' | 'bybit'; symbol: string; minutes: number; spec: PriceSpec; settings: LiqSettings; mobile: boolean; revision: number; onHeight: (ratio: number) => void }) {
  const legendRef = useRef<HTMLDivElement>(null), noteRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(onHeight); heightRef.current = onHeight;
  useEffect(() => {
    const api = chartRef.current, host = hostRef.current, legend = legendRef.current, note = noteRef.current;
    if (!api || api.disposed || !host || !legend || !note) return;
    const chart = api.chart, demo = toolDemoEnabled(), store = liqStore(source, symbol);
    const pane = chart.addPane();
    const fmt = { type: 'custom' as const, formatter: formatLiq, minMove: .01 };
    const shortS = chart.addSeries(HistogramSeries, { priceFormat: fmt, priceLineVisible: false, lastValueVisible: false, color: api.colors.up }, pane.paneIndex());
    const longS = chart.addSeries(HistogramSeries, { priceFormat: fmt, priceLineVisible: false, lastValueVisible: false, color: api.colors.down }, pane.paneIndex());
    shortS.priceScale().applyOptions({ minimumWidth: 84 }); paneLabels.set(shortS, 'Liquidations');
    shortS.createPriceLine({ price: 0, color: api.colors.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
    const css = getComputedStyle(host).getPropertyValue('--fp-text').trim() || api.colors.muted;
    const primitive = new LiquidationPrimitive(api, minutes, { up: api.colors.up, down: api.colors.down, outline: css, text: css });
    api.series.attachPrimitive(primitive); api.probes.add(primitive);
    const unsub = demo ? () => {} : liquidationFeed(source, symbol);
    let rows: LiqBar[] = [], hover: number | null = null, disposed = false, lastH = 0;
    const position = () => {
      const el = pane.getHTMLElement(); if (!el || !host.parentElement) return;
      const top = el.getBoundingClientRect().top - host.parentElement.getBoundingClientRect().top;
      legend.style.top = `${Math.round(top + 6)}px`; note.style.top = `${Math.round(top + pane.getHeight() - 18)}px`;
      host.parentElement.style.setProperty('--liq-h', `${pane.getHeight() + 2 + (host.parentElement.style.getPropertyValue('--cvd-h') ? 0 : chart.timeScale().height())}px`);
      if (lastH && Math.abs(lastH - pane.getHeight()) > 1) heightRef.current(pane.getHeight() / Math.max(1, chart.paneSize(0).height + pane.getHeight()));
      lastH = pane.getHeight();
    };
    const size = () => { const total = chart.paneSize(0).height + pane.getHeight(); pane.setHeight(Math.max(90, Math.round(total * (settings.height ?? .16)))); lastH = 0; position(); };
    const showLegend = () => {
      const b = hover === null ? rows.at(-1) : rows.find(r => r.time === hover), u = settings.unit === 'coin' ? spec.baseAsset ?? 'coin' : 'USDT';
      legend.textContent = `Liquidations (${u})   Long ${b ? formatLiq(b.long) : '—'}   Short ${b ? formatLiq(b.short) : '—'}   Net ${b ? formatLiq(b.short - b.long) : '—'}`;
    };
    const render = () => {
      if (disposed || api.disposed) return;
      const bars = api.series.data().filter(b => 'open' in b).map(b => ({ ...(b as any), time: Number(b.time) * 1000 }));
      let events = demo ? demoLiquidations(bars) : store.events;
      if (settings.side !== 'Both') events = events.filter(e => e.side === settings.side.toLowerCase());
      rows = bucketLiq(events, minutes, settings.unit);
      const map = new Map(rows.map(r => [r.time / 1000, r])), times = bars.map(b => b.time / 1000);
      shortS.setData(times.map(t => map.get(t) ? { time: t as UTCTimestamp, value: map.get(t)!.short } : { time: t as UTCTimestamp }));
      longS.setData(times.map(t => map.get(t) ? { time: t as UTCTimestamp, value: -map.get(t)!.long } : { time: t as UTCTimestamp }));
      const threshold = liqThreshold(settings, events, Date.now());
      const from = Number(chart.timeScale().getVisibleRange()?.from ?? 0) * 1000 - minutes * 60000;
      primitive.bubbles = settings.bubbles ? mergeLiq(events.filter(e => e.time >= from), spec.minMove).filter(b => b.notional >= threshold) : [];
      primitive.refresh(); showLegend(); position();
      const since = demo ? bars[0]?.time : store.since;
      note.textContent = `${demo ? 'DEMO DATA · ' : ''}${store.unavailable && source === 'bybit' && !demo ? 'Bybit liquidations unavailable' : `Liquidations since ${since ? new Date(since).toISOString().slice(11, 16) : '—'}`}${source === 'binance' ? ' · Binance: largest per second' : ''}`;
      host.dataset['liqRows'] = String(rows.length); host.dataset['liqBubbles'] = String(primitive.bubbles.length);
    };
    const crosshair: Parameters<typeof chart.subscribeCrosshairMove>[0] = e => { hover = e.time === undefined ? null : Number(e.time) * 1000; showLegend(); };
    chart.subscribeCrosshairMove(crosshair); store.listeners.add(render);
    const timer = setInterval(render, 1000), observer = new ResizeObserver(position); observer.observe(host);
    const alignment = () => checkPaneAlignment(chart); (window as Window & { checkPaneAlignment?: typeof alignment }).checkPaneAlignment = alignment;
    size(); render();
    return () => {
      disposed = true; clearInterval(timer); observer.disconnect(); unsub(); store.listeners.delete(render); api.probes.delete(primitive);
      host.parentElement?.style.removeProperty('--liq-h');
      if (!api.disposed) { chart.unsubscribeCrosshairMove(crosshair); api.series.detachPrimitive(primitive); chart.removePane(pane.paneIndex()); }
    };
  }, [chartRef, hostRef, source, symbol, minutes, spec, settings, mobile, revision]);
  return <><div ref={legendRef} data-testid="liq-legend" className="pointer-events-none absolute left-3 z-10 whitespace-pre text-xs tabular-nums text-t-muted"/><div ref={noteRef} data-testid="liq-note" className="pointer-events-none absolute left-3 z-10 truncate text-[10px] text-t-muted"/></>;
}
