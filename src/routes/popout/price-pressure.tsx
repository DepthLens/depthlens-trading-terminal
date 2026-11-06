// Standalone pop-out window for Price Pressure: only the tool, no sidebar, top bar or pair tabs.
// Follows the main window over the same-origin BroadcastChannel "depthlens-sync" unless locked.
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { PopoutChart } from '@/components/PopoutChart';
import { parsePopoutQuery, isSyncMessage, SYNC_CHANNEL, type SyncMessage } from '@/lib/popout';
import type { TradeSource } from '@/lib/live-price';

const tfLabel = (m: number) => (m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`);

export const Route = createFileRoute('/popout/price-pressure')({
  validateSearch: (search: Record<string, unknown>) => parsePopoutQuery(search),
  head: () => ({ meta: [{ title: 'Price Pressure — DepthLens' }, { name: 'description', content: 'DepthLens Price Pressure pop-out window.' }, { property: 'og:title', content: 'Price Pressure — DepthLens' }, { property: 'og:description', content: 'DepthLens Price Pressure pop-out window.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: PricePressurePopout,
});

function PricePressurePopout() {
  const params = Route.useSearch();
  const [symbol, setSymbol] = useState(params.symbol);
  const [minutes, setMinutes] = useState(params.tf);
  const [source, setSource] = useState<TradeSource>(params.source);
  const [theme, setTheme] = useState('navy');
  const [follow, setFollow] = useState(params.follow);
  const [status, setStatus] = useState('Connecting');
  const [mainClosed, setMainClosed] = useState(false);
  const followRef = useRef(follow); followRef.current = follow;

  useEffect(() => {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.onmessage = ev => {
      if (!isSyncMessage(ev.data)) return;
      const m = ev.data;
      if (m.type === 'state' && followRef.current) {
        setSymbol(m.state.symbol); setMinutes(m.state.timeframe); setSource(m.state.source); setTheme(m.state.theme);
      } else if (m.type === 'bye') setMainClosed(true);
    };
    const hello: SyncMessage = { type: 'hello', tool: 'Price Pressure' };
    channel.postMessage(hello);
    const sayClosed = () => channel.postMessage({ type: 'closed', tool: 'Price Pressure' });
    window.addEventListener('beforeunload', sayClosed);
    return () => { window.removeEventListener('beforeunload', sayClosed); sayClosed(); channel.close(); };
  }, []);

  return (
    <div data-theme={theme} className="flex h-dvh flex-col overflow-hidden bg-t-bg text-t-text">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-t-border bg-t-panel px-3 text-xs">
        <span className="font-semibold">Price Pressure</span>
        <span className="text-t-muted">{symbol} · {tfLabel(minutes)} · {source === 'bybit' ? 'Bybit' : 'Binance'}</span>
        <span className={`ml-auto flex items-center gap-1 ${status === 'Live' ? 'text-t-up' : 'text-t-warning'}`}><span>●</span>{status}</span>
        <button type="button" aria-label={follow ? 'Lock to this pair' : 'Follow the main window'} title={follow ? 'Following the main window — click to lock' : 'Locked — click to follow the main window'} onClick={() => setFollow(f => !f)} className="grid size-6 place-items-center rounded text-t-muted hover:bg-t-border/50 hover:text-t-text">
          {follow ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5 text-t-accent" />}
        </button>
      </header>
      {!follow && <div role="status" className="shrink-0 border-b border-t-border bg-t-panel px-3 py-1 text-[11px] text-t-accent">Locked to {symbol}</div>}
      {mainClosed && <div role="status" className="shrink-0 border-b border-t-border bg-t-panel px-3 py-1 text-[11px] text-t-warning">Main window closed</div>}
      <PopoutChart key={`${symbol}:${minutes}:${source}`} symbol={symbol} minutes={minutes} source={source} onStatus={setStatus} />
    </div>
  );
}
