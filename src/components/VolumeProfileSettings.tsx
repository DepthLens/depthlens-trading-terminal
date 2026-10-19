import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ProfileSettings } from '@/lib/volume-profile';

export function VolumeProfileGear({ onClick }: { onClick: () => void }) { return <Button variant="ghost" size="icon" aria-label="Volume Profile settings" title="Volume Profile settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10" onClick={onClick}><Settings className="size-4"/></Button>; }
export function VolumeProfileSettingsPanel({ settings, onChange, onClose, mobile, theme }: { settings: ProfileSettings; onChange: (s: ProfileSettings) => void; onClose: () => void; mobile: boolean; theme: string }) {
  const input='h-10 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  return <div data-theme={theme} data-mobile={mobile||undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile?'items-end':'items-start justify-end pt-36 pr-4'}`} onClick={onClose}><section role="dialog" aria-modal="true" aria-label="Volume Profile settings" onClick={e=>e.stopPropagation()} className={`border border-t-border bg-t-panel p-4 text-t-text ${mobile?'w-full rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]':'w-80 rounded-md'}`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Volume Profile</h2><Button variant="ghost" size="icon" aria-label="Close Volume Profile settings" className="size-10 text-t-muted hover:bg-t-border" onClick={onClose}><X/></Button></div>
    <div className="grid grid-cols-[1fr_1fr] items-center gap-3 text-sm">
      <label htmlFor="vp-range">Range</label><select id="vp-range" aria-label="Profile range" className={input} value={settings.range} onChange={e=>onChange({...settings,range:e.target.value as ProfileSettings['range']})}>{['Visible','4h','12h','24h','3d'].map(v=><option key={v}>{v}</option>)}</select>
      <label htmlFor="vp-rows">Rows</label><select id="vp-rows" aria-label="Profile rows" className={input} value={settings.rows} onChange={e=>onChange({...settings,rows:e.target.value as ProfileSettings['rows']})}>{['Auto','50','100'].map(v=><option key={v}>{v}</option>)}</select>
      <label htmlFor="vp-area">Value Area %</label><input id="vp-area" aria-label="Value Area percent" type="number" min={50} max={90} className={`${input} w-full`} value={settings.valueArea} onChange={e=>onChange({...settings,valueArea:Math.max(50,Math.min(90,Number(e.target.value)||50))})}/>
      <label htmlFor="vp-split">Buy/Sell split</label><div className="flex h-10 items-center"><Switch id="vp-split" aria-label="Buy/Sell split" checked={settings.split} onCheckedChange={split=>onChange({...settings,split})} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>
      <label htmlFor="vp-position">Position</label><select id="vp-position" aria-label="Profile position" className={input} value={settings.position} onChange={e=>onChange({...settings,position:e.target.value as ProfileSettings['position']})}><option value="right">Right</option><option value="left">Left</option></select>
      <label htmlFor="vp-opacity">Opacity {Math.round(settings.opacity*100)}%</label><input id="vp-opacity" aria-label="Profile opacity" type="range" min={.1} max={.9} step={.05} value={settings.opacity} onChange={e=>onChange({...settings,opacity:Number(e.target.value)})} className="h-10 w-full accent-t-accent"/>
    </div><p className="mt-4 text-xs text-t-muted">Estimated from 1m candles</p>
  </section></div>;
}