import { useEffect, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { GROUPS, buildCandle, since, type FootprintSettings } from '@/lib/footprint-data';
import { peekFootprint } from '@/lib/footprint-store';
import type { TradeSource } from '@/lib/live-price';

export function FootprintGear({ onClick }: { onClick: () => void }) { return <DropdownMenuItem asChild onSelect={onClick}><Button variant="ghost" size="icon" aria-label="Footprint settings" title="Footprint settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4"/></Button></DropdownMenuItem>; }
const NAMES: Record<TradeSource, string> = { binance: 'Binance', bybit: 'Bybit' };
export function FootprintSettingsPanel({ settings, onChange, onClose, mobile, theme, source, symbol, tick, minutes }: { settings: FootprintSettings; onChange: (s: FootprintSettings) => void; onClose: () => void; mobile: boolean; theme: string; source: TradeSource; symbol: string; tick: number; minutes: number }) {
  const [first, setFirst] = useState<number | null>(null);
  const [autoSize, setAutoSize] = useState('');
  const [debug, setDebug] = useState<string[] | null>(null);
  const runDebug = async () => {
    const ms = minutes * 60000, start = Math.floor(Date.now() / ms) * ms - ms, store = peekFootprint(source, symbol);
    const rowSize = Number(document.querySelector<HTMLElement>('[data-testid="footprint"]')?.dataset['rowSize']) || tick;
    const group = Math.max(1, Math.round(rowSize / tick));
    const fp = store ? buildCandle(store, start, minutes, group, settings.ratio) : null;
    setDebug(['Loading kline volume…']);
    let kline = NaN;
    try {
      const url = source === 'binance' ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${start}&endTime=${start + ms - 1}&limit=1500` : `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=1&start=${start}&end=${start + ms - 1}&limit=1000`;
      const body = await (await fetch(url)).json(), list: string[][] = source === 'binance' ? body : body?.result?.list ?? [];
      kline = list.filter(k => Number(k[0]) >= start && Number(k[0]) < start + ms).reduce((a, k) => a + Number(k[5]), 0);
    } catch { /* reported below */ }
    const buy = fp?.ask ?? 0, sell = fp?.bid ?? 0, total = buy + sell, full = fp?.coverage === 'full';
    const diff = kline > 0 ? Math.abs(total - kline) / kline * 100 : NaN;
    const pass = full && diff <= 5;
    const verdict = !Number.isFinite(kline) ? 'FAIL (kline volume unavailable)' : !full ? `FAIL (candle not fully covered by collected trades: ${fp?.coverage ?? 'none'})` : pass ? `PASS (${diff.toFixed(2)}% diff)` : `FAIL (${diff.toFixed(2)}% diff)`;
    const lines = [`Candle open: ${new Date(start).toLocaleString('en-GB')}`, `Row size: ${+rowSize.toPrecision(10)}`, `Rows: ${fp?.rows.length ?? 0}`, `Buy volume: ${buy.toFixed(4)}`, `Sell volume: ${sell.toFixed(4)}`, `Footprint total: ${total.toFixed(4)}`, `Kline volume: ${Number.isFinite(kline) ? kline.toFixed(4) : '—'}`, `Result: ${verdict}`];
    console.info(`[DepthLens] Footprint debug ${symbol} ${minutes}m: ${verdict}`, lines.join(' | '));
    setDebug(lines);
  };
  useEffect(() => { const read = () => { const s = peekFootprint(source, symbol); setFirst(s ? since(s) : null); setAutoSize(document.querySelector<HTMLElement>('[data-testid="footprint"]')?.dataset['rowSize'] ?? ''); }; read(); const t = setInterval(read, 1000); return () => clearInterval(t); }, [source, symbol]);
  const input = 'h-10 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text';
  const sw = 'data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border';
  const unit = (g: number) => +(g * tick).toPrecision(8);
  const hhmm = first === null ? '—' : new Date(first).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return <div data-theme={theme} data-mobile={mobile || undefined} className={`fixed inset-0 z-50 flex bg-t-bg/60 ${mobile ? 'items-end' : 'items-start justify-end pt-36 pr-4'}`} onClick={onClose}><section role="dialog" aria-modal="true" aria-label="Footprint settings" onClick={e => e.stopPropagation()} className={`border border-t-border bg-t-panel p-4 text-t-text ${mobile ? 'max-h-[85dvh] w-full overflow-y-auto rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]' : 'w-80 rounded-md'}`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Footprint</h2><Button variant="ghost" size="icon" aria-label="Close Footprint settings" className="size-10 text-t-muted hover:bg-t-border" onClick={onClose}><X/></Button></div>
    <div className="grid grid-cols-[1fr_1fr] items-center gap-3 text-sm">
      <label htmlFor="fp-mode">Mode</label><select id="fp-mode" aria-label="Footprint mode" className={input} value={settings.mode} onChange={e => onChange({ ...settings, mode: e.target.value as FootprintSettings['mode'] })}><option value="bidask">Bid x Ask</option><option value="delta">Delta</option><option value="volume">Volume</option></select>
      <label htmlFor="fp-group">Row grouping</label><select id="fp-group" aria-label="Row grouping" className={input} value={String(settings.grouping)} onChange={e => onChange({ ...settings, grouping: e.target.value === 'Auto' ? 'Auto' : Number(e.target.value) })}><option value="Auto">Auto{autoSize && settings.grouping === 'Auto' ? ` = ${autoSize}` : ''}</option>{GROUPS.map(g => <option key={g} value={g}>x{g} = {unit(g)}</option>)}</select>
      <label htmlFor="fp-unit">Volume unit</label><select id="fp-unit" aria-label="Volume unit" className={input} value={settings.unit} onChange={e => onChange({ ...settings, unit: e.target.value === 'coin' ? 'coin' : 'USDT' })}><option value="USDT">USDT</option><option value="coin">coin</option></select>
      <label htmlFor="fp-imb">Imbalance</label><div className="flex h-10 items-center"><Switch id="fp-imb" aria-label="Imbalance" checked={settings.imbalance} onCheckedChange={imbalance => onChange({ ...settings, imbalance })} className={sw}/></div>
      <label htmlFor="fp-ratio">Imbalance ratio {settings.ratio}%</label><input id="fp-ratio" aria-label="Imbalance ratio" type="range" min={150} max={500} step={25} value={settings.ratio} onChange={e => onChange({ ...settings, ratio: Number(e.target.value) })} className="h-10 w-full accent-t-accent"/>
      <label htmlFor="fp-totals">Candle totals</label><div className="flex h-10 items-center"><Switch id="fp-totals" aria-label="Candle totals" checked={settings.totals} onCheckedChange={totals => onChange({ ...settings, totals })} className={sw}/></div>
      <label htmlFor="fp-poc">POC</label><div className="flex h-10 items-center"><Switch id="fp-poc" aria-label="Footprint POC" checked={settings.poc} onCheckedChange={poc => onChange({ ...settings, poc })} className={sw}/></div>
      <label htmlFor="fp-opacity">Opacity {Math.round(settings.opacity * 100)}%</label><input id="fp-opacity" aria-label="Footprint opacity" type="range" min={.1} max={1} step={.05} value={settings.opacity} onChange={e => onChange({ ...settings, opacity: Number(e.target.value) })} className="h-10 w-full accent-t-accent"/>
    </div>
    <p className="mt-4 text-xs text-t-muted" data-testid="footprint-since">Footprint data since {hhmm}</p>
    <p className="mt-1 text-xs text-t-muted">Real trades from {NAMES[source]} only</p>
    <Button variant="outline" className="mt-3 h-10 w-full border-t-border bg-t-bg text-t-text hover:bg-t-border" onClick={() => void runDebug()}>Footprint debug</Button>
    {debug && <pre data-testid="footprint-debug" className="mt-2 whitespace-pre-wrap rounded border border-t-border bg-t-bg p-2 text-xs text-t-text">{debug.join('\n')}</pre>}
  </section></div>;
}
