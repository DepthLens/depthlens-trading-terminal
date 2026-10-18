import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { livePriceStream, priceDiagnostics, type LivePrice, type PriceStatus, type SourceMode, type TradeSource } from '@/lib/live-price';
import { NATIVE } from '@/lib/chart-data';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { orderBook } from '@/lib/order-book';

const SOURCE_KEY = 'depthlens.source.v1';
const MODES: { value: SourceMode; label: string }[] = [{ value: 'auto', label: 'Auto' }, { value: 'binance', label: 'Binance' }, { value: 'bybit', label: 'Bybit' }];

export type TradeBridge = { latest: LivePrice | null; receive: ((tick: LivePrice) => void) | null; kline?: ((data: any) => void) | null; heat?: ((tick: LivePrice) => void) | null };
export function useSourceMode() {
  const [mode, setMode] = useState<SourceMode | null>(null);
  useEffect(() => { const saved = localStorage.getItem(SOURCE_KEY); setMode(saved === 'binance' || saved === 'bybit' || saved === 'auto' ? saved : 'auto'); }, []);
  const changeMode = (next: SourceMode) => { localStorage.setItem(SOURCE_KEY, next); setMode(next); };
  return [mode, changeMode] as const;
}
export function SourceSelect({ mode, onChange, className = 'h-6 rounded border border-t-border bg-t-panel px-1 text-[10px] text-t-text' }: { mode: SourceMode | null; onChange: (next: SourceMode) => void; className?: string }) {
  return <select aria-label="Price source" value={mode ?? 'auto'} onChange={e => onChange(e.target.value as SourceMode)} className={className}>
    {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
  </select>;
}
const SOURCE_NAMES: Record<string, string> = { binance: 'Binance', bybit: 'Bybit', poll: 'Polling' };
export function LiveQuote({ symbol, minutes, spec, bridge, bookEnabled = false, compact = false, mode: controlledMode, onModeChange, onSourceChange }: { symbol: string; minutes: number; spec: PriceSpec | undefined; bridge: MutableRefObject<TradeBridge>; bookEnabled?: boolean; compact?: boolean; mode?: SourceMode | null; onModeChange?: (next: SourceMode) => void; onSourceChange?: (source: TradeSource | 'poll') => void }) {
  const sizeClass = compact ? 'text-sm' : 'text-lg';
  const sourceChangeRef = useRef(onSourceChange); sourceChangeRef.current = onSourceChange;
  const [sourceName, setSourceName] = useState('');
  const priceRef = useRef<HTMLSpanElement>(null);
  const diagnosticsRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<TradeSource | 'poll'>('binance');
  const previousSymbol = useRef('');
  const specRef = useRef(spec); specRef.current = spec;
  const [status, setStatus] = useState<PriceStatus>('Offline');
  const [hovered, setHovered] = useState(false);
  const [ownMode, changeOwnMode] = useSourceMode();
  const mode = controlledMode !== undefined ? controlledMode : ownMode;
  const changeMode = onModeChange ?? changeOwnMode;
  useEffect(() => { orderBook.setEnabled(bookEnabled); }, [bookEnabled]);
  useEffect(() => {
    if (!mode) return;
    let frame = 0;
    if (previousSymbol.current !== symbol) {
      bridge.current.latest = null;
      if (priceRef.current) priceRef.current.textContent = '—';
      previousSymbol.current = symbol;
    }
    const stop = livePriceStream(symbol, tick => {
      // Every trade reaches the candle immediately; only painting waits for the frame.
      bridge.current.latest = tick;
      bridge.current.receive?.(tick);
      bridge.current.heat?.(tick);
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const tick = bridge.current.latest, el = priceRef.current, format = specRef.current;
        if (!tick || !el || !format) return;
        el.textContent = `${tick.direction > 0 ? '▲ ' : tick.direction < 0 ? '▼ ' : ''}${formatPrice(tick.price, format)}`;
        el.className = `${sizeClass} font-semibold ${tick.direction > 0 ? 'text-t-up' : tick.direction < 0 ? 'text-t-down' : 'text-t-text'}`;
        el.setAttribute('aria-label', tick.direction > 0 ? 'Price rising' : tick.direction < 0 ? 'Price falling' : 'Price unchanged');
        el.dataset['price'] = String(tick.price);
        el.dataset['exchange'] = tick.exchange ?? 'poll';
      });
    }, setStatus, NATIVE[minutes] ?? '1m', data => bridge.current.kline?.(data), source => { sourceRef.current = source; setSourceName(SOURCE_NAMES[source] ?? source); sourceChangeRef.current?.(source); orderBook.setActive(symbol, source === 'poll' ? null : source); }, mode);
    return () => { orderBook.setActive('', null); stop(); cancelAnimationFrame(frame); };
  }, [symbol, minutes, bridge, mode]);
  useEffect(() => {
    if (!hovered) return;
    let frame = 0;
    const render = () => {
      const d = priceDiagnostics(sourceRef.current), now = Date.now();
      if (diagnosticsRef.current) diagnosticsRef.current.textContent = [
        `Source: ${d.source}${mode === 'auto' ? ' (Auto)' : ''}`,
        `Latency: ${d.medianLatency === null ? '—' : `${Math.round(d.medianLatency)} ms`} (median of last 50, clock-corrected)`,
        `Last trade: ${d.lastTradeAt === null ? '—' : `${Math.max(0, now - d.lastTradeAt)} ms ago`}`,
        `Open sockets: ${d.openSockets}`,
        `Connected: ${d.connectedAt === null ? '—' : `${Math.floor((now - d.connectedAt) / 1000)} s`}`,
        `State: ${d.state}`,
        `Last error: ${d.lastError}`,
      ].join('\n');
      frame = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(frame);
  }, [hovered, mode]);
  return <>
    <span ref={priceRef} data-testid="live-price" className={`${sizeClass} font-semibold text-t-text`}>—</span>
    <TooltipProvider delayDuration={0}><Tooltip open={hovered} onOpenChange={setHovered}><TooltipTrigger asChild><span tabIndex={0} role="status" data-testid="price-status" aria-label="Price connection status" className={`flex items-center gap-1 ${compact ? 'h-10 shrink-0 text-xs' : 'text-[10px]'} ${status === 'Live' ? 'text-t-up' : status === 'Polling' ? 'text-t-warning' : 'text-t-down'}`}><span aria-hidden="true" className={`${compact ? 'size-2' : 'size-1.5'} rounded-full bg-current`}/>{compact ? (sourceName || status) : status}</span></TooltipTrigger><TooltipContent className="border border-t-border bg-t-panel text-t-text"><div ref={diagnosticsRef} data-testid="price-diagnostics" className="whitespace-pre-line"/></TooltipContent></Tooltip></TooltipProvider>
    {!compact && <SourceSelect mode={mode} onChange={changeMode}/>}
  </>;
}
