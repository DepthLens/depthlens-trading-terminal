import { Settings, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CVD_ANCHORS, CVD_MODES, type CvdSettings } from '@/lib/cvd-data';

export function CvdGear({ onClick }: { onClick: () => void }) {
  return <DropdownMenuItem asChild onSelect={onClick}><Button variant="ghost" size="icon" aria-label="CVD settings" title="CVD settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4"/></Button></DropdownMenuItem>;
}
export function CvdSettingsPanel({ settings, onChange, onClose, mobile, theme }: { settings:CvdSettings; onChange:(value:CvdSettings)=>void; onClose:()=>void; mobile:boolean; theme:string }) {
  const input = 'h-10 min-w-0 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  return <div data-theme={theme} data-mobile={mobile||undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile?'items-end':'items-start justify-end pt-36 pr-4'}`} onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="CVD settings" onClick={e=>e.stopPropagation()} className={`border border-t-border bg-t-panel p-4 text-t-text ${mobile?'w-full rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]':'w-80 rounded-md'}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">CVD</h2><Button variant="ghost" size="icon" aria-label="Close CVD settings" className="size-10 text-t-muted hover:bg-t-border" onClick={onClose}><X/></Button></div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-sm">
        <label htmlFor="cvd-anchor">Anchor</label><select id="cvd-anchor" aria-label="CVD anchor" className={input} value={settings.anchor} onChange={e=>onChange({...settings,anchor:e.target.value as CvdSettings['anchor']})}>{CVD_ANCHORS.map(v=><option key={v}>{v}</option>)}</select>
        <label htmlFor="cvd-mode">Mode</label><select id="cvd-mode" aria-label="CVD mode" className={input} value={settings.mode} onChange={e=>onChange({...settings,mode:e.target.value as CvdSettings['mode']})}>{CVD_MODES.map(v=><option key={v}>{v}</option>)}</select>
        <label htmlFor="cvd-unit">Unit</label><select id="cvd-unit" aria-label="CVD unit" className={input} value={settings.unit} onChange={e=>onChange({...settings,unit:e.target.value as CvdSettings['unit']})}><option>USDT</option><option>coin</option></select>
      </div>
      <Button variant="ghost" className="mt-3 w-full justify-start text-t-muted hover:bg-t-border" onClick={()=>onChange({...settings,height:null})}><RotateCcw className="size-4"/>Reset pane height</Button>
    </section>
  </div>;
}