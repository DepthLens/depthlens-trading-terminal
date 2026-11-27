import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Info, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MenuDropdown } from '@/components/MenuDropdown';
import { HeatmapProPanel } from '@/components/HeatmapPro';
import { heatmapUi } from '@/lib/heatmap-ui';
import { DomSettingsFields, DOM_ROW_EVENT, DOM_SYNC_EVENT, domRow } from '@/components/DomLadder';
import { FlowRadarSettingsForm, RADAR_SYNC_EVENT, loadRadarState, readRadarState, saveRadarState, type RadarState } from '@/components/FlowRadarSettings';
import { DOM_DEFAULT, DOM_KEY, restoreDomSettings, type DomSettings } from '@/lib/dom-ladder';
import { resetToDefault } from '@/lib/edit-panel';
import { WALL_FADES, WALL_INFO, WALL_MIN_TIMES, WALL_PERCENTILES, wallAge } from '@/lib/heatmap-walls';

export type EditSection = { id: string; name: string; body: ReactNode; reset: () => void };

/** Edit menu: one settings section per tool that is currently on, each with "Reset to default". */
export function EditPanel({ open, onClose, mobile, theme, button, sections, disabledReason }: { open: boolean; onClose: () => void; mobile: boolean; theme: string; button: ReactNode; sections: EditSection[]; disabledReason?: string | null }) {
  return <MenuDropdown open={open} onClose={onClose} button={button} label="Edit tool settings" mobile={mobile} theme={theme} width="w-[24rem]">
    <div className="flex items-center justify-between border-b border-t-border px-3 py-2"><h2 className="text-base font-semibold">Edit</h2><Button variant="ghost" size="icon" aria-label="Close edit" onClick={onClose} className="size-9 text-t-muted hover:bg-t-border"><X /></Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {disabledReason ? <p role="note" className="m-3 rounded border border-t-border px-2 py-1.5 text-xs text-t-muted">{disabledReason}</p>
        : !sections.length ? <p className="px-3 py-6 text-center text-sm text-t-muted">No tools are on. Turn tools on in Order flow to edit their settings here.</p>
        : sections.map(s => <section key={s.id} aria-label={`${s.name} settings`} className="border-b border-t-border last:border-b-0">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-t-panel px-3 py-2"><h3 className="text-sm font-semibold">{s.name}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={s.reset} aria-label={`Reset ${s.name} to default`} className="h-7 gap-1 px-2 text-xs text-t-muted hover:bg-t-border hover:text-t-text mobile:h-10"><RotateCcw className="size-3.5" />Reset to default</Button></div>
          <div className="pb-2">{s.body}</div>
        </section>)}
    </div>
  </MenuDropdown>;
}

