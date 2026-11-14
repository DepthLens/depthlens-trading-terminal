import { useEffect, useState, type MutableRefObject } from 'react';
import { createSeriesMarkers, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProfileChart } from './VolumeProfile';
import { scan } from '@/lib/flow-radar-core';
import { RADAR_DEFAULT, RADAR_KEY, aggregateRadar, parseKline, radarInterval, restoreRadarSettings, type RadarSettings } from '@/lib/flow-radar';

type Result = ReturnType<typeof scan> & { candles: ReturnType<typeof parseKline>[] };
export function FlowRadar({ chartRef, symbol, minutes, revision, mobile }: { chartRef: MutableRefObject<ProfileChart | null>; symbol: string; minutes: number; revision: number; mobile: boolean }) {
  const [s, setS] = useState<RadarSettings>({ ...RADAR_DEFAULT });
  const [restored, setRestored] = useState(false), [data, setData] = useState<Result | null>(null);
  const [err, setErr] = useState(''), [open, setOpen] = useState(false), [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setS(restoreRadarSettings(localStorage.getItem(RADAR_KEY))); setRestored(true); }, []);
  const save = (p: Partial<RadarSettings>) => setS(o => { const n = restoreRadarSettings(JSON.stringify({ ...o, ...p })); localStorage.setItem(RADAR_KEY, JSON.stringify(n)); return n; });
  useEffect(() => {
    if (!restored) return;
    let dead = false, busy = false, pauseUntil = 0;
    const abort = new AbortController(), history = new Map<number, ReturnType<typeof parseKline>>();
    setData(null); setErr('');
    const interval = radarInterval(minutes), custom = interval === '1m' && minutes !== 1;
    const load = async () => {
      const api = chartRef.current;
      if (dead || busy || Date.now() < pauseUntil || !api || api.disposed) return;
      const active = api.series.data().filter(b => 'open' in b);
      if (!active.length) return;
      busy = true;
      try {
        const from = Number(active[0]?.time) * 1000;
        let end: number | undefined;
        do {
          const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=1500${end === undefined ? '' : `&endTime=${end}`}`, { signal: abort.signal });
          if (!response.ok) { if (response.status === 429 || response.status === 418) pauseUntil = Date.now() + 60000; throw new Error('Binance unavailable'); }
          const rows: unknown = await response.json();
          if (!Array.isArray(rows) || !rows.length) throw new Error('Binance unavailable');
          for (const k of rows) if (Array.isArray(k)) {
            const b = parseKline(k);
            if ([b.t, b.o, b.h, b.l, b.c, b.v, b.delta].every(Number.isFinite) && Number(k[6]) < Date.now()) history.set(b.t, b);
          }
          const first = Number(rows[0]?.[0]);
          if (!Number.isFinite(first) || first <= from || rows.length < 1500 || history.size && Math.min(...history.keys()) <= from) break;
          end = first - 1;
        } while (!dead);
        if (dead) return;
        const base = [...history.values()].sort((a, b) => a.t - b.t);
        const have = new Set(api.series.data().map(b => Number(b.time) * 1000));
        const candles = (custom ? aggregateRadar(base, minutes) : base).filter(b => have.has(b.t) && b.t + minutes * 60000 <= Date.now() && (!custom || base[0] && b.t >= base[0].t));
        setData({ ...scan(candles, minutes, s, s.rr, s.maxBars), candles }); setErr('');
      } catch (e) { if (!dead && (e as Error).name !== 'AbortError') { setData(null); setErr('Flow Radar needs Binance candle data'); } }
      finally { busy = false; }
    };
    void load(); const timer = setInterval(() => void load(), 30000), initial = setTimeout(() => void load(), 1000);
    return () => { dead = true; abort.abort(); clearInterval(timer); clearTimeout(initial); };
  }, [chartRef, symbol, minutes, revision, s, restored]);
  useEffect(() => {
    const api = chartRef.current;
    if (!api || api.disposed || !data) return;
    const have = new Set(api.series.data().map(b => Number(b.time))), markers: SeriesMarker<Time>[] = [];
    const add = (i: number, side: number, text: string, shape: 'arrowUp' | 'arrowDown' | 'circle', color: string, size = 1) => {
      const b = data.candles[i]; if (!b || !have.has(b.t / 1000)) return;
      markers.push({ time: b.t / 1000 as UTCTimestamp, position: side === 1 ? 'belowBar' : 'aboveBar', shape, color, text, size });
    };
    for (const x of data.setups) {
      add(x.i, x.side, x.side === 1 ? 'Buy Setup' : 'Sell Setup', x.side === 1 ? 'arrowUp' : 'arrowDown', x.side === 1 ? api.colors.up : api.colors.down);
      add(x.exitIndex, x.side, x.exit === 'target' ? '✓' : x.exit === 'stop' ? '✗' : '–', 'circle', x.exit === 'target' ? api.colors.up : x.exit === 'stop' ? api.colors.down : api.colors.muted, 0);
    }
    if (s.showWatch) for (const x of data.watches) add(x.i, x.side, x.side === 1 ? '○ Buy Watch' : '○ Sell Watch', 'circle', x.side === 1 ? api.colors.up : api.colors.down, 0);
    markers.sort((a, b) => Number(a.time) - Number(b.time));
    const plugin = createSeriesMarkers(api.series, markers);
    return () => { if (!api.disposed) plugin.detach(); };
  }, [chartRef, data, revision, s.showWatch]);
  const fmt = (v: number, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : '—';
  const board = data?.board;
  return <section data-flow-radar="" data-mode={data?.policy.mode} data-candles={data?.candles.length ?? 0} data-setups={data?.setups.length ?? 0} data-watches={data?.watches.length ?? 0} aria-label="Flow Radar scoreboard" className={`shrink-0 border-t border-t-border bg-t-panel text-xs text-t-text ${mobile ? 'max-h-[40vh] overflow-y-auto' : ''}`}>
    <header className="flex items-center gap-2 px-3 py-1"><span className="flex-1 font-semibold">Flow Radar · {minutes}m · {data?.policy.mode === 'context' ? 'Context' : 'Setup'}</span>
      <Button variant="ghost" size="icon" className="size-7" aria-label="Flow Radar settings" title="Flow Radar settings" onClick={() => setOpen(v => !v)}><Settings2/></Button>
      <Button variant="ghost" size="icon" className="size-7" aria-label={collapsed ? 'Expand Flow Radar' : 'Minimize Flow Radar'} onClick={() => setCollapsed(v => !v)}>{collapsed ? <ChevronUp/> : <ChevronDown/>}</Button>
    </header>
    {!collapsed && <div className="space-y-2 px-3 pb-2">
      {open && <fieldset className="flex flex-wrap gap-x-4 gap-y-2 border-b border-t-border pb-2">
        <label>Threshold q <select aria-label="Threshold q" value={s.q} onChange={e => save({ q: Number(e.target.value) })} className="border border-t-border bg-t-bg text-t-text">{[0.8, 0.9, 0.95].map(q => <option key={q}>{q}</option>)}</select></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.highVolOnly} onChange={e => save({ highVolOnly: e.target.checked })}/>High-volatility only</label>
        <label>Target R <input aria-label="Target R" type="number" min="0.1" step="0.1" value={s.rr} onChange={e => save({ rr: Number(e.target.value) })} className="w-14 border border-t-border bg-t-bg text-t-text"/></label>
        <label>Max bars <input aria-label="Max bars" type="number" min="1" step="1" value={s.maxBars} onChange={e => save({ maxBars: Number(e.target.value) })} className="w-14 border border-t-border bg-t-bg text-t-text"/></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.showWatch} onChange={e => save({ showWatch: e.target.checked })}/>Reversal Watch</label>
      </fieldset>}
      {err ? <p className="text-t-muted">{err}</p> : !data ? <p className="text-t-muted">Loading Binance candles…</p> : <>
        <p className="text-t-muted">{data.policy.note}{data.policy.mode === 'context' && ` Fee cost: ${data.policy.typicalFeeDragR ?? 'high'} R.`}</p>
        {data.policy.mode === 'setup' && board && <><dl className="flex flex-wrap gap-x-5 gap-y-2 tabular-nums">
          <div><dt className="text-t-muted">Trades</dt><dd>{board.n}</dd></div>
          <div><dt className="text-t-muted">Target-hit % · 95% interval</dt><dd>{fmt(board.hitPct, 1)}% ({fmt(board.hitCiLo, 1)}–{fmt(board.hitCiHi, 1)}%)</dd></div>
          <div><dt className="text-t-muted">Average R after fees</dt><dd className={board.avgNetR > 0 ? 'text-t-up' : board.avgNetR < 0 ? 'text-t-down' : 'text-t-muted'}>{fmt(board.avgNetR)}</dd></div>
          <div><dt className="text-t-muted">Max drawdown R</dt><dd>{fmt(board.maxDrawdownR)}</dd></div>
          <div><dt className="text-t-muted">Median stop %</dt><dd>{fmt(board.medianRiskPct * 100)}</dd></div>
        </dl><p>{board.verdict}</p></>}
        <p className="text-t-muted">Measured on 22 months of BTCUSDT. Not a promise.</p>
      </>}
    </div>}
  </section>;
}
