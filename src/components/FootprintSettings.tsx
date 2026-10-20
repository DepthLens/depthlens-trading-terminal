import { useEffect, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { GROUPS, since, type FootprintSettings } from '@/lib/footprint-data';
import { peekFootprint } from '@/lib/footprint-store';
import type { TradeSource } from '@/lib/live-price';

export function FootprintGear({ onClick }: { onClick: () => void }) { return <DropdownMenuItem asChild onSelect={onClick}><Button variant="ghost" size="icon" aria-label="Footprint settings" title="Footprint settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4"/></Button></DropdownMenuItem>; }
const NAMES: Record<TradeSource, string> = { binance: 'Binance', bybit: 'Bybit' };
export function FootprintSettingsPanel({ settings, onChange, onClose, mobile, theme, source, symbol, tick }: { settings: FootprintSettings; onChange: (s: FootprintSettings) => void; onClose: () => void; mobile: boolean; theme: string; source: TradeSource; symbol: string; tick: number }) {
  const [first, setFirst] = useState<number | null>(null);
  useEffect(() => { const read = () => { const s = peekFootprint(source, symbol); setFirst(s ? since(s) : null); }; read(); const t = setInterval(read, 1000); return () => clearInterval(t); }, [source, symbol]);
  const input = 'h-10 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  const sw = 'data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border';
  const unit = (g: number) => +(g * tick).toPrecision(8);
  const hhmm = first === null ? '—' : new Date(first).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return <div data-theme={theme} data-mobile={mobile || undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile ? 'items-end' : 'items-start justify-end pt-36 pr-4'}`} onClick={onClose}><section role="dialog" aria-modal="true" aria-label="Footprint settings" onClick={e => e.stopPropagation()} className={`border border-t-border bg-t-panel p-4 text-t-text ${mobile ? 'max-h-[85dvh] w-full overflow-y-auto rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]' : 'w-80 rounded-md'}`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Footprint</h2><Button variant="ghost" size="icon" aria-label="Close Footprint settings" className="size-10 text-t-muted hover:bg-t-border" onClick={onClose}><X/></Button></div>
    <div className="grid grid-cols-[1fr_1fr] items-center gap-3 text-sm">
      <label htmlFor="fp-mode">Mode</label><select id="fp-mode" aria-label="Footprint mode" className={input} value={settings.mode} onChange={e => onChange({ ...settings, mode: e.target.value as FootprintSettings['mode'] })}><option value="bidask">Bid x Ask</option><option value="delta">Delta</option><option value="volume">Volume</option></select>
      <label htmlFor="fp-group">Row grouping</label><select id="fp-group" aria-label="Row grouping" className={input} value={String(settings.grouping)} onChange={e => onChange({ ...settings, grouping: e.target.value === 'Auto' ? 'Auto' : Number(e.target.value) })}><option value="Auto">Auto</option>{GROUPS.map(g => <option key={g} value={g}>x{g} = {unit(g)}</option>)}</select>
      <label htmlFor="fp-imb">Imbalance</label><div className="flex h-10 items-center"><Switch id="fp-imb" aria-label="Imbalance" checked={settings.imbalance} onCheckedChange={imbalance => onChange({ ...settings, imbalance })} className={sw}/></div>
      <label htmlFor="fp-ratio">Imbalance ratio {settings.ratio}%</label><input id="fp-ratio" aria-label="Imbalance ratio" type="range" min={150} max={500} step={25} value={settings.ratio} onChange={e => onChange({ ...settings, ratio: Number(e.target.value) })} className="h-10 w-full accent-t-accent"/>
      <label htmlFor="fp-totals">Candle totals</label><div className="flex h-10 items-center"><Switch id="fp-totals" aria-label="Candle totals" checked={settings.totals} onCheckedChange={totals => onChange({ ...settings, totals })} className={sw}/></div>
      <label htmlFor="fp-poc">POC</label><div className="flex h-10 items-center"><Switch id="fp-poc" aria-label="Footprint POC" checked={settings.poc} onCheckedChange={poc => onChange({ ...settings, poc })} className={sw}/></div>
      <label htmlFor="fp-opacity">Opacity {Math.round(settings.opacity * 100)}%</label><input id="fp-opacity" aria-label="Footprint opacity" type="range" min={.1} max={1} step={.05} value={settings.opacity} onChange={e => onChange({ ...settings, opacity: Number(e.target.value) })} className="h-10 w-full accent-t-accent"/>
    </div>
    <p className="mt-4 text-xs text-t-muted" data-testid="footprint-since">Footprint data since {hhmm}</p>
    <p className="mt-1 text-xs text-t-muted">Real trades from {NAMES[source]} only</p>
  </section></div>;
}
