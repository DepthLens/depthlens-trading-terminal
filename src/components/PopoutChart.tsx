// Standalone chart host for pop-out tool windows. Owns its own lightweight-charts chart with a visible candle
// series, its own kline history load and exactly ONE WebSocket (the source's kline stream). It never imports or
// touches the main chart internals; tools render on it through the same api shape as the main chart.
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, CrosshairMode, LineStyle, type UTCTimestamp } from 'lightweight-charts';
import { aggregate, NATIVE, type Bar } from '@/lib/chart-data';
import type { TradeSource } from '@/lib/live-price';
import type { ProfileChart } from '@/components/VolumeProfile';
import { PricePressure } from '@/components/PricePressure';
import { PP_KEY, PP_DEFAULT, restorePressure, type PpSettings } from '@/lib/price-pressure';
import { PressureStrip } from './PressureStrip';
import type { PressureSection } from '@/lib/popout';
import { priceSpec } from '@/lib/market-data';

function toColor(el: HTMLElement, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || '#8aa0c0';
}

const bybitInterval = (minutes: number) => (minutes === 1440 ? 'D' : String(minutes));

async function loadKlines(symbol: string, minutes: number, source: TradeSource, signal: AbortSignal): Promise<Bar[]> {
  if (source === 'bybit') {
    const native = NATIVE[minutes];
    const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${bybitInterval(native ? minutes : 1)}&limit=1000`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error('History unavailable');
    const d = await r.json();
    const list: unknown[][] = d?.result?.list ?? [];
    if (!list.length) throw new Error('History unavailable');
    const bars = list.map(k => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) })).filter(b => Number.isFinite(b.close)).reverse();
    return native ? bars : aggregate(bars, minutes);
  }
  const native = NATIVE[minutes];
  const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${native ?? '1m'}&limit=${native ? 1000 : 1500}`, { signal });
  if (!r.ok) throw new Error('History unavailable');
  const data: unknown[][] = await r.json();
  if (!Array.isArray(data) || !data.length) throw new Error('History unavailable');
  const bars = data.map(k => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) })).filter(b => Number.isFinite(b.close));
  return native ? bars : aggregate(bars, minutes);
}

