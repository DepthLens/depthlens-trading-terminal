// Spot forex candles from the shared forex_candles table (Twelve Data via server functions only). Never opens sockets.
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { isBasePair, mergeFx, priceDigits, type ForexTf, type FxBar } from '@/lib/forex-data';
import { openForexPair, syncForex } from '@/lib/forex.functions';
import { toColor } from '@/components/PopoutChart';
import { DrawingTools } from '@/components/DrawingTools';
import type { ProfileChart } from '@/components/VolumeProfile';

const TF_MINUTES: Record<ForexTf, number> = { '1h': 60, '4h': 240, '1d': 1440, '1w': 10080, '1M': 43200 };

type Row = { time: number; open: number; high: number; low: number; close: number };
const num = (r: Row): FxBar => ({ time: Number(r.time), open: r.open, high: r.high, low: r.low, close: r.close });

export async function loadFx(pair: string, tf: ForexTf): Promise<FxBar[]> {
  const q = (t: string) => supabase.from('forex_candles').select('time,open,high,low,close').eq('pair', pair).eq('tf', t);
  if (tf === '1h') { const { data, error } = await q('1h').order('time', { ascending: false }).limit(1000); if (error) throw error; return mergeFx([], (data as Row[]).map(num), '1h'); }
  const { data: saved, error } = await q(tf).order('time', { ascending: true }).limit(1000); if (error) throw error;
  const bars = (saved as Row[]).map(num), from = bars.length ? bars[bars.length - 1]!.time : 0;
  const { data: hours, error: e2 } = await q('1h').gte('time', from).order('time', { ascending: true }).limit(1000); if (e2) throw e2;
  return mergeFx(bars, (hours as Row[]).map(num), tf);
}

export function ForexChart({ pair, tf, theme, onNote, mobile = false }: { pair: string; tf: ForexTf; theme: string; onNote: (text: string) => void; mobile?: boolean }) {
  const drawApi = useRef<ProfileChart | null>(null);
  const [revision, setRevision] = useState(0);
  const [bars, setBars] = useState<FxBar[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tick, setTick] = useState(0);
  const [opening, setOpening] = useState(false);
  const openPair = useServerFn(openForexPair), sync = useServerFn(syncForex);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<{ chart: IChartApi; series: ISeriesApi<'Candlestick'> } | null>(null);
  const noteRef = useRef(onNote); noteRef.current = onNote;

  useEffect(() => {
    if (isBasePair(pair)) return;
    let on = true, timer: ReturnType<typeof setTimeout> | undefined;
    const run = (first: boolean) => { if (first) setOpening(true); openPair({ data: { pair } }).then(r => {
      if (!on) return;
      if (r.status === 'busy') { timer = setTimeout(() => run(true), 5000); return; }
      setOpening(false);
      noteRef.current(r.status === 'paused' ? 'Update paused (data limit)' : r.status === 'error' || r.status === 'invalid' ? r.message ?? 'Could not load this pair' : '');
      if (r.status === 'loaded' || r.status === 'updated') setTick(t => t + 1);
    }).catch(() => on && setOpening(false)); };
    run(true); const id = setInterval(() => run(false), 5 * 60_000);
    return () => { on = false; clearInterval(id); if (timer) clearTimeout(timer); };
  }, [pair, openPair]);
  useEffect(() => { if (!isBasePair(pair)) return; const run = () => { sync().then(r => { if ('limited' in r && r.limited) noteRef.current('Update paused (data limit)'); if (r.ran && 'saved' in r && r.saved) setTick(t => t + 1); }).catch(() => {}); setTick(t => t + 1); }; run(); const id = setInterval(run, 5 * 60_000); return () => clearInterval(id); }, [sync, pair]);
  useEffect(() => { let on = true; setPhase('loading'); loadFx(pair, tf).then(b => { if (on) { setBars(b); setPhase('ready'); } }).catch(() => on && setPhase('error')); return () => { on = false; }; }, [pair, tf, tick]);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const text = toColor(el, '--t-muted'), border = toColor(el, '--t-border'), grid = getComputedStyle(el).getPropertyValue('--t-grid').trim() || border;
    const up = toColor(el, '--flow-up'), down = toColor(el, '--flow-down'), cross = getComputedStyle(el).getPropertyValue('--t-crosshair').trim() || text;
    const line = { color: cross, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: border };
    const c = createChart(el, { autoSize: true, localization: { locale: 'en-US' }, layout: { background: { color: 'transparent' }, textColor: text }, grid: { vertLines: { color: grid }, horzLines: { color: grid } }, crosshair: { mode: CrosshairMode.MagnetOHLC, vertLine: line, horzLine: line }, rightPriceScale: { borderColor: border }, timeScale: { borderColor: border, timeVisible: true, rightOffset: 6 } });
    const series = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    chart.current = { chart: c, series };
    const api: ProfileChart = { chart: c, series, probes: new Set(), host: el, disposed: false, colors: { up, down, muted: text, poc: toColor(el, '--flow-poc'), unsplit: toColor(el, '--flow-unsplit'), valueArea: toColor(el, '--flow-value-area'), labelText: toColor(el, '--t-bg') } };
    drawApi.current = api; setRevision(v => v + 1);
    return () => { api.disposed = true; drawApi.current = null; chart.current = null; c.remove(); };
  }, [theme]);
  useEffect(() => {
    const c = chart.current; if (!c) return;
    const digits = priceDigits(pair);
    c.series.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } });
    c.series.setData(bars.map(b => ({ ...b, time: b.time as UTCTimestamp })));
    c.chart.timeScale().fitContent();
  }, [bars, pair, theme]);

  const digits = priceDigits(pair);
  return <div className="absolute inset-0 flex">
    <DrawingTools chartRef={drawApi} hostRef={host} symbol={`fx-${pair}`} minutes={TF_MINUTES[tf]} spec={{ precision: digits, minMove: 1 / 10 ** digits }} mobile={mobile} revision={revision} />
    <div className="relative min-w-0 flex-1">
    <div ref={host} className="absolute inset-0" data-testid="fx-chart" data-bars={bars.length} />
    {opening && !bars.length && phase !== 'error' && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted">Downloading {pair} history...</div>}
    {phase === 'loading' && !opening && !bars.length && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted">Loading candles...</div>}
    {phase === 'ready' && !opening && !bars.length && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted">No candles saved for {pair} yet.</div>}
    {phase === 'error' && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted"><div className="text-center">Could not load forex candles.<button type="button" onClick={() => setTick(t => t + 1)} className="ml-2 rounded bg-t-accent px-3 py-1 font-semibold text-t-accent-fg">Retry</button></div></div>}
    <span className="pointer-events-none absolute bottom-8 left-2 text-[10px] text-t-muted">Forex data delayed, volume = tick volume</span>
    </div>
  </div>;
}
