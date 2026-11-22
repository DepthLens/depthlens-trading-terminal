import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { supabase } from '@/integrations/supabase/client';
import { FOREX_PAIRS, FOREX_TFS, POPULAR_FX, TF_LABEL, isBasePair, mergeFx, normalizePair, priceDigits, type ForexTf, type FxBar } from '@/lib/forex-data';
import { openForexPair, syncForex } from '@/lib/forex.functions';
import { useServerFn } from '@tanstack/react-start';
import { toColor } from '@/components/PopoutChart';

export const Route = createFileRoute('/forex')({
  head: () => ({ meta: [{ title: 'Forex — DepthLens' }, { name: 'description', content: 'Forex candles for major and cross pairs, gold and silver on 1H to 1M timeframes in DepthLens.' }, { property: 'og:title', content: 'Forex — DepthLens' }, { property: 'og:description', content: 'Shared, delayed forex candles for 11 pairs in the DepthLens terminal.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: ForexPage,
});

const KEY = 'depthlens.forex.v1';
const EXTRA_KEY = 'depthlens.forex.extra.v1';
const ORDERFLOW = ['Heatmap', 'Footprint', 'DOM', 'CVD'];
type Row = { time: number; open: number; high: number; low: number; close: number };
const num = (r: Row): FxBar => ({ time: Number(r.time), open: r.open, high: r.high, low: r.low, close: r.close });

/** Reads saved candles of the timeframe plus newer 1h candles from the shared table. Never calls Twelve Data. */
async function loadFx(pair: string, tf: ForexTf): Promise<FxBar[]> {
  const q = (t: string) => supabase.from('forex_candles').select('time,open,high,low,close').eq('pair', pair).eq('tf', t);
  if (tf === '1h') { const { data, error } = await q('1h').order('time', { ascending: false }).limit(1000); if (error) throw error; return mergeFx([], (data as Row[]).map(num), '1h'); }
  const { data: saved, error } = await q(tf).order('time', { ascending: true }).limit(1000); if (error) throw error;
  const bars = (saved as Row[]).map(num), from = bars.length ? bars[bars.length - 1]!.time : 0;
  const { data: hours, error: e2 } = await q('1h').gte('time', from).order('time', { ascending: true }).limit(1000); if (e2) throw e2;
  return mergeFx(bars, (hours as Row[]).map(num), tf);
}

function ForexPage() {
  const [pair, setPair] = useState<string>('EUR/USD');
  const [tf, setTf] = useState<ForexTf>('1d');
  const [bars, setBars] = useState<FxBar[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tick, setTick] = useState(0);
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState<{ pair: string; text: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [query, setQuery] = useState('');
  const [showPopular, setShowPopular] = useState(false);
  const openPair = useServerFn(openForexPair), sync = useServerFn(syncForex);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<{ chart: IChartApi; series: ISeriesApi<'Candlestick'> } | null>(null);

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? '{}'); const x = JSON.parse(localStorage.getItem(EXTRA_KEY) ?? '[]'); if (Array.isArray(x)) setExtras(x.filter((p: unknown) => typeof p === 'string' && normalizePair(p) === p && !isBasePair(p)).slice(0, 30)); if (typeof s.pair === 'string' && normalizePair(s.pair) === s.pair) setPair(s.pair); if (FOREX_TFS.includes(s.tf)) setTf(s.tf); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ pair, tf })); localStorage.setItem(EXTRA_KEY, JSON.stringify(extras)); } catch {} }, [pair, tf, extras]);
  const choose = (raw: string) => { const p = normalizePair(raw); if (!p) { setNote({ pair: raw, text: 'Type a pair like EUR/AUD' }); return; } if (!isBasePair(p)) setExtras(x => (x.includes(p) ? x : [...x, p].slice(-30))); setPair(p); setQuery(''); setShowPopular(false); };
  // Extra pairs: the server downloads history once, then tops up at most hourly. Re-checked every 5 minutes while open.
  useEffect(() => {
    if (isBasePair(pair)) return;
    let on = true, timer: ReturnType<typeof setTimeout> | undefined;
    const run = (first: boolean) => { if (first) setOpening(true); openPair({ data: { pair } }).then(r => {
      if (!on) return;
      if (r.status === 'busy') { timer = setTimeout(() => run(true), 5000); return; }
      setOpening(false);
      setNote(r.status === 'paused' ? { pair, text: 'Update paused (data limit)' } : r.status === 'error' || r.status === 'invalid' ? { pair, text: r.message ?? 'Could not load this pair' } : null);
      if (r.status === 'loaded' || r.status === 'updated') setTick(t => t + 1);
    }).catch(() => on && setOpening(false)); };
    run(true); const id = setInterval(() => run(false), 5 * 60_000);
    return () => { on = false; clearInterval(id); if (timer) clearTimeout(timer); setOpening(false); };
  }, [pair, openPair]);
  // Ask the server to top up the newest 1h candles (it throttles itself), then re-read every 5 minutes.
  useEffect(() => { const run = () => { sync().then(r => { if ('limited' in r && r.limited) setNote({ pair: '*', text: 'Update paused (data limit)' }); if (r.ran && 'saved' in r && r.saved) setTick(t => t + 1); }).catch(() => {}); setTick(t => t + 1); }; run(); const id = setInterval(run, 5 * 60_000); return () => clearInterval(id); }, [sync]);
  useEffect(() => { let on = true; setPhase(p => (bars.length ? p : 'loading')); loadFx(pair, tf).then(b => { if (on) { setBars(b); setPhase('ready'); } }).catch(() => on && setPhase('error')); return () => { on = false; }; }, [pair, tf, tick]);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const text = toColor(el, '--t-muted'), border = toColor(el, '--t-border'), grid = getComputedStyle(el).getPropertyValue('--t-grid').trim() || border;
    const up = toColor(el, '--flow-up'), down = toColor(el, '--flow-down'), cross = getComputedStyle(el).getPropertyValue('--t-crosshair').trim() || text;
    const line = { color: cross, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: border };
    const c = createChart(el, { autoSize: true, localization: { locale: 'en-US' }, layout: { background: { color: 'transparent' }, textColor: text }, grid: { vertLines: { color: grid }, horzLines: { color: grid } }, crosshair: { mode: CrosshairMode.MagnetOHLC, vertLine: line, horzLine: line }, rightPriceScale: { borderColor: border }, timeScale: { borderColor: border, timeVisible: true, rightOffset: 6 } });
    const series = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    chart.current = { chart: c, series };
    return () => { chart.current = null; c.remove(); };
  }, []);

  useEffect(() => {
    const c = chart.current; if (!c) return;
    const digits = priceDigits(pair);
    c.series.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } });
    c.series.setData(bars.map(b => ({ ...b, time: b.time as UTCTimestamp })));
    c.chart.timeScale().fitContent();
  }, [bars, pair]);

  const last = bars[bars.length - 1], first = bars[0];
  const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
  return (
    <div className="flex h-dvh flex-col bg-t-bg text-t-text">
      <header className="flex flex-wrap items-center gap-2 border-b border-t-border bg-t-panel px-3 py-2">
        <Link to="/" className="mr-2 font-semibold">DepthLens</Link>
        <div className="flex rounded-md border border-t-control-border p-0.5 text-xs">
          <Link to="/terminal" className="rounded px-2 py-1 text-t-muted hover:bg-t-raised">Futures</Link>
          <span className="rounded bg-t-accent px-2 py-1 font-semibold text-t-accent-fg">Forex</span>
        </div>
        <select aria-label="Pair" value={pair} onChange={e => setPair(e.target.value)} className="rounded-md border border-t-control-border bg-t-bg px-2 py-1 text-sm">
          {FOREX_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
          {extras.length > 0 && <optgroup label="More pairs">{extras.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>}
        </select>
        <form className="relative flex gap-1" onSubmit={e => { e.preventDefault(); if (query.trim()) choose(query); }}>
          <input aria-label="Search forex pair" value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setShowPopular(true)} placeholder="Search pair, e.g. EUR/AUD" className="w-44 rounded-md border border-t-control-border bg-t-bg px-2 py-1 text-sm" />
          <button type="button" onClick={() => setShowPopular(v => !v)} aria-expanded={showPopular} className="rounded-md border border-t-control-border px-2 py-1 text-xs text-t-muted hover:bg-t-raised">Popular</button>
          {showPopular && <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-t-border bg-t-panel p-2 shadow-lg" data-testid="fx-popular">
            <div className="mb-1 flex items-center justify-between text-[11px] text-t-muted"><span>Popular</span><button type="button" onClick={() => setShowPopular(false)} className="hover:text-t-text">Close</button></div>
            <div className="flex flex-wrap gap-1">{POPULAR_FX.filter(p => !query || p.replace('/', '').includes(query.toUpperCase().replace(/[^A-Z]/g, ''))).map(p => <button key={p} type="button" onClick={() => choose(p)} className={`rounded px-2 py-1 text-xs ${pair === p ? 'bg-t-accent text-t-accent-fg' : 'bg-t-raised hover:bg-t-bg'}`}>{p}</button>)}</div>
            <div className="mt-2 text-[11px] text-t-muted">Type any pair and press Enter.</div>
          </div>}
        </form>
        <div className="flex gap-1">{FOREX_TFS.map(t => <button key={t} type="button" onClick={() => setTf(t)} aria-pressed={tf === t} className={`rounded px-2 py-1 text-xs font-semibold ${tf === t ? 'bg-t-accent text-t-accent-fg' : 'text-t-muted hover:bg-t-raised'}`}>{TF_LABEL[t]}</button>)}</div>
        {last && <span className="text-sm font-semibold tabular-nums" data-testid="fx-last">{last.close}</span>}
        {note && (note.pair === pair || (note.pair === '*' && isBasePair(pair))) && <span className="text-xs text-t-muted" data-testid="fx-note">{note.text}</span>}
        <span className="ml-auto text-xs text-t-muted">Forex data delayed, volume = tick volume</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-0 flex-1">
          <div ref={host} className="absolute inset-0" data-testid="fx-chart" data-bars={bars.length} data-first={first?.time ?? ''} />
          {opening && !bars.length && phase !== 'error' && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted">Downloading {pair} history...</div>}
          {phase === 'loading' && !opening && !bars.length && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted">Loading candles...</div>}
          {phase === 'error' && <div className="absolute inset-0 grid place-items-center text-sm text-t-muted"><div className="text-center">Could not load forex candles.<button type="button" onClick={() => setTick(t => t + 1)} className="ml-2 rounded bg-t-accent px-3 py-1 font-semibold text-t-accent-fg">Retry</button></div></div>}
        </div>
        <aside className="border-t border-t-border bg-t-panel p-3 text-xs md:w-56 md:border-l md:border-t-0">
          <div className="mb-2 font-semibold">Order flow tools</div>
          {ORDERFLOW.map(t => <div key={t} className="flex justify-between py-1"><span>{t}</span><span className="text-t-muted">Not available for spot forex</span></div>)}
          {first && last && <div className="mt-3 text-t-muted">{fmt(first.time)} → {fmt(last.time)} UTC</div>}
        </aside>
      </div>
    </div>
  );
}
