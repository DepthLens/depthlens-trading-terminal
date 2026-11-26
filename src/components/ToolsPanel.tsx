import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Search, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { filterGroups, type ToolRow } from '@/lib/tools-panel';
import { HEATMAP_WALLS_KEY, restoreWallSettings, WALL_PERCENTILES, WALL_MIN_TIMES, type WallSettings } from '@/lib/heatmap-walls';
import { HEATMAP_PRO_KEY, restoreProSettings, type ProSettings } from '@/lib/heatmap-pro';

export const HEATMAP_SYNC_EVENT = 'depthlens-heatmap-settings';
const readWalls = () => { try { return restoreWallSettings(localStorage.getItem(HEATMAP_WALLS_KEY)); } catch { return restoreWallSettings(null); } };
const readPro = () => { try { return restoreProSettings(localStorage.getItem(HEATMAP_PRO_KEY)); } catch { return restoreProSettings(null); } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable browser storage */ } window.dispatchEvent(new Event(HEATMAP_SYNC_EVENT)); };

export type ToolsPanelProps = {
  open: boolean; onClose: () => void; mobile: boolean; theme: string;
  tools: Record<string, boolean>; setTool: (id: string, on: boolean) => void; allOff: () => void;
  disabledReason?: string | null;
  /** Existing settings panel for a tool, rendered inside this panel; `back` returns to the list. */
  renderSettings: (id: string, back: () => void) => ReactNode | null;
  /** Gear action for tools whose settings live elsewhere (Flow Radar). */
  externalGear?: Record<string, () => void>;
  extras?: Record<string, ReactNode>;
};

