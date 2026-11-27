import { RADAR_KEY, RADAR_MINUTES, RADAR_TFS, restoreRadarSettings, type RadarSettings } from '@/lib/flow-radar';
import { restorePatternSettings, type PatternSettings } from '@/lib/flow-radar-pattern-layer';
import { PATTERN_INFO, isAtlasTimeframe, type PatternId } from '@/lib/flow-radar-patterns';
import { higherTfs, MTF_TFS, type BigTf } from '@/lib/flow-radar-mtf';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

export type RadarState = RadarSettings & PatternSettings & { mtfOn: boolean; mtfTfs: BigTf[] };
/** Edit menu saves announce themselves so the mounted Flow Radar re-reads its saved settings. */
export const RADAR_SYNC_EVENT = 'depthlens-radar-settings';

/** Saved Flow Radar settings (same parsing as before the Edit menu existed). */
export function readRadarState(raw: string | null): RadarState {
  let extra: Record<string, unknown> = {}; try { extra = JSON.parse(raw ?? '{}') ?? {}; } catch { /* defaults */ }
  const base = restoreRadarSettings(raw);
  return { ...base, tf: extra["tf"] === undefined || extra["tf"] === 'chart' ? 'chart' : base.tf, ...restorePatternSettings(extra),
    mtfOn: extra["mtfOn"] !== false, mtfTfs: Array.isArray(extra["mtfTfs"]) ? MTF_TFS.map(x => x.tf).filter(t => (extra["mtfTfs"] as unknown[]).includes(t)) : ['1h', '4h'] };
}
export const loadRadarState = () => readRadarState(typeof localStorage === 'undefined' ? null : localStorage.getItem(RADAR_KEY));
export function saveRadarState(next: RadarState) { try { localStorage.setItem(RADAR_KEY, JSON.stringify(next)); } catch { /* unavailable browser storage */ } window.dispatchEvent(new Event(RADAR_SYNC_EVENT)); }

/** Flow Radar options (moved unchanged from the radar card into the Edit menu). */
export function FlowRadarSettingsForm({ s, save, minutes }: { s: RadarState; save: (p: Partial<RadarState>) => void; minutes: number }) {
  const chartTf = Object.keys(RADAR_MINUTES).find(k => RADAR_MINUTES[k] === minutes) ?? null;
  const n = (k: keyof RadarSettings, label: string, step: number) => <label className="flex items-center justify-between gap-2">{label}<input type="number" step={step} value={s[k] as number} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) save({ [k]: v } as Partial<RadarSettings>); }} className="w-16 rounded border border-t-border bg-t-bg px-1 text-t-text"/></label>;
  return <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
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
    </section>
  </div>;
}
