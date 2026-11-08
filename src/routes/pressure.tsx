import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PopoutChart } from '@/components/PopoutChart';
import { parsePopoutQuery, isSyncMessage, SYNC_CHANNEL } from '@/lib/popout';
import type { TradeSource } from '@/lib/live-price';

export const Route = createFileRoute('/pressure')({
  validateSearch: (search: Record<string, unknown>) => parsePopoutQuery(search),
  head: () => ({ meta: [{ title: 'Pressure — DepthLens' }, { name: 'description', content: 'Live candles, the Control & Attack bar and Price Pressure panes together on one DepthLens page.' }, { property: 'og:title', content: 'Pressure — DepthLens' }, { property: 'og:description', content: 'Follow candle pressure and buyer or seller control with live DepthLens charts.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: PressurePage,
});

function PressurePage() {
  const params = Route.useSearch();
  const [symbol, setSymbol] = useState(params.symbol);
  const [minutes, setMinutes] = useState(params.tf);
  const [source, setSource] = useState<TradeSource>(params.source);
  const [theme, setTheme] = useState('navy');
  const [follow, setFollow] = useState(params.follow);
  const [status, setStatus] = useState('Connecting');
  const [mainClosed, setMainClosed] = useState(false);
  const followRef = useRef(follow); followRef.current = follow;
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const channel = new BroadcastChannel(SYNC_CHANNEL); channelRef.current = channel;
    channel.onmessage = ev => {
      if (!isSyncMessage(ev.data)) return;
      const m = ev.data;
      if (m.type === 'state') {
        setMainClosed(false); setTheme(m.state.theme);
        if (followRef.current) { setSymbol(m.state.symbol); setMinutes(m.state.timeframe); setSource(m.state.source); }
      } else if (m.type === 'bye') setMainClosed(true);
    };
    channel.postMessage({ type: 'hello', tool: 'Price Pressure' });
    const closed = () => channel.postMessage({ type: 'closed', tool: 'Price Pressure' });
    window.addEventListener('beforeunload', closed);
    const check = setInterval(() => { if (window.opener?.closed) setMainClosed(true); }, 1000);
    return () => { clearInterval(check); window.removeEventListener('beforeunload', closed); closed(); channel.close(); channelRef.current = null; };
  }, []);
  return <div data-theme={theme} className="flex h-dvh flex-col overflow-y-auto bg-t-bg text-t-text">
    <header className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-t-border bg-t-panel px-3 py-1 text-xs">
      <strong>Pressure</strong><span className="text-t-muted">{symbol} · {minutes}m · {source === 'bybit' ? 'Bybit' : 'Binance'}</span>
      <span className={`ml-auto ${status === 'Live' ? 'text-t-up' : 'text-t-warning'}`} role="status">● {status}</span>
      <Button variant="ghost" size="icon" aria-label={follow ? 'Lock to this pair' : 'Follow the main window'} title={follow ? 'Lock to this pair' : 'Follow the main window'} onClick={() => { const next = !follow; followRef.current = next; setFollow(next); if (next) channelRef.current?.postMessage({ type: 'hello', tool: 'Price Pressure' }); }} className="size-6 text-t-muted">{follow ? <LockOpen /> : <Lock className="text-t-accent" />}</Button>
    </header>
    {!follow && <div role="status" className="shrink-0 border-b border-t-border bg-t-panel px-3 py-1 text-[11px] text-t-accent">Locked to {symbol}</div>}
    {mainClosed && <div role="status" className="shrink-0 border-b border-t-border bg-t-panel px-3 py-1 text-[11px] text-t-warning">Main window closed</div>}
    <div className="flex min-h-[780px] flex-1 flex-col md:min-h-0"><PopoutChart symbol={symbol} minutes={minutes} source={source} theme={theme} onStatus={setStatus} /></div>
  </div>;
}