import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

// Binance native intervals; anything else is built from 1m candles.
const NATIVE: Record<number, string> = { 1: "1m", 5: "5m", 15: "15m", 30: "30m", 60: "1h", 240: "4h", 1440: "1d" };

function readVar(el: HTMLElement, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function toColor(el: HTMLElement, name: string) {
  // Resolve oklch var to rgb via a probe element (canvas needs a concrete color).
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  el.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c || readVar(el, name);
}

export function aggregate(bars: Bar[], minutes: number): Bar[] {
  const ms = minutes * 60_000;
  const out: Bar[] = [];
  for (const b of bars) {
    const t = Math.floor(b.time / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else out.push({ ...b, time: t });
  }
  return out;
}

const parseK = (k: unknown[]): Bar => ({
  time: Number(k[0]),
  open: +String(k[1]),
  high: +String(k[2]),
  low: +String(k[3]),
  close: +String(k[4]),
  volume: +String(k[5]),
});

export function PriceChart({ symbol, minutes, theme }: { symbol: string; minutes: number; theme: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const text = toColor(el, "--t-muted");
    const grid = toColor(el, "--t-border");
    const up = toColor(el, "--t-up");
    const down = toColor(el, "--t-down");

    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid, scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderColor: grid, timeVisible: true },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
    });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const native = NATIVE[minutes];
    const fetchInterval = native ?? "1m";
    const limit = native ? 1000 : Math.min(1500, Math.max(500, minutes * 300));
    let bars: Bar[] = [];
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;

    const push = (b: Bar) => {
      const t = (b.time / 1000) as UTCTimestamp;
      candles.update({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
      vol.update({ time: t, value: b.volume, color: b.close >= b.open ? up + "" : down + "" });
    };
    const setAll = () => {
      candles.setData(bars.map((b) => ({ time: (b.time / 1000) as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
      vol.setData(bars.map((b) => ({ time: (b.time / 1000) as UTCTimestamp, value: b.volume, color: b.close >= b.open ? up : down })));
    };

    // For custom TFs: keep raw 1m bars of the current bucket to rebuild it on each tick.
    let oneMin: Bar[] = [];

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${fetchInterval}`);
      ws.onopen = () => (delay = 1000);
      ws.onmessage = (e) => {
        const k = JSON.parse(e.data).k;
        if (!k) return;
        const b: Bar = { time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
        if (native) return push(b);
        const ms = minutes * 60_000;
        const bucket = Math.floor(b.time / ms) * ms;
        oneMin = oneMin.filter((x) => x.time >= bucket && x.time !== b.time);
        oneMin.push(b);
        const agg = aggregate(oneMin, minutes)[0];
        if (agg) push(agg);
      };
      ws.onclose = () => {
        if (closed) return;
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
      };
      ws.onerror = () => ws?.close();
    };

    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${fetchInterval}&limit=${limit}`)
      .then((r) => r.json())
      .then((raw: unknown[][]) => {
        if (closed || !Array.isArray(raw)) return;
        const parsed = raw.map(parseK);
        if (native) bars = parsed;
        else {
          bars = aggregate(parsed, minutes);
          const ms = minutes * 60_000;
          const lastBucket = bars[bars.length - 1]?.time ?? 0;
          oneMin = parsed.filter((x) => Math.floor(x.time / ms) * ms === lastBucket);
        }
        setAll();
        chart.timeScale().scrollToRealTime();
        connect();
      })
      .catch(() => connect());

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
      chart.remove();
    };
  }, [symbol, minutes, theme]);

  return <div ref={ref} className="h-full w-full" />;
}