export function PopoutChart({ symbol, minutes, source, theme, sections, onStatus }: { symbol: string; minutes: number; source: TradeSource; theme: string; sections: PressureSection[]; onStatus?: (s: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ProfileChart | null>(null);
  const [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState<PpSettings>({ ...PP_DEFAULT });
  useEffect(() => { setSettings(restorePressure(localStorage.getItem(PP_KEY))); }, []);
  const changeSettings = (next: PpSettings) => { setSettings(next); try { localStorage.setItem(PP_KEY, JSON.stringify(next)); } catch {} };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onStatus?.('Connecting');
    const text = toColor(el, '--t-muted'), grid = toColor(el, '--t-border'), up = toColor(el, '--flow-up'), down = toColor(el, '--flow-down');
    const soft = text.replace('rgb(', 'rgba(').replace(')', ',0.75)'), labelBg = toColor(el, '--t-border');
    const line = { color: soft, width: 1 as const, style: LineStyle.Dashed, visible: true, labelVisible: true, labelBackgroundColor: labelBg };
    const chart = createChart(el, {
      autoSize: true,
      localization: { locale: 'en-US' },
      layout: { background: { color: 'transparent' }, textColor: text, panes: { enableResize: true, separatorColor: text, separatorHoverColor: toColor(el, '--flow-unsplit') } },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: CrosshairMode.MagnetOHLC, vertLine: line, horzLine: line },
      rightPriceScale: { visible: true, borderColor: grid, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: grid, timeVisible: true, barSpacing: 8, rightOffset: 8 },
    });
    const candles = chart.addSeries(CandlestickSeries, { visible: true, upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: true, lastValueVisible: true });
    const api: ProfileChart = { chart, series: candles, probes: new Set(), host: el, disposed: false, colors: { up, down, muted: text, poc: toColor(el, '--flow-poc'), unsplit: toColor(el, '--flow-unsplit'), valueArea: toColor(el, '--flow-value-area'), labelText: toColor(el, '--t-bg') } };
    chart.panes()[0]?.setStretchFactor(1.4);
    chartRef.current = api;
    setRevision(v => v + 1);

    let stopped = false, ready = false, ws: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    const abort = new AbortController();
    // Price precision belongs to this popup's active exchange, independent of the main chart.
    const loadPrecision = async () => {
      try {
        const url = source === 'bybit' ? `https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}` : 'https://fapi.binance.com/fapi/v1/exchangeInfo';
        const r = await fetch(url, { signal: abort.signal });
        if (!r.ok) return;
        const d = await r.json();
        const m = source === 'bybit' ? d.result?.list?.[0] : d.symbols?.find((v: { symbol: string }) => v.symbol === symbol);
        if (!m || stopped) return;
        const tick = source === 'bybit' ? m.priceFilter?.tickSize : m.filters?.find((f: { filterType: string }) => f.filterType === 'PRICE_FILTER')?.tickSize;
        const spec = priceSpec({ symbol, pricePrecision: source === 'bybit' ? Number(m.priceScale) || 0 : m.pricePrecision, filters: [{ filterType: 'PRICE_FILTER', tickSize: tick }] });
        candles.applyOptions({ priceFormat: { type: 'price', ...spec } });
        el.dataset.precision = String(spec.precision);
      } catch {}
    };
    void loadPrecision();
    let latest: Bar | undefined;
    const applyBar = (b: Bar) => {
      if (stopped || !ready || !Number.isFinite(b.close)) return;
      latest = b;
      candles.update({ ...b, time: (b.time / 1000) as UTCTimestamp });
      el.dataset.lastClose = String(b.close);
      el.dataset.liveUpdates = String(Number(el.dataset.liveUpdates ?? 0) + 1);
    };
    // Exactly one WebSocket: the source's kline stream for this symbol and timeframe.
    const connect = () => {
      if (stopped || (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN))) return;
      const lower = symbol.toLowerCase();
      const native = NATIVE[minutes];
      if (source === 'bybit') {
        ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
        ws.onopen = () => { attempts = 0; onStatus?.('Live'); ws?.send(JSON.stringify({ op: 'subscribe', args: [`kline.${bybitInterval(native ? minutes : 1)}.${symbol}`] })); };
        ws.onmessage = ev => {
          try {
            const m = JSON.parse(String(ev.data));
            if (typeof m?.topic === 'string' && m.topic.startsWith('kline.') && Array.isArray(m.data)) {
              for (const k of m.data) {
                const b: Bar = { time: Number(k.start), open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close) };
                if (native) applyBar(b);
                else if (ready && latest) { const t = Math.floor(b.time / (minutes * 60000)) * minutes * 60000; if (t === latest.time) applyBar({ time: t, open: latest.open, high: Math.max(latest.high, b.high), low: Math.min(latest.low, b.low), close: b.close }); else if (t > latest.time) applyBar({ time: t, open: b.open, high: b.high, low: b.low, close: b.close }); }
              }
            }
          } catch {}
        };
      } else {
        ws = new WebSocket(`wss://fstream.binance.com/ws/${lower}@kline_${native ?? '1m'}`);
        ws.onopen = () => { attempts = 0; onStatus?.('Live'); };
        ws.onmessage = ev => {
          try {
            const m = JSON.parse(String(ev.data));
            const k = m?.data?.k ?? m?.k;
            if (!k) return;
            const b: Bar = { time: Number(k.t), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c) };
            if (native) applyBar(b);
            else if (ready && latest) { const t = Math.floor(b.time / (minutes * 60000)) * minutes * 60000; if (t === latest.time) applyBar({ time: t, open: latest.open, high: Math.max(latest.high, b.high), low: Math.min(latest.low, b.low), close: b.close }); else if (t > latest.time) applyBar({ time: t, open: b.open, high: b.high, low: b.low, close: b.close }); }
          } catch {}
        };
      }
      ws.onclose = () => { ws = null; if (!stopped) { onStatus?.('Reconnecting'); retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++) + Math.random() * 250); } };
      ws.onerror = () => ws?.close();
    };
    const load = async () => {
      try {
        const bars = await loadKlines(symbol, minutes, source, abort.signal);
        if (stopped) return;
        latest = bars.at(-1);
        candles.setData(bars.map(b => ({ ...b, time: (b.time / 1000) as UTCTimestamp })));
        el.dataset.candles = String(bars.length);
        el.dataset.lastClose = String(latest?.close ?? '');
        ready = true;
        chart.timeScale().scrollToRealTime();
        onStatus?.('Live');
        connect();
      } catch {
        if (stopped) return;
        onStatus?.('History unavailable · retrying');
        retry = setTimeout(load, 5000);
      }
    };
    void load();
    return () => { stopped = true; api.disposed = true; abort.abort(); clearTimeout(retry); const s = ws; ws = null; s?.close(); chartRef.current = null; chart.remove(); };
  }, [symbol, minutes, source, theme]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="popout-chart">
      <div ref={ref} data-testid="popup-candles" className="min-h-0 flex-1" />
      {chartRef.current && <PopupSections key={`${revision}:${sections.join(',')}`} chartRef={chartRef} hostRef={ref} symbol={symbol} minutes={minutes} sections={sections} settings={settings} onChange={changeSettings} revision={revision} />}
    </div>
  );
}

function PopupSections({ chartRef, hostRef, symbol, minutes, sections, settings, onChange, revision }: { chartRef: React.MutableRefObject<ProfileChart | null>; hostRef: React.MutableRefObject<HTMLDivElement | null>; symbol: string; minutes: number; sections: PressureSection[]; settings: PpSettings; onChange: (s: PpSettings) => void; revision: number }) {
  return <>
    {sections.includes('ca') && <PressureStrip chartRef={chartRef} symbol={symbol} minutes={minutes} />}
    {sections.includes('pp') && <PricePressure chartRef={chartRef} hostRef={hostRef} symbol={symbol} minutes={minutes} settings={settings} onChange={onChange} mobile={false} revision={revision} cvd={false} floating showCandles />}
  </>;
}
