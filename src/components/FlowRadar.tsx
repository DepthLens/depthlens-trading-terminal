import { useEffect, useState, type MutableRefObject } from 'react';
import { createSeriesMarkers, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { Settings2, X } from 'lucide-react';
import type { ProfileChart } from './VolumeProfile';
import { scan, type Candle } from '@/lib/flow-radar-core';
import { RADAR_KEY, baseInterval, bucketCandles, parseKline, restoreRadarSettings, type RadarSettings } from '@/lib/flow-radar';

type Result = ReturnType<typeof scan> & { candles: Candle[] };
const pct = (v: number, d = 0) => Number.isFinite(v) ? v.toFixed(d) + '%' : '–', r2 = (v: number) => Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) + ' R' : '–';

// Binance REST klines (taker buy volume) for the chart timeframe; no sockets, marks via native series markers.
export function FlowRadar({ chartRef, symbol, minutes, revision, mobile }: { chartRef: MutableRefObject<ProfileChart | null>; symbol: string; minutes: number; revision: number; mobile: boolean }) {
  const [s, setS] = useState<RadarSettings>(() => restoreRadarSettings(typeof localStorage === 'undefined' ? null : localStorage.getItem(RADAR_KEY)));
  const [candles, setCandles] = useState<Candle[] | null>(null), [err, setErr] = useState(false), [open, setOpen] = useState(false), [min, setMin] = useState(false);
  const save = (p: Partial<RadarSettings>) => setS(o => { const n = { ...o, ...p }; localStorage.setItem(RADAR_KEY, JSON.stringify(n)); return n; });
  useEffect(() => {
    let dead = false; const ab = new AbortController(); setCandles(null); setErr(false);
    const [base, iv] = baseInterval(minutes);
    const load = async () => {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${iv}&limit=1500`, { signal: ab.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const now = Date.now(); let rows = (await r.json() as (string | number)[][]).map(parseKline);
        if (base !== minutes) rows = bucketCandles(rows, minutes);
        rows = rows.filter(b => b.t + minutes * 60000 <= now);
        if (!dead) { setCandles(rows); setErr(false); }
      } catch (e) { if (!dead && (e as Error).name !== 'AbortError') setErr(true); }
    };
    load(); const id = setInterval(load, 30000);
    return () => { dead = true; ab.abort(); clearInterval(id); };
  }, [symbol, minutes]);
  const res: Result | null = candles ? { ...scan(candles, minutes, { q: s.q, highVolOnly: s.highVolOnly }, s.rr, s.maxBars), candles } : null;
  const key = res ? `${res.setups.map(o => o.i + ':' + o.exit).join()}|${s.watch ? res.watches.map(w => w.i).join() : ''}|${res.candles.at(-1)?.t}` : '';
  useEffect(() => {
    const api = chartRef.current; if (!api || api.disposed || !res || err) return;
    const have = new Set(api.series.data().map(d => d.time as number)), out: SeriesMarker<Time>[] = [];
    const { up, down, muted } = api.colors, T = (i: number) => Math.floor(res.candles[i].t / 1000);
    if (res.policy.mode === 'setup') for (const o of res.setups) {
      const t = T(o.i), buy = o.side === 1;
      if (have.has(t)) out.push({ time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? up : down, text: buy ? 'Buy Setup' : 'Sell Setup' });
      const xt = T(o.exitIndex), done = o.exit !== 'timeout' || o.exitIndex < res.candles.length - 1 && o.exitIndex === Math.min(res.candles.length - 1, o.i + 1 + s.maxBars);
      if (done && have.has(xt)) out.push({ time: xt as UTCTimestamp, position: o.exit === 'stop' ? (buy ? 'belowBar' : 'aboveBar') : buy ? 'aboveBar' : 'belowBar', shape: 'square', size: 0, color: o.exit === 'target' ? up : o.exit === 'stop' ? down : muted, text: o.exit === 'target' ? '✓' : o.exit === 'stop' ? '✗' : '–' });
    }
    if (s.watch) for (const w of res.watches) {
      const t = T(w.i), buy = w.side === 1;
      if (have.has(t)) out.push({ time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: 'circle', size: 0.6, color: buy ? up : down, text: 'Watch' });
    }
    out.sort((a, b) => (a.time as number) - (b.time as number));
    let plugin: ISeriesMarkersPluginApi<Time> | null = null; try { plugin = createSeriesMarkers(api.series, out); } catch { /* chart disposed */ }
    return () => { if (api.disposed) return; try { plugin?.detach(); } catch { /* disposed */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartRef, key, revision, s.watch, err]);
  const b = res?.board, p = res?.policy;
  return <div data-flow-radar="" className={`absolute z-20 border border-t-border bg-t-panel/95 text-[11px] text-t-text shadow ${mobile ? 'inset-x-0 bottom-0 rounded-t-md' : 'left-2 top-10 w-[22rem] rounded-md'}`}>
    <div className="flex items-center gap-2 border-b border-t-border px-2 py-1 font-semibold"><span className="flex-1">Flow Radar · {p?.mode === 'setup' ? 'Setup' : 'Watch'} mode</span>
      <button aria-label="Flow Radar settings" onClick={() => setOpen(o => !o)} className="text-t-muted hover:text-t-text"><Settings2 className="size-3.5"/></button>
      <button aria-label={min ? 'Expand Flow Radar' : 'Minimize Flow Radar'} onClick={() => setMin(m => !m)} className="text-t-muted hover:text-t-text">{min ? '+' : <X className="size-3.5"/>}</button></div>
    {!min && <div className="space-y-1 p-2">
      {open && <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-t-border pb-2">
        <label className="flex items-center justify-between gap-2">Threshold q<select value={s.q} onChange={e => save({ q: Number(e.target.value) as RadarSettings['q'] })} className="rounded border border-t-border bg-t-bg px-1 text-t-text">{[0.8, 0.9, 0.95].map(q => <option key={q} value={q}>{q}</option>)}</select></label>
        <label className="flex items-center justify-between gap-2">Target R<input type="number" step={0.25} value={s.rr} onChange={e => { const v = parseFloat(e.target.value); if (v > 0) save({ rr: v }); }} className="w-14 rounded border border-t-border bg-t-bg px-1 text-t-text"/></label>
        <label className="flex items-center justify-between gap-2">Max bars<input type="number" step={1} value={s.maxBars} onChange={e => { const v = parseInt(e.target.value); if (v > 0) save({ maxBars: v }); }} className="w-14 rounded border border-t-border bg-t-bg px-1 text-t-text"/></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.highVolOnly} onChange={e => save({ highVolOnly: e.target.checked })}/>High volatility only</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.watch} onChange={e => save({ watch: e.target.checked })}/>Show Reversal Watch</label></div>}
      {err ? <div className="text-t-muted">Flow Radar needs Binance candle data</div> : !res ? <div className="text-t-muted">Loading candles…</div> : p!.mode === 'context' ? <div className="rounded border border-t-border bg-t-bg/60 p-1.5 text-t-muted">{p!.note} Fee cost: {p!.typicalFeeDragR ?? 'high'} R per trade. Reversal Watch only: {res.watches.length} on loaded candles.</div> : <>
        <div className="text-t-muted">{p!.note}</div>
        <div className="grid grid-cols-2 gap-x-3 tabular-nums">
          <span className="text-t-muted">Trades</span><span>{b!.n}</span>
          <span className="text-t-muted">Target hit</span><span>{pct(b!.hitPct)} <span className="text-t-muted">(95%: {pct(b!.hitCiLo)}–{pct(b!.hitCiHi)})</span></span>
          <span className="text-t-muted">Avg R after fees</span><span className={b!.avgNetR > 0 ? 'text-t-up' : b!.avgNetR < 0 ? 'text-t-down' : ''}>{r2(b!.avgNetR)}</span>
          <span className="text-t-muted">Max drawdown</span><span>{b!.maxDrawdownR.toFixed(2)} R</span>
          <span className="text-t-muted">Median stop</span><span>{pct(b!.medianRiskPct * 100, 2)}</span>
          <span className="text-t-muted">Verdict</span><span className="font-semibold">{b!.verdict}</span></div></>}
      <div className="text-[10px] text-t-muted">Measured on 22 months of BTCUSDT. Not a promise.</div>
    </div>}
  </div>;
}
