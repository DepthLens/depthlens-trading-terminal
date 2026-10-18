import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { livePriceStream, type LivePrice, type PriceStatus } from '@/lib/live-price';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type TradeBridge = { latest: LivePrice | null; receive: ((tick: LivePrice) => void) | null };
export function LiveQuote({ symbol, spec, bridge }: { symbol: string; spec: PriceSpec | undefined; bridge: MutableRefObject<TradeBridge> }) {
  const priceRef = useRef<HTMLSpanElement>(null);
  const latencyRef = useRef<HTMLDivElement>(null);
  const ageRef = useRef<HTMLDivElement>(null);
  const specRef = useRef(spec); specRef.current = spec;
  const [status, setStatus] = useState<PriceStatus>('Offline');
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    let frame = 0;
    bridge.current.latest = null;
    if (priceRef.current) priceRef.current.textContent = '—';
    const stop = livePriceStream(symbol, tick => {
      bridge.current.latest = tick;
      bridge.current.receive?.(tick);
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const tick = bridge.current.latest, el = priceRef.current, format = specRef.current;
        if (!tick || !el || !format) return;
        el.textContent = `${tick.direction > 0 ? '▲ ' : tick.direction < 0 ? '▼ ' : ''}${formatPrice(tick.price, format)}`;
        el.className = `text-lg font-semibold ${tick.direction > 0 ? 'text-t-up' : tick.direction < 0 ? 'text-t-down' : 'text-t-text'}`;
        el.setAttribute('aria-label', tick.direction > 0 ? 'Price rising' : tick.direction < 0 ? 'Price falling' : 'Price unchanged');
        el.dataset['price'] = String(tick.price);
        el.dataset['eventTime'] = String(tick.eventTime ?? '');
        el.dataset['latency'] = String(tick.latency ?? '');
        el.dataset['source'] = tick.source ?? 'trade';
      });
    }, setStatus);
    return () => { stop(); cancelAnimationFrame(frame); bridge.current.latest = null; };
  }, [symbol, bridge]);
  useEffect(() => {
    if (!hovered) return;
    let frame = 0;
    const render = () => {
      const tick = bridge.current.latest;
      if (latencyRef.current) latencyRef.current.textContent = `Latency: ${tick?.latency !== undefined ? `${tick.latency} ms` : '—'}`;
      if (ageRef.current) ageRef.current.textContent = `Last update: ${tick ? `${Math.max(0, (Date.now() - (tick.receivedAt ?? Date.now())) / 1000).toFixed(1)} s ago` : '—'}`;
      frame = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(frame);
  }, [hovered, bridge]);
  return <><span ref={priceRef} data-testid="live-price" className="text-lg font-semibold text-t-text">—</span><TooltipProvider delayDuration={0}><Tooltip open={hovered} onOpenChange={setHovered}><TooltipTrigger asChild><span tabIndex={0} role="status" data-testid="price-status" aria-label="Price connection status" className={`flex items-center gap-1 text-[10px] ${status === 'Live' ? 'text-t-up' : status === 'Polling' ? 'text-t-warning' : 'text-t-down'}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current"/>{status}</span></TooltipTrigger><TooltipContent className="border border-t-border bg-t-panel text-t-text"><div ref={latencyRef}>Latency: —</div><div ref={ageRef}>Last update: —</div></TooltipContent></Tooltip></TooltipProvider></>;
}
