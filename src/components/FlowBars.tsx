import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { attackInfo, barHeight, combinedSentence, controlInfo, controlSentence, Hold, scoreAll, useLiveCandle, type AttackInfo, type ControlInfo, type FbSettings } from '@/lib/flow-bars';
import type { Bar } from '@/lib/chart-data';
import type { Attack, Control } from '@/lib/price-pressure';

type ChartApi = { series: { data(): readonly unknown[] }; disposed?: boolean };
type Snapshot = { control: ControlInfo; shownControl: Control; attack: AttackInfo | null; shownAttack: Attack };

/** Reads the chart's own loaded candles at most once per second and applies the 2-update hold. */
function useFlow(chartRef: MutableRefObject<ChartApi | null>, minutes: number, settings: FbSettings, symbol: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    const hc = new Hold<Control>(), ha = new Hold<Attack>();
    setSnap(null);
    const run = () => {
      const api = chartRef.current;
      if (!api || api.disposed) return;
      const bars: Bar[] = (api.series.data() as any[]).filter(b => 'open' in b).map(b => ({ time: Number(b.time) * 1000, open: b.open, high: b.high, low: b.low, close: b.close }));
      if (bars.length < 2) return;
      const scores = scoreAll(bars), now = Date.now();
      const control = controlInfo(scores.slice(0, -1), settings.lookback);
      const attack = attackInfo(scores, useLiveCandle(bars.at(-1)!.time, minutes, now), settings.threshold);
      setSnap({ control, shownControl: hc.update(control.state, now), attack, shownAttack: ha.update(attack?.state ?? 'NONE', now) });
    };
    run();
    const id = setInterval(run, 1000);
    return () => clearInterval(id);
  }, [chartRef, minutes, settings.lookback, settings.threshold, symbol]);
  return snap;
}

const tone = (s: string) => s === 'BUYERS' ? 'text-t-up' : s === 'SELLERS' ? 'text-t-down' : 'text-t-muted';
const label = 'text-[11px] font-bold uppercase tracking-wide';

function Shell({ top, mobile, settings, onChange, title, children, sentence }: { top: boolean; mobile: boolean; settings: FbSettings; onChange: (s: FbSettings) => void; title: string; children: React.ReactNode; sentence: string }) {
  const idx = top ? 0 : 1, collapsed = settings.collapsed[idx];
  const [open, setOpen] = useState(false);
  const toggle = () => { const c: [boolean, boolean] = [...settings.collapsed]; c[idx] = !collapsed; onChange({ ...settings, collapsed: c }); };
  const h = barHeight(mobile, collapsed, top);
  return <div data-testid={top ? 'control-bar' : 'attack-bar'} style={{ height: h }} className={`relative flex shrink-0 items-center gap-2 bg-t-panel px-2 ${top ? 'border-b' : 'border-t'} border-t-border`}>
    <Button variant="ghost" size="icon" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`} aria-expanded={!collapsed} onClick={toggle} className="size-5 shrink-0 text-t-muted hover:bg-t-border">{collapsed === top ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}</Button>
    {collapsed ? <span className={`${label} text-t-muted`}>{title}</span> : <>
      {!mobile && <span className={`${label} shrink-0 text-t-muted`}>{title}</span>}
      {children}
      {settings.sentences && (mobile
        ? <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Show explanation" className="shrink-0 rounded px-1.5 text-[11px] text-t-muted hover:bg-t-border">{open ? 'Hide' : 'Why?'}</button>
        : <span data-testid="flow-sentence" className="min-w-0 truncate text-xs text-t-muted" title={sentence}>{sentence}</span>)}
      {mobile && open && settings.sentences && <div data-testid="flow-sentence" className={`absolute inset-x-0 z-20 border border-t-border bg-t-panel px-3 py-2 text-xs text-t-muted ${top ? 'top-full' : 'bottom-full'}`}>{sentence}</div>}
    </>}
  </div>;
}

export function ControlBar({ chartRef, minutes, symbol, settings, onChange, mobile }: { chartRef: MutableRefObject<ChartApi | null>; minutes: number; symbol: string; settings: FbSettings; onChange: (s: FbSettings) => void; mobile: boolean }) {
  const snap = useFlow(chartRef, minutes, settings, symbol);
  const state = snap?.shownControl ?? 'BALANCED', share = snap?.control.buyShare ?? 0.5;
  const word = state === 'BALANCED' ? 'BALANCED' : `${state} CONTROL`;
  return <Shell top mobile={mobile} settings={settings} onChange={onChange} title="Who controls the market" sentence={controlSentence(state)}>
    <span data-testid="control-state" className={`shrink-0 text-xs font-bold ${tone(state)}`}>{snap ? word : '…'}</span>
    <div className="flex min-w-16 flex-1 items-center gap-1.5 text-[11px] tabular-nums">
      <span className="text-t-up">{Math.round(share * 100)}%</span>
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-t-border" role="meter" aria-label="Buyers share" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-t-up" style={{ width: `${share * 100}%` }} /><div className="h-full flex-1 bg-t-down" />
      </div>
      <span className="text-t-down">{100 - Math.round(share * 100)}%</span>
    </div>
    <span className="shrink-0 text-[10px] text-t-muted">last {settings.lookback} candles</span>
  </Shell>;
}

export function AttackBar({ chartRef, minutes, symbol, settings, onChange, mobile }: { chartRef: MutableRefObject<ChartApi | null>; minutes: number; symbol: string; settings: FbSettings; onChange: (s: FbSettings) => void; mobile: boolean }) {
  const snap = useFlow(chartRef, minutes, settings, symbol);
  const state = snap?.shownAttack ?? 'NONE', a = snap?.attack;
  const word = state === 'NONE' ? 'NO ATTACK' : `${state} ATTACK`;
  const sentence = a ? combinedSentence(snap!.shownControl, state, a.scores) : '';
  return <Shell top={false} mobile={mobile} settings={settings} onChange={onChange} title="Who is attacking now" sentence={sentence}>
    <span data-testid="attack-state" className={`flex shrink-0 items-center gap-0.5 text-xs font-bold ${tone(state)}`}>{state === 'BUYERS' ? <ArrowUp className="size-3.5" /> : state === 'SELLERS' ? <ArrowDown className="size-3.5" /> : null}{snap ? word : '…'}</span>
    <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-t-border" role="meter" aria-label="Attack strength" aria-valuenow={Math.round((a?.strength ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${state === 'BUYERS' ? 'bg-t-up' : state === 'SELLERS' ? 'bg-t-down' : 'bg-t-muted'}`} style={{ width: `${(a?.strength ?? 0) * 100}%` }} />
    </div>
    <span className="shrink-0 text-[11px] tabular-nums text-t-text">{a ? `${a.p >= 0 ? '+' : ''}${a.p.toFixed(2)}` : '—'}</span>
    <span className="shrink-0 rounded border border-t-border px-1 text-[9px] font-bold text-t-muted">{a?.live ? 'LIVE' : 'CLOSED'}</span>
  </Shell>;
}

export function FlowBarsGear({ onClick }: { onClick: () => void }) {
  return <DropdownMenuItem asChild onSelect={onClick}><Button variant="ghost" size="icon" aria-label="Control & Attack bars settings" title="Control & Attack bars settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4" /></Button></DropdownMenuItem>;
}