export function ToolsPanel(p: ToolsPanelProps) {
  const [shown, setShown] = useState(p.open), [leaving, setLeaving] = useState(false);
  const [query, setQuery] = useState(''), [view, setView] = useState<ToolRow | null>(null);
  const [walls, setWalls] = useState<WallSettings>(readWalls), [pro, setPro] = useState<ProSettings>(readPro);
  useEffect(() => { if (p.open) { setShown(true); setLeaving(false); setWalls(readWalls()); setPro(readPro()); } else if (shown) { setLeaving(true); const t = setTimeout(() => { setShown(false); setLeaving(false); setView(null); }, 200); return () => clearTimeout(t); } return undefined; }, [p.open]);
  useEffect(() => { if (!p.open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (view) setView(null); else p.onClose(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [p.open, view, p.onClose]);
  if (!shown) return null;
  const updWalls = (patch: Partial<WallSettings>) => { const n = { ...walls, ...patch }; setWalls(n); save(HEATMAP_WALLS_KEY, n); };
  const updPro = (patch: Partial<ProSettings>) => { const n = { ...pro, ...patch }; setPro(n); save(HEATMAP_PRO_KEY, n); };
  const isOn = (r: ToolRow) => r.kind === 'info' ? true : r.id === 'Wall lines' ? walls.on : r.id === 'Time & Sales' ? pro.tape : r.id === 'Control & Attack bars' ? p.tools[r.id] !== false : Boolean(p.tools[r.id]);
  const toggle = (r: ToolRow, on: boolean) => r.id === 'Wall lines' ? updWalls({ on }) : r.id === 'Time & Sales' ? updPro({ tape: on }) : p.setTool(r.id, on);
  const hasGear = (r: ToolRow) => r.kind === 'heatmap' || r.id === 'Heatmap' || Boolean(p.externalGear?.[r.id]) || p.renderSettings(r.id, () => {}) !== null;
  const gear = (r: ToolRow) => { const ext = p.externalGear?.[r.id]; if (ext) { p.onClose(); ext(); } else setView(r); };
  const input = 'h-10 min-w-0 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  const sw = 'data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border';
  const heatmapView = (id: string) => id === 'Wall lines' ? <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-4 text-sm">
    <label htmlFor="tp-wall-pct">Size (top %)</label><select id="tp-wall-pct" className={input} value={walls.percentile} onChange={e => updWalls({ percentile: Number(e.target.value) })}>{WALL_PERCENTILES.map(v => <option key={v} value={v}>Top {v}%</option>)}</select>
    <label htmlFor="tp-wall-min">Min time</label><select id="tp-wall-min" className={input} value={walls.minMs} onChange={e => updWalls({ minMs: Number(e.target.value) })}>{WALL_MIN_TIMES.map(v => <option key={v} value={v}>{v / 60000 >= 1 ? `${v / 60000} min` : `${v / 1000}s`}</option>)}</select>
    <label htmlFor="tp-wall-pulled" className="col-span-1">Show pulled</label><Switch id="tp-wall-pulled" checked={walls.showPulled} onCheckedChange={v => updWalls({ showPulled: v })} className={`justify-self-end ${sw}`} />
    <label htmlFor="tp-wall-broken">Show broken</label><Switch id="tp-wall-broken" checked={walls.showBroken} onCheckedChange={v => updWalls({ showBroken: v })} className={`justify-self-end ${sw}`} />
  </div> : id === 'Time & Sales' ? <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-4 text-sm">
    <label htmlFor="tp-tape-min">Show only above (USDT)</label><input id="tp-tape-min" type="number" min={0} className={input} value={pro.tapeMin} onChange={e => updPro({ tapeMin: Math.max(0, Number(e.target.value) || 0) })} />
    <label htmlFor="tp-tape-big">Highlight above (USDT)</label><input id="tp-tape-big" type="number" min={0} className={input} value={pro.tapeBig} onChange={e => updPro({ tapeBig: Math.max(0, Number(e.target.value) || 0) })} />
  </div> : <div className="grid gap-1 p-4 text-sm">
    {([['ladder', 'Order book ladder'], ['svp', 'Session volume profile'], ['volume', 'Volume bars'], ['cvd', 'CVD panel'], ['imbalance', 'Book imbalance']] as const).map(([k, label]) => <div key={k} className="flex min-h-10 items-center justify-between"><label htmlFor={`tp-hm-${k}`}>{label}</label><Switch id={`tp-hm-${k}`} checked={pro[k]} onCheckedChange={v => updPro({ [k]: v })} className={sw} /></div>)}
    <p className="mt-2 text-xs text-t-muted">Colours, markers, replay and alerts stay in the Heatmap's own settings.</p>
  </div>;
  const groups = filterGroups(query);
  const anim = leaving ? (p.mobile ? 'tp-out-down' : 'tp-out-right') : (p.mobile ? 'tp-in-up' : 'tp-in-right');
  return <div data-theme={p.theme} data-mobile={p.mobile || undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${p.mobile ? 'items-end' : 'justify-end'} ${leaving ? 'tp-fade-out' : 'tp-fade-in'}`} onClick={p.onClose}>
    <section role="dialog" aria-modal="true" aria-label="Tools" onClick={e => e.stopPropagation()} className={`${anim} flex flex-col overflow-hidden border-t-border bg-t-panel text-t-text ${p.mobile ? 'max-h-[85dvh] w-full rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]' : 'h-full w-[22rem] border-l'}`}>
      {view ? <>
        <div className="flex items-center gap-2 border-b border-t-border px-2 py-2"><Button variant="ghost" size="sm" onClick={() => setView(null)} className="text-t-muted hover:bg-t-border hover:text-t-text"><ArrowLeft />Back to Tools</Button><span className="ml-auto pr-2 text-sm font-semibold">{view.name}</span></div>
        <div className="tools-embed min-h-0 flex-1 overflow-y-auto">{view.kind === 'heatmap' || view.id === 'Heatmap' ? heatmapView(view.id) : p.renderSettings(view.id, () => setView(null))}</div>
      </> : <>
        <div className="flex items-center justify-between px-3 pt-3"><h2 className="text-base font-semibold">Tools <span className="ml-1 text-xs font-semibold text-t-accent">Paid</span></h2><Button variant="ghost" size="icon" aria-label="Close tools" onClick={p.onClose} className="size-9 text-t-muted hover:bg-t-border"><X /></Button></div>
        <div className="p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-t-muted" /><input aria-label="Search tools" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tools" className="h-9 w-full rounded-md border border-t-border bg-t-bg pl-8 pr-2 text-sm outline-none focus:border-t-accent" /></div></div>
        {p.disabledReason && <p role="note" className="mx-3 mb-2 rounded border border-t-border px-2 py-1.5 text-xs text-t-muted">{p.disabledReason}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {groups.map(g => <div key={g.title} className="pb-1"><h3 className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-t-muted">{g.title}</h3>
            {g.rows.map(r => { const on = isOn(r), dis = Boolean(p.disabledReason) && r.kind !== 'info'; return <div key={r.id} className={`flex min-h-12 items-center gap-2 px-3 py-1.5 ${dis ? 'opacity-50' : ''}`}>
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${on && !dis ? 'bg-t-accent' : 'bg-transparent'}`} />
              <label htmlFor={`tool-${r.id}`} className="min-w-0 flex-1"><span className="block truncate text-sm">{r.name}</span><span className="block truncate text-[11px] text-t-muted">{r.desc}</span></label>
              {p.extras?.[r.id]}
              {!dis && hasGear(r) && <Button type="button" variant="ghost" size="icon" aria-label={`${r.name} settings`} title={`${r.name} settings`} onClick={() => gear(r)} className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4" /></Button>}
              {r.kind === 'info' ? <span className="text-[10px] text-t-muted">Always on</span> : <Switch id={`tool-${r.id}`} aria-label={r.name} disabled={dis} checked={on} onCheckedChange={v => toggle(r, v)} className={sw} />}
            </div>; })}
          </div>)}
          {!groups.length && <p className="px-3 py-4 text-xs text-t-muted">No matching tools</p>}
        </div>
        <div className="border-t border-t-border px-3 py-2"><button type="button" onClick={() => { p.allOff(); updWalls({ on: false }); updPro({ tape: false }); }} className="text-xs text-t-muted underline-offset-2 hover:text-t-text hover:underline">Turn all off</button></div>
      </>}
    </section>
  </div>;
}
