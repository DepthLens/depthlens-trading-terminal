import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { FbSettings } from '@/lib/flow-bars';

export function FlowBarsSettingsPanel({ settings, onChange, onClose, mobile, theme }: { settings: FbSettings; onChange: (v: FbSettings) => void; onClose: () => void; mobile: boolean; theme: string }) {
  const input = 'h-10 min-w-0 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  const n = (v: string, d: number) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
  return <div data-theme={theme} data-mobile={mobile || undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile ? 'items-end' : 'items-start justify-end pt-36 pr-4'}`} onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Control & Attack bars settings" onClick={e => e.stopPropagation()} className={`border border-t-border bg-t-panel p-4 text-t-text ${mobile ? 'w-full rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]' : 'w-80 rounded-md'}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Control & Attack bars</h2><Button variant="ghost" size="icon" aria-label="Close Control & Attack bars settings" className="size-10 text-t-muted hover:bg-t-border" onClick={onClose}><X /></Button></div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-sm">
        <label htmlFor="fb-lookback">Lookback N</label><input id="fb-lookback" type="number" min={2} max={500} className={input} value={settings.lookback} onChange={e => onChange({ ...settings, lookback: Math.max(2, Math.min(500, Math.round(n(e.target.value, 20)))) })} />
        <label htmlFor="fb-threshold">Attack threshold</label><input id="fb-threshold" type="number" step={0.05} min={0.01} className={input} value={settings.threshold} onChange={e => onChange({ ...settings, threshold: Math.max(0.01, n(e.target.value, 0.25)) })} />
        <label htmlFor="fb-sentences">Show sentences</label><Switch id="fb-sentences" checked={settings.sentences} onCheckedChange={sentences => onChange({ ...settings, sentences })} />
      </div>
    </section>
  </div>;
}
