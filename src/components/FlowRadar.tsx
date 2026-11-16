import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { LineStyle, createSeriesMarkers, type IPriceLine, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { toast } from 'sonner';
import { Settings2, X } from 'lucide-react';
import type { ProfileChart } from './VolumeProfile';
import { whaleCandleTime } from '@/lib/whale-data';
import { RADAR_KEY, RADAR_TFS, findSetups, parseKline, restoreRadarSettings, scoreSetups, shortTfWarning, type RadarSettings, type RadarSetup, type RadarBar } from '@/lib/flow-radar';
import { patternLayer, restorePatternSettings, type PatternSettings } from '@/lib/flow-radar-pattern-layer';
import { PATTERN_INFO, isAtlasTimeframe, type PatternId } from '@/lib/flow-radar-patterns';
import { higherTfs, mtfLayer, splitForming, formingNote, MTF_TFS, type BigTf } from '@/lib/flow-radar-mtf';
import { RADAR_MINUTES } from '@/lib/flow-radar';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

// Fetches its own Binance futures klines (taker buy volume) for the radar timeframe; no sockets, marks via native markers/price lines.
export function FlowRadar({ chartRef, symbol, minutes, revision, mobile }: { chartRef: MutableRefObject<ProfileChart | null>; symbol: string; minutes: number; revision: number; mobile: boolean }) {
  type Mtf = { mtfOn: boolean; mtfTfs: BigTf[] };
  const [s, setS] = useState<RadarSettings & PatternSettings & Mtf>(() => {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(RADAR_KEY);
    let extra: Record<string, unknown> = {}; try { extra = JSON.parse(raw ?? '{}') ?? {}; } catch { /* defaults */ }
    const base = restoreRadarSettings(raw);
    return { ...base, tf: extra.tf === undefined || extra.tf === 'chart' ? 'chart' : base.tf, ...restorePatternSettings(extra),
      mtfOn: extra.mtfOn !== false, mtfTfs: Array.isArray(extra.mtfTfs) ? MTF_TFS.map(x => x.tf).filter(t => (extra.mtfTfs as unknown[]).includes(t)) : ['1h', '4h'] };
  });
  // Chart timeframe as a Binance interval (null for custom); radar tf follows it when set to "Same as chart".
  const chartTf = Object.keys(RADAR_MINUTES).find(k => RADAR_MINUTES[k] === minutes) ?? null;
  const radarTf = s.tf === 'chart' ? chartTf : s.tf;
  const bigs = s.mtfOn ? higherTfs(minutes).filter(b => s.mtfTfs.includes(b.tf)) : [];
  const want = [...new Set([radarTf, s.patternsOn && chartTf && isAtlasTimeframe(chartTf) ? chartTf : null, ...bigs.map(b => b.tf)].filter((t): t is string => !!t))].sort().join(',');
  const [data, setData] = useState<{ setups: RadarSetup[]; span: number; bars: RadarBar[]; all: Record<string, RadarBar[]>; now: number } | null>(null), [err, setErr] = useState(''), [open, setOpen] = useState(false), [min, setMin] = useState(false);
  const tooltip = useRef<HTMLDivElement>(null);
  const seen = useRef<string>('');
  const save = (p: Partial<RadarSettings & PatternSettings & Mtf>) => setS(o => { const n = { ...o, ...p }; localStorage.setItem(RADAR_KEY, JSON.stringify(n)); return n; });
  useEffect(() => {
    let dead = false; const ab = new AbortController(); seen.current = '';
    if (!radarTf) { setData(null); return; }
    const load = async () => {
      try {
        const all: Record<string, RadarBar[]> = {}, now = Date.now();
        await Promise.all(want.split(',').map(async tf => {
          const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=1500`, { signal: ab.signal });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          all[tf] = (await r.json() as (string | number)[][]).map(parseKline);
        }));
        const closed = (tf: string) => (all[tf] ?? []).filter(b => b.time + (RADAR_MINUTES[tf] ?? 0) * 60000 <= now);
        const rows = closed(radarTf);
        for (const tf of Object.keys(all)) if (!bigs.some(b => b.tf === tf)) all[tf] = closed(tf);
        if (dead || rows.length < 26) return;
        const setups = findSetups(rows, { ...s, tf: radarTf }), key = setups.map(x => x.kind + x.side + x.time).join();
        const last = setups.at(-1);
        if (seen.current && last && !seen.current.includes(last.kind + last.side + last.time)) toast(`Flow Radar: ${last.side.toUpperCase()} setup on ${symbol}`, { description: `${last.kind === 'momentum' ? 'Flow Momentum' : 'Trapped Sweep'} · ${radarTf} · stop ${last.stop.toPrecision(6)}` });
        const first = rows[0], lastRow = rows.at(-1); if (!first || !lastRow) return;
        seen.current = key; setData({ setups, span: lastRow.time - first.time, bars: rows, all, now }); setErr('');
      } catch (e) { if (!dead && (e as Error).name !== 'AbortError') setErr('Could not load Binance candles for Flow Radar.'); }
    };
    load(); const id = setInterval(load, 30000);
    return () => { dead = true; ab.abort(); clearInterval(id); };
  }, [symbol, radarTf, want, s.r, s.fee, s.dr, s.vz, s.hold, s.momentum, s.sweep]);
  useEffect(() => {
    const api = chartRef.current; if (!api || api.disposed || !data) return;
    const have = new Set(api.series.data().map(d => d.time as number)), byT = new Map<number, SeriesMarker<Time>[]>();
    const { up, down, muted } = api.colors;
    for (const x of radarTf === chartTf ? data.setups : []) {
      const t = whaleCandleTime(x.time, minutes); if (!have.has(t)) continue;
      const buy = x.side === 'buy', m: SeriesMarker<Time> = x.outcome === 'open'
        ? { time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? up : down, text: buy ? 'BUY setup' : 'SELL setup' }
        : { time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: 'circle', color: x.outcome === 'win' ? up : x.outcome === 'loss' ? down : muted, text: x.outcome === 'win' ? '✓' : x.outcome === 'loss' ? '✗' : '–' };
      byT.set(t, [...(byT.get(t) ?? []), m]);
    }
    const patterns = chartTf ? patternLayer(data.all[chartTf] ?? [], chartTf, s, minutes, have, api.colors) : { markers: [], details: new Map<string, string[]>() };
    const details = new Map(patterns.details), extra: SeriesMarker<Time>[] = [];
    for (const big of bigs) {
      const { closed } = splitForming(data.all[big.tf] ?? [], big.minutes, data.now);
      const m = mtfLayer(closed, big, minutes, { ...s, tf: big.tf }, { setups: true, patternsOn: s.patternsOn, patterns: s.patterns }, have, api.colors);
      extra.push(...m.markers); m.details.forEach((v, k) => details.set(k, v));
    }
    api.host.dataset['mtfMarks'] = String(extra.length);
    const markers = [...byT.entries()].sort((a, b) => a[0] - b[0]).flatMap(e => e[1]);
    markers.push(...patterns.markers, ...extra); markers.sort((a, b) => Number(a.time) - Number(b.time));
    api.host.dataset['shortTfPatterns'] = String(patterns.markers.length);
    const hover: Parameters<typeof api.chart.subscribeCrosshairMove>[0] = event => {
      const lines = typeof event.hoveredObjectId === 'string' ? details.get(event.hoveredObjectId) : undefined;
      if (tooltip.current) { tooltip.current.hidden = !lines; tooltip.current.textContent = lines?.join('\n') ?? ''; }
    };
    api.chart.subscribeCrosshairMove(hover);
    let plugin: ISeriesMarkersPluginApi<Time> | null = null; try { plugin = createSeriesMarkers(api.series, markers); } catch { /* chart disposed */ }
    const lines: IPriceLine[] = [];
    for (const x of radarTf === chartTf ? data.setups.filter(v => v.outcome === 'open').slice(-3) : []) {
      lines.push(api.series.createPriceLine({ price: x.stop, color: down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'Stop' }));
      lines.push(api.series.createPriceLine({ price: x.target, color: up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'Target' }));
    }
    return () => { if (tooltip.current) tooltip.current.hidden = true; delete api.host.dataset['shortTfPatterns']; delete api.host.dataset['mtfMarks']; if (api.disposed) return; try { api.chart.unsubscribeCrosshairMove(hover); plugin?.detach(); lines.forEach(l => api.series.removePriceLine(l)); } catch { /* disposed */ } };
  }, [chartRef, data, minutes, revision, s.patternsOn, s.patterns, radarTf, chartTf, s.mtfOn, s.mtfTfs.join()]);
  const notes = data ? bigs.map(big => { const sp = splitForming(data.all[big.tf] ?? [], big.minutes, Date.now()); return formingNote(sp.closed, sp.forming, big, { ...s, tf: big.tf }, Date.now()); }).filter(Boolean) : [];
  const rows = data ? ([['Flow Momentum', 'momentum', s.momentum], ['Trapped Sweep', 'sweep', s.sweep]] as const).filter(r => r[2]).map(r => [r[0], scoreSetups(data.setups, r[1], s, data.span)] as const) : [];
  const n = (k: keyof RadarSettings, label: string, step: number) => <label className="flex items-center justify-between gap-2">{label}<input type="number" step={step} value={s[k] as number} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) save({ [k]: v } as Partial<RadarSettings>); }} className="w-16 rounded border border-t-border bg-t-bg px-1 text-t-text"/></label>;
  return <><div ref={tooltip} hidden role="tooltip" data-pattern-tooltip="" className="pointer-events-none absolute left-2 right-2 top-2 z-30 max-h-[70%] overflow-hidden whitespace-pre-line rounded border border-t-border bg-t-panel p-2 text-[11px] text-t-text"/><div data-flow-radar="" className={`absolute left-2 z-20 max-h-[85%] overflow-y-auto rounded-md border border-t-border bg-t-panel/95 text-[11px] text-t-text shadow ${mobile ? 'bottom-2 right-2' : 'top-10 w-[25rem]'}`}>
    <div className="flex items-center gap-2 border-b border-t-border px-2 py-1 font-semibold"><span className="flex-1">Flow Radar · {radarTf ?? 'chart'} · R {s.r}</span>
      <button aria-label="Flow Radar settings" onClick={() => setOpen(o => !o)} className="text-t-muted hover:text-t-text"><Settings2 className="size-3.5"/></button>
      <button aria-label={min ? 'Expand Flow Radar' : 'Minimize Flow Radar'} onClick={() => setMin(m => !m)} className="text-t-muted hover:text-t-text">{min ? '+' : <X className="size-3.5"/>}</button></div>
    {!min && <div className="space-y-1 p-2">
      {open && <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-t-border pb-2">
        <label className="flex items-center justify-between gap-2">Timeframe<select value={s.tf} onChange={e => save({ tf: e.target.value })} className="rounded border border-t-border bg-t-bg px-1 text-t-text"><option value="chart">Same as chart</option>{RADAR_TFS.map(t => <option key={t}>{t}</option>)}</select></label>
        {n('r', 'R', 0.1)}{n('fee', 'Fee % / side', 0.01)}{n('dr', 'dr threshold', 0.01)}{n('vz', 'vz threshold', 0.1)}{n('hold', 'Hold candles', 1)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.momentum} onChange={e => save({ momentum: e.target.checked })}/>Flow Momentum</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.sweep} onChange={e => save({ sweep: e.target.checked })}/>Trapped Sweep</label>
        <section className="col-span-2 space-y-2 border-t border-t-border pt-2" aria-label="Short-TF Patterns">
          <label className="flex items-center justify-between font-semibold">Short-TF Patterns<Switch aria-label="Short-TF Patterns" checked={s.patternsOn} onCheckedChange={v => save({ patternsOn: v })}/></label>
          {!chartTf || !isAtlasTimeframe(chartTf) ? <p className="text-t-muted">Short-TF Patterns: 1m–4h only</p> : <div className="grid grid-cols-2 gap-2">{(Object.keys(PATTERN_INFO) as PatternId[]).map(id => <label key={id} className="flex items-center gap-1"><Checkbox aria-label={PATTERN_INFO[id].name} checked={s.patterns.includes(id)} onCheckedChange={v => save({ patterns: v === true ? [...s.patterns, id] : s.patterns.filter(p => p !== id) })}/>{PATTERN_INFO[id].name}</label>)}</div>}
        </section>
        <section className="col-span-2 space-y-2 border-t border-t-border pt-2" aria-label="Higher timeframe marks">
          <label className="flex items-center justify-between font-semibold">Higher timeframe marks<Switch aria-label="Higher timeframe marks" checked={s.mtfOn} onCheckedChange={v => save({ mtfOn: v })}/></label>
          <div className="flex gap-3">{MTF_TFS.map(({ tf }) => <label key={tf} className="flex items-center gap-1"><Checkbox aria-label={`Higher timeframe ${tf}`} checked={s.mtfTfs.includes(tf)} onCheckedChange={v => save({ mtfTfs: v === true ? [...s.mtfTfs, tf] : s.mtfTfs.filter(t => t !== tf) })}/>{tf}</label>)}</div>
          {s.mtfOn && !higherTfs(minutes).length && <p className="text-t-muted">No higher timeframe fits this chart.</p>}
        </section></div>}
      {!radarTf && <div className="text-t-muted">Flow Radar needs a 1m–1d chart or a fixed radar timeframe.</div>}
      {radarTf && radarTf !== chartTf && <div data-radar-tf-note="" className="text-t-warning">Radar marks are for {radarTf}. Switch the chart to {radarTf} to see them.</div>}
      {notes.map(nt => <div key={nt!.tf} data-forming-note="" className="whitespace-pre-line rounded border border-t-border p-1 text-t-muted">{nt!.lines.join('\n')}</div>)}
      {radarTf && shortTfWarning(radarTf) && <div className="text-t-warning">Setups on short timeframes performed worse in testing.</div>}
      {err && <div className="text-t-down">{err}</div>}
      {!data && !err && <div className="text-t-muted">{radarTf && <>Loading {radarTf} candles…</>}{false && <>…</div>}
      {rows.length > 0 && <table className="w-full tabular-nums"><thead className="text-t-muted"><tr><th className="text-left font-normal">Setup</th><th>N</th><th>/mo</th><th>W</th><th>L</th><th>Acc</th><th>BE</th><th>Avg R</th></tr></thead>
        <tbody>{rows.map(([name, c]) => <tr key={name} className="text-center"><td className="text-left">{name}</td><td>{c.setups}</td><td>{c.perMonth.toFixed(1)}</td><td>{c.wins}</td><td>{c.losses}</td>
          <td className={c.accuracy === null ? 'text-t-muted' : c.accuracy < c.breakeven ? 'text-t-down' : 'text-t-up'}>{c.accuracy === null ? '–' : c.accuracy.toFixed(0) + '%'}</td><td>{c.breakeven.toFixed(0)}%</td><td>{c.avgR === null ? '–' : c.avgR.toFixed(2)}</td></tr>)}</tbody></table>}
      {data && !rows.length && <div className="text-t-muted">Turn on a setup in settings.</div>}
      <div className="text-[10px] text-t-muted">Setups are not predictions. Accuracy shown is measured on the loaded data, not guaranteed.</div>
    </div>}
  </div></>;
}
