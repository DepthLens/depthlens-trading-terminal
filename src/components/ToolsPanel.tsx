import { useEffect, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MenuDropdown } from '@/components/MenuDropdown';
import { filterGroups, type ToolRow } from '@/lib/tools-panel';
import { HEATMAP_WALLS_KEY, restoreWallSettings, type WallSettings } from '@/lib/heatmap-walls';
import { HEATMAP_PRO_KEY, restoreProSettings, type ProSettings } from '@/lib/heatmap-pro';

export const HEATMAP_SYNC_EVENT = 'depthlens-heatmap-settings';
const readWalls = () => { try { return restoreWallSettings(localStorage.getItem(HEATMAP_WALLS_KEY)); } catch { return restoreWallSettings(null); } };
const readPro = () => { try { return restoreProSettings(localStorage.getItem(HEATMAP_PRO_KEY)); } catch { return restoreProSettings(null); } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable browser storage */ } window.dispatchEvent(new Event(HEATMAP_SYNC_EVENT)); };

export type ToolsPanelProps = {
  open: boolean; onClose: () => void; mobile: boolean; theme: string;
  tools: Record<string, boolean>; setTool: (id: string, on: boolean) => void; allOff: () => void;
  disabledReason?: string | null;
  /** The Order flow button the menu drops down from. */
  button: ReactNode;
};

/** Order flow menu: tool names with on/off switches only; settings live in the Edit menu. */
export function ToolsPanel(p: ToolsPanelProps) {
  const [query, setQuery] = useState('');
  const [walls, setWalls] = useState<WallSettings>(readWalls), [pro, setPro] = useState<ProSettings>(readPro);
  useEffect(() => { if (p.open) { setWalls(readWalls()); setPro(readPro()); } }, [p.open]);
  const updWalls = (patch: Partial<WallSettings>) => { const n = { ...readWalls(), ...patch }; setWalls(n); save(HEATMAP_WALLS_KEY, n); };
  const updPro = (patch: Partial<ProSettings>) => { const n = { ...readPro(), ...patch }; setPro(n); save(HEATMAP_PRO_KEY, n); };
  const isOn = (r: ToolRow) => r.kind === 'info' ? true : r.id === 'Wall lines' ? walls.on : r.id === 'Time & Sales' ? pro.tape : r.id === 'Control & Attack bars' ? p.tools[r.id] !== false : Boolean(p.tools[r.id]);
  const toggle = (r: ToolRow, on: boolean) => r.id === 'Wall lines' ? updWalls({ on }) : r.id === 'Time & Sales' ? updPro({ tape: on }) : p.setTool(r.id, on);
  const sw = 'data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border';
  const groups = filterGroups(query);
  return <MenuDropdown open={p.open} onClose={p.onClose} button={p.button} label="Tools" mobile={p.mobile} theme={p.theme}>
    <div className="flex items-center justify-between px-3 pt-3"><h2 className="text-base font-semibold">Tools <span className="ml-1 text-xs font-semibold text-t-accent">Paid</span></h2><Button variant="ghost" size="icon" aria-label="Close tools" onClick={p.onClose} className="size-9 text-t-muted hover:bg-t-border"><X /></Button></div>
    <div className="p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-t-muted" /><input aria-label="Search tools" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tools" className="h-9 w-full rounded-md border border-t-border bg-t-bg pl-8 pr-2 text-sm outline-none focus:border-t-accent" /></div></div>
    {p.disabledReason && <p role="note" className="mx-3 mb-2 rounded border border-t-border px-2 py-1.5 text-xs text-t-muted">{p.disabledReason}</p>}
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      {groups.map(g => <div key={g.title} className="pb-1"><h3 className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-t-muted">{g.title}</h3>
        {g.rows.map(r => { const on = isOn(r), dis = Boolean(p.disabledReason) && r.kind !== 'info'; return <div key={r.id} className={`flex min-h-12 items-center gap-2 px-3 py-1.5 ${dis ? 'opacity-50' : ''}`}>
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${on && !dis ? 'bg-t-accent' : 'bg-transparent'}`} />
          <label htmlFor={`tool-${r.id}`} className="min-w-0 flex-1"><span className="block truncate text-sm">{r.name}</span><span className="block truncate text-[11px] text-t-muted">{r.desc}</span></label>
          {r.kind === 'info' ? <span className="text-[10px] text-t-muted">Always on</span> : <Switch id={`tool-${r.id}`} aria-label={r.name} disabled={dis} checked={on} onCheckedChange={v => toggle(r, v)} className={sw} />}
        </div>; })}
      </div>)}
      {!groups.length && <p className="px-3 py-4 text-xs text-t-muted">No matching tools</p>}
    </div>
    <div className="border-t border-t-border px-3 py-2"><button type="button" onClick={() => { p.allOff(); updWalls({ on: false }); updPro({ tape: false }); }} className="text-xs text-t-muted underline-offset-2 hover:text-t-text hover:underline">Turn all off</button></div>
  </MenuDropdown>;
}
