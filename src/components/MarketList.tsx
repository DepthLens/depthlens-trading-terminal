import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice, sortMarkets, type PriceSpec, type Quote } from '@/lib/market-data';
import { visibleMarketRange, MARKET_ROW_HEIGHT } from '@/lib/market-list';

export function MarketList({ pairs, quotes, specs, query, active, status, select }: { pairs: string[]; quotes: MutableRefObject<Record<string, Quote>>; specs: Record<string, PriceSpec>; query: string; active: string; status: string; select: (symbol: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  useEffect(() => { const timer = setInterval(() => setRevision(r => r + 1), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { const el = ref.current; if (!el) return; const observer = new ResizeObserver(() => setViewport(v => ({ ...v, height: el.clientHeight }))); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; setViewport(v => ({ ...v, top: 0 })); }, [query]);
  const filtered = useMemo(() => sortMarkets(pairs, quotes.current).filter(p => p.includes(query.toUpperCase())), [pairs, quotes, query, revision]);
  const range = visibleMarketRange(filtered.length, viewport.top, viewport.height);
  return <div ref={ref} className="terminal-pairs min-h-0 flex-1 overflow-y-auto" onScroll={e => setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}>
    <div style={{ height: range.start * MARKET_ROW_HEIGHT }} aria-hidden="true"/>
    {filtered.slice(range.start, range.end).map(p => { const q = quotes.current[p]; return <Button key={p} variant="ghost" onClick={() => select(p)} aria-label={`Open ${p}`} className={`flex h-12 w-full justify-between gap-1 rounded-none border-l-2 px-3 py-2 ${active === p ? 'border-t-accent bg-t-border/35 text-t-text' : 'border-transparent text-t-text hover:bg-t-border/30'}`}><span className="min-w-0 truncate text-xs font-semibold">{p}<span className="block text-left text-[9px] font-normal text-t-muted">Perp</span></span><span className="min-w-0 text-right tabular-nums"><span className="block truncate text-xs">{q && specs[p] ? formatPrice(q.price, specs[p]) : '—'}</span><span className={`block text-[10px] ${q && q.change < 0 ? 'text-t-down' : 'text-t-up'}`}>{q ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}%` : '—'}</span></span></Button>; })}
    <div style={{ height: (filtered.length - range.end) * MARKET_ROW_HEIGHT }} aria-hidden="true"/>
    {!filtered.length && <p role="status" className="px-3 py-4 text-xs text-t-muted">{status || 'No matching pairs'}</p>}
  </div>;
}
