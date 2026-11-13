import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { LineStyle, createSeriesMarkers, type IPriceLine, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { toast } from 'sonner';
import { Settings2, X } from 'lucide-react';
import type { ProfileChart } from './VolumeProfile';
import { whaleCandleTime } from '@/lib/whale-data';
import { RADAR_KEY, RADAR_TFS, findSetups, parseKline, restoreRadarSettings, scoreSetups, shortTfWarning, type RadarSettings, type RadarSetup } from '@/lib/flow-radar';

// Fetches its own Binance futures klines (taker buy volume) for the radar timeframe; no sockets, marks via native markers/price lines.
export function FlowRadar({ chartRef, symbol, minutes, revision, mobile }: { chartRef: MutableRefObject<ProfileChart | null>; symbol: string; minutes: number; revision: number; mobile: boolean }) {
  const [s, setS] = useState<RadarSettings>(() => restoreRadarSettings(typeof localStorage === 'undefined' ? null : localStorage.getItem(RADAR_KEY)));
  const [data, setData] = useState<{ setups: RadarSetup[]; span: number } | null>(null), [err, setErr] = useState(''), [open, setOpen] = useState(false), [min, setMin] = useState(false);
  const seen = useRef<string>('');
  const save = (p: Partial<RadarSettings>) => setS(o => { const n = { ...o, ...p }; localStorage.setItem(RADAR_KEY, JSON.stringify(n)); return n; });
  useEffect(() => {
    let dead = false; const ab = new AbortController(); seen.current = '';
    const load = async () => {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${s.tf}&limit=1500`, { signal: ab.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const now = Date.now(), rows = (await r.json() as (string | number)[][]).filter(k => +k[6] < now).map(parseKline);
        if (dead || rows.length < 26) return;
        const setups = findSetups(rows, s), key = setups.map(x => x.kind + x.side + x.time).join();
        const last = setups.at(-1);
        if (seen.current && last && !seen.current.includes(last.kind + last.side + last.time)) toast(`Flow Radar: ${last.side.toUpperCase()} setup on ${symbol}`, { description: `${last.kind === 'momentum' ? 'Flow Momentum' : 'Trapped Sweep'} · ${s.tf} · stop ${last.stop.toPrecision(6)}` });
        seen.current = key; setData({ setups, span: rows.at(-1)!.time - rows[0].time }); setErr('');
      } catch (e) { if (!dead && (e as Error).name !== 'AbortError') setErr('Could not load Binance candles for Flow Radar.'); }
    };
    load(); const id = setInterval(load, 30000);
    return () => { dead = true; ab.abort(); clearInterval(id); };
  }, [symbol, s]);
  useEffect(() => {
    const api = chartRef.current; if (!api || api.disposed || !data) return;
    const have = new Set(api.series.data().map(d => d.time as number)), byT = new Map<number, SeriesMarker<Time>[]>();
    const { up, down, muted } = api.colors;
    for (const x of data.setups) {
      const t = whaleCandleTime(x.time, minutes); if (!have.has(t)) continue;
      const buy = x.side === 'buy', m: SeriesMarker<Time> = x.outcome === 'open'
        ? { time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? up : down, text: buy ? 'BUY setup' : 'SELL setup' }
        : { time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: 'circle', color: x.outcome === 'win' ? up : x.outcome === 'loss' ? down : muted, text: x.outcome === 'win' ? '✓' : x.outcome === 'loss' ? '✗' : '–' };
      byT.set(t, [...(byT.get(t) ?? []), m]);
    }
    const markers = [...byT.entries()].sort((a, b) => a[0] - b[0]).flatMap(e => e[1]);
    let plugin: ISeriesMarkersPluginApi<Time> | null = null; try { plugin = createSeriesMarkers(api.series, markers); } catch { /* chart disposed */ }
    const lines: IPriceLine[] = [];
    for (const x of data.setups.filter(v => v.outcome === 'open').slice(-3)) {
      lines.push(api.series.createPriceLine({ price: x.stop, color: down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'Stop' }));
      lines.push(api.series.createPriceLine({ price: x.target, color: up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'Target' }));
    }
    return () => { if (api.disposed) return; try { plugin?.detach(); lines.forEach(l => api.series.removePriceLine(l)); } catch { /* disposed */ } };
  }, [chartRef, data, minutes, revision]);
  const rows = data ? ([['Flow Momentum', 'momentum', s.momentum], ['Trapped Sweep', 'sweep', s.sweep]] as const).filter(r => r[2]).map(r => [r[0], scoreSetups(data.setups, r[1], s, data.span)] as const) : [];
  const n = (k: keyof RadarSettings, label: string, step: number) => <label className="flex items-center justify-between gap-2">{label}<input type="number" step={step} value={s[k] as number} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) save({ [k]: v } as Partial<RadarSettings>); }} className="w-16 rounded border border-t-border bg-t-bg px-1 text-t-text"/></label>;
  return <div data-flow-radar="" className={`absolute left-2 z-20 rounded-md border border-t-border bg-t-panel/95 text-[11px] text-t-text shadow ${mobile ? 'bottom-2 right-2' : 'top-10 w-[25rem]'}`}>
    <div className="flex items-center gap-2 border-b border-t-border px-2 py-1 font-semibold"><span className="flex-1">Flow Radar · {s.tf} · R {s.r}</span>
      <button aria-label="Flow Radar settings" onClick={() => setOpen(o => !o)} className="text-t-muted hover:text-t-text"><Settings2 className="size-3.5"/></button>
      <button aria-label={min ? 'Expand Flow Radar' : 'Minimize Flow Radar'} onClick={() => setMin(m => !m)} className="text-t-muted hover:text-t-text">{min ? '+' : <X className="size-3.5"/>}</button></div>
    {!min && <div className="space-y-1 p-2">
      {open && <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-t-border pb-2">
        <label className="flex items-center justify-between gap-2">Timeframe<select value={s.tf} onChange={e => save({ tf: e.target.value })} className="rounded border border-t-border bg-t-bg px-1 text-t-text">{RADAR_TFS.map(t => <option key={t}>{t}</option>)}</select></label>
        {n('r', 'R', 0.1)}{n('fee', 'Fee % / side', 0.01)}{n('dr', 'dr threshold', 0.01)}{n('vz', 'vz threshold', 0.1)}{n('hold', 'Hold candles', 1)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.momentum} onChange={e => save({ momentum: e.target.checked })}/>Flow Momentum</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.sweep} onChange={e => save({ sweep: e.target.checked })}/>Trapped Sweep</label></div>}
      {shortTfWarning(s.tf) && <div className="text-t-warn">Setups on short timeframes performed worse in testing.</div>}
      {err && <div className="text-t-down">{err}</div>}
      {!data && !err && <div className="text-t-muted">Loading {s.tf} candles…</div>}
      {rows.length > 0 && <table className="w-full tabular-nums"><thead className="text-t-muted"><tr><th className="text-left font-normal">Setup</th><th>N</th><th>/mo</th><th>W</th><th>L</th><th>Acc</th><th>BE</th><th>Avg R</th></tr></thead>
        <tbody>{rows.map(([name, c]) => <tr key={name} className="text-center"><td className="text-left">{name}</td><td>{c.setups}</td><td>{c.perMonth.toFixed(1)}</td><td>{c.wins}</td><td>{c.losses}</td>
          <td className={c.accuracy === null ? 'text-t-muted' : c.accuracy < c.breakeven ? 'text-t-down' : 'text-t-up'}>{c.accuracy === null ? '–' : c.accuracy.toFixed(0) + '%'}</td><td>{c.breakeven.toFixed(0)}%</td><td>{c.avgR === null ? '–' : c.avgR.toFixed(2)}</td></tr>)}</tbody></table>}
      {data && !rows.length && <div className="text-t-muted">Turn on a setup in settings.</div>}
      <div className="text-[10px] text-t-muted">Setups are not predictions. Accuracy shown is measured on the loaded data, not guaranteed.</div>
    </div>}
  </div>;
}
