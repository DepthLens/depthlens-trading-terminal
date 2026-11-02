import { Settings, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { CVD_ANCHORS } from '@/lib/cvd-data';
import { PP_WEIGHTS, type PpSettings } from '@/lib/price-pressure';

export function PricePressureGear({ onClick }: { onClick: () => void }) {
  return <DropdownMenuItem asChild onSelect={onClick}><Button variant="ghost" size="icon" aria-label="Price Pressure settings" title="Price Pressure settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4"/></Button></DropdownMenuItem>;
}
export function PricePressureSettingsPanel({ settings, onChange, onClose, mobile, theme }: { settings: PpSettings; onChange: (v: PpSettings) => void; onClose: () => void; mobile: boolean; theme: string }) {
  const input = 'h-10 min-w-0 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  const n = (v: string, d: number) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
  return <div data-theme={theme} data-mobile={mobile || undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile ? 'items-end' : 'items-start justify-end pt-36 pr-4'}`} onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Price Pressure settings" onClick={e => e.stopPropagation()} className={`max-h-[85dvh] overflow-y-auto border border-t-border bg-t-panel p-4 text-t-text ${mobile ? 'w-full rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]' : 'w-80 rounded-md'}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Price Pressure</h2><Button variant="ghost" size="icon" aria-label="Close Price Pressure settings" className="size-10 text-t-muted hover:bg-t-border" onClick={onClose}><X/></Button></div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-sm">
        <label htmlFor="pp-anchor">Anchor</label><select id="pp-anchor" className={input} value={settings.anchor} onChange={e => onChange({ ...settings, anchor: e.target.value as PpSettings['anchor'] })}>{CVD_ANCHORS.map(v => <option key={v}>{v}</option>)}</select>
        <label htmlFor="pp-lookback">Control lookback N</label><input id="pp-lookback" type="number" min={2} max={500} className={input} value={settings.lookback} onChange={e => onChange({ ...settings, lookback: Math.max(2, Math.round(n(e.target.value, 20))) })}/>
        <label htmlFor="pp-threshold">Attack threshold</label><input id="pp-threshold" type="number" step={0.05} min={0.01} className={input} value={settings.threshold} onChange={e => onChange({ ...settings, threshold: Math.max(0.01, n(e.target.value, 0.25)) })}/>
        <label htmlFor="pp-atr">ATR period</label><input id="pp-atr" type="number" min={2} max={200} className={input} value={settings.atr} onChange={e => onChange({ ...settings, atr: Math.max(2, Math.round(n(e.target.value, 14))) })}/>
        <label htmlFor="pp-markers">Markers on chart</label><Switch id="pp-markers" checked={settings.markers} onCheckedChange={markers => onChange({ ...settings, markers })}/>
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-t-muted">Weights (advanced)</summary>
        <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          {(['body', 'close', 'wick'] as const).map(k => <><label key={k + 'l'} htmlFor={`pp-w-${k}`}>{k === 'close' ? 'Close location' : k === 'wick' ? 'Wick rejection' : 'Body'}</label><input key={k} id={`pp-w-${k}`} type="number" step={0.05} min={0} max={1} className={input} value={settings.weights[k]} onChange={e => onChange({ ...settings, weights: { ...settings.weights, [k]: Math.max(0, Math.min(1, n(e.target.value, PP_WEIGHTS[k]))) } })}/></>)}
        </div>
        <Button variant="ghost" className="mt-2 w-full justify-start text-t-muted hover:bg-t-border" onClick={() => onChange({ ...settings, weights: { ...PP_WEIGHTS } })}><RotateCcw className="size-4"/>Reset weights</Button>
      </details>
      <Button variant="ghost" className="mt-3 w-full justify-start text-t-muted hover:bg-t-border" onClick={() => onChange({ ...settings, heights: [null, null], collapsed: [false, false] })}><RotateCcw className="size-4"/>Reset pane heights</Button>
    </section>
  </div>;
}
