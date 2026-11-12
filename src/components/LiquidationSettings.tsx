import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LIQ_PRESETS, type LiqSettings } from '@/lib/liquidation-data';
export function LiquidationGear({ onClick }: { onClick: () => void }) { return <DropdownMenuItem asChild onSelect={onClick}><Button variant="ghost" size="icon" aria-label="Liquidations settings" title="Liquidations settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4"/></Button></DropdownMenuItem>; }
export function LiquidationSettingsPanel({ settings: s, onChange, onClose, mobile, theme, source }: { settings: LiqSettings; onChange: (s: LiqSettings) => void; onClose: () => void; mobile: boolean; theme: string; source: string }) {
  const input = 'h-10 min-w-0 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  const mode = s.threshold === 'Auto' ? 'Auto' : LIQ_PRESETS.includes(s.threshold) ? String(s.threshold) : 'custom';
  return <div data-theme={theme} data-mobile={mobile || undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile ? 'items-end' : 'items-start justify-end pt-36 pr-4'}`} onClick={onClose}><section role="dialog" aria-modal="true" aria-label="Liquidations settings" onClick={e => e.stopPropagation()} className={`max-h-[90dvh] overflow-y-auto border border-t-border bg-t-panel p-4 text-t-text ${mobile ? 'w-full rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]' : 'w-80 rounded-md'}`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Liquidations</h2><Button variant="ghost" size="icon" aria-label="Close Liquidations settings" onClick={onClose}><X/></Button></div>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-sm">
      <div className="col-span-2 flex min-h-10 items-center justify-between"><label htmlFor="liq-bubbles">Bubbles</label><Switch id="liq-bubbles" checked={s.bubbles} onCheckedChange={v => onChange({ ...s, bubbles: v })} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border"/></div>
      <label htmlFor="liq-threshold">Threshold</label><select id="liq-threshold" className={input} value={mode} onChange={e => onChange({ ...s, threshold: e.target.value === 'Auto' ? 'Auto' : e.target.value === 'custom' ? 75000 : Number(e.target.value) })}><option>Auto</option>{LIQ_PRESETS.map(v => <option key={v} value={v}>{v >= 1e6 ? '1M' : `${v / 1000}K`}</option>)}<option value="custom">Custom</option></select>
      {mode === 'custom' && <><label htmlFor="liq-custom">USDT</label><input id="liq-custom" className={input} type="number" min="1" value={s.threshold as number} onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ ...s, threshold: v }); }}/></>}
      <label htmlFor="liq-unit">Unit</label><select id="liq-unit" className={input} value={s.unit} onChange={e => onChange({ ...s, unit: e.target.value as LiqSettings['unit'] })}><option>USDT</option><option value="coin">Coin</option></select>
      <label htmlFor="liq-side">Side</label><select id="liq-side" className={input} value={s.side} onChange={e => onChange({ ...s, side: e.target.value as LiqSettings['side'] })}>{['Both', 'Long', 'Short'].map(v => <option key={v}>{v}</option>)}</select>
      <Button variant="ghost" className="col-span-2 border border-t-border" onClick={() => onChange({ ...s, height: null })}>Reset pane height</Button>
    </div><p className="mt-3 text-xs text-t-muted">Liquidations on {source} only</p></section></div>;
}