/** Heatmap options formerly in the rows above the heatmap and its settings sheet. */
export function HeatmapEditSection({ mobile }: { mobile: boolean }) {
  const h = useSyncExternalStore(heatmapUi.subscribe, heatmapUi.get, () => null);
  if (!h) return <p className="px-3 text-xs text-t-muted">Heatmap settings appear here while the Heatmap is showing.</p>;
  const on = 'bg-t-accent text-t-bg hover:bg-t-accent/90', off = 'text-t-muted hover:bg-t-border/50 hover:text-t-text';
  const btn = `${mobile ? 'h-10 text-sm' : 'h-7 text-xs'} px-2`;
  const sw = 'data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border';
  const head = 'pt-3 text-[11px] font-semibold uppercase tracking-wide text-t-muted';
  const row = `flex items-center justify-between gap-3 text-t-muted ${mobile ? 'min-h-10' : 'min-h-8'}`;
  const input = `${mobile ? 'h-10 w-28 text-sm' : 'h-7 w-24 text-xs'} rounded border border-t-border bg-t-bg px-1.5 text-t-text`;
  const pick = <T,>(label: string, values: readonly T[], value: T, set: (v: T) => void, text: (v: T) => string) => <div role="group" aria-label={label} className="flex flex-wrap gap-1">{values.map(v => <Button key={String(v)} type="button" variant="ghost" aria-pressed={value === v} onClick={() => set(v)} className={`${btn} ${value === v ? on : off}`}>{text(v)}</Button>)}</div>;
  const winLabel = (w: number) => w >= 120 ? `${w / 60}h` : `${w}m`;
  return <div className={`space-y-1 px-3 ${mobile ? 'text-sm' : 'text-xs'}`} data-testid="heatmap-edit">
    <p data-testid="history-kept" className="text-t-muted">{h.retentionText}{h.recordedNote && ' · Recorded history: BTCUSDT only'}</p>
    {h.historyText && <p className="text-t-muted tabular-nums">{h.historyText}</p>}
    <label className={row}>Contrast<input type="range" min={0.2} max={3} step={0.1} value={h.intensity} onChange={e => h.setIntensity(Number(e.target.value))} aria-label="Contrast" className="w-36 accent-current" /></label>
    <div className={head}>Time window</div>{pick<number>('Time window', h.windows, h.windowMin, h.setWindowMin, winLabel)}
    <div className={head}>Grouping</div>{pick<number>('Grouping', h.groupings, h.grouping, h.setGrouping, g => `x${g}`)}
    <div className={head}>Trade bubbles</div>
    <label className={row}>Trade bubbles<Switch aria-label="Toggle trade bubbles" checked={h.bubblesOn} onCheckedChange={h.setBubblesOn} className={sw} /></label>
    <label className={row}>Min bubble size (USDT)<input type="number" min={0} step={1000} value={h.minBubble} onChange={e => h.setMinBubble(Math.max(0, Number(e.target.value) || 0))} aria-label="Minimum bubble size" className={input} /></label>
    <div className={row}>Bubble volume unit{pick<'USDT' | 'BTC'>('Bubble volume unit', ['USDT', 'BTC'], h.unit, h.selectUnit, u => u === 'USDT' ? u : h.coinLabel)}</div>
    <div className={head}>Wall lines</div>
    <label className={row}><span className="flex items-center gap-1">Wall lines<span title={WALL_INFO} aria-label={WALL_INFO} role="img" data-testid="wall-info" className="cursor-help"><Info className="size-3" /></span></span><Switch aria-label="Toggle wall lines" checked={h.walls.on} onCheckedChange={v => h.updateWalls({ on: v })} className={sw} /></label>
    <div className={row}>Size{pick<number>('Wall size percentile', WALL_PERCENTILES, h.walls.percentile, v => h.updateWalls({ percentile: v }), v => `Top ${v}%`)}</div>
    <div className={row}>Minimum time{pick<number>('Wall minimum time', WALL_MIN_TIMES, h.walls.minMs, v => h.updateWalls({ minMs: v }), v => wallAge(v))}</div>
    <div className={row}>Fade after{pick<number>('Wall fade time', WALL_FADES, h.walls.fadeMs, v => h.updateWalls({ fadeMs: v }), v => wallAge(v).replace(' 0m', ''))}</div>
    <label className={row}>Show pulled walls<Switch aria-label="Show pulled walls" checked={h.walls.showPulled} onCheckedChange={v => h.updateWalls({ showPulled: v })} className={sw} /></label>
    <label className={row}>Show broken walls<Switch aria-label="Show broken walls" checked={h.walls.showBroken} onCheckedChange={v => h.updateWalls({ showBroken: v })} className={sw} /></label>
    <div className={head}>Time & Sales</div>
    <label className={row}>Show only above (USDT)<input type="number" min={0} step={1000} value={h.pro.tapeMin} onChange={e => h.updatePro({ tapeMin: Math.max(0, Number(e.target.value) || 0) })} aria-label="Time and sales minimum size" className={input} /></label>
    {mobile && <><div className={head}>Phone panels</div>
      {([['ladder', 'Book'], ['panels', 'Panels'], ['tape', 'Time & Sales']] as const).map(([k, label]) => <label key={k} className={row}>{label}<Switch aria-label={`Show ${label}`} checked={h.mob[k]} onCheckedChange={v => h.setMob({ ...h.mob, [k]: v })} className={sw} /></label>)}</>}
    <div className={head}>Panels, markers & alerts</div>
    <HeatmapProPanel mobile={mobile} pro={h.pro} update={h.updatePro} alerts={h.alerts} updateAlerts={h.updateAlerts} recordedNote={false} signedIn={h.signedIn} />
  </div>;
}

const readDom = () => { try { return restoreDomSettings(localStorage.getItem(DOM_KEY)); } catch { return { ...DOM_DEFAULT }; } };
const writeDom = (next: DomSettings) => { try { localStorage.setItem(DOM_KEY, JSON.stringify(next)); } catch { /* unavailable browser storage */ } window.dispatchEvent(new Event(DOM_SYNC_EVENT)); };
export const resetDom = () => writeDom(resetToDefault('DOM', DOM_DEFAULT, readDom()));
/** DOM ladder settings; saves announce themselves so the mounted ladder re-reads them. */
export function DomEditSection() {
  const [s, setS] = useState<DomSettings>(readDom), [row, setRow] = useState(domRow.label);
  useEffect(() => { const read = () => setS(readDom()), rowRead = () => setRow(domRow.label); window.addEventListener(DOM_SYNC_EVENT, read); window.addEventListener(DOM_ROW_EVENT, rowRead); return () => { window.removeEventListener(DOM_SYNC_EVENT, read); window.removeEventListener(DOM_ROW_EVENT, rowRead); }; }, []);
  return <div className="px-3"><DomSettingsFields settings={s} change={next => { setS(next); writeDom(next); }} rowLabel={row} /></div>;
}

export const resetRadar = () => saveRadarState(readRadarState(null));
/** Flow Radar settings; saves announce themselves so the mounted radar re-reads them. */
export function RadarEditSection({ minutes }: { minutes: number }) {
  const [s, setS] = useState<RadarState>(loadRadarState);
  useEffect(() => { const read = () => setS(loadRadarState()); window.addEventListener(RADAR_SYNC_EVENT, read); return () => window.removeEventListener(RADAR_SYNC_EVENT, read); }, []);
  return <div className="px-3"><FlowRadarSettingsForm s={s} minutes={minutes} save={p => { const next = { ...loadRadarState(), ...p }; setS(next); saveRadarState(next); }} /></div>;
}
