import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { MarketList } from '@/components/MarketList';
import type { PriceSpec, Quote } from '@/lib/market-data';

/** Two overlapping coins with a small swap arrow — the Pairs mark. */
export function PairsIcon({ className = 'size-4' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`pairs-icon ${className}`} aria-hidden="true">
    <g className="pairs-coin-a"><circle cx="9" cy="10" r="5.5"/><path d="M9 7.5v5"/></g>
    <g className="pairs-coin-b"><circle cx="15" cy="14" r="5.5"/><path d="M13 14h4"/></g>
    <path d="M3 20.5h4m0 0-1.5-1.5M21 3.5h-4m0 0 1.5 1.5"/>
  </svg>;
}

type Props = { pairs: string[]; quotes: MutableRefObject<Record<string, Quote>>; specs: Record<string, PriceSpec>; active: string; status: string; select: (s: string) => void; query: string; setQuery: (q: string) => void; onEnter: (e: React.KeyboardEvent<HTMLInputElement>) => void; forex: boolean; mobile: boolean };

/** Yellow Pairs button that morphs into a search box with the pairs list floating below it. */
export function PairsSelector({ pairs, quotes, specs, active, status, select, query, setQuery, onEnter, forex, mobile }: Props) {
  const [open, setOpen] = useState(false), [shown, setShown] = useState(false), [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setShown(true); setLeaving(false); return; } if (!shown) return; setLeaving(true); const t = setTimeout(() => { setShown(false); setLeaving(false); }, 200); return () => clearTimeout(t); }, [open]);
  useEffect(() => { if (open) requestAnimationFrame(() => input.current?.focus()); }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') { setOpen(false); return; }
      const typing = (e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]');
      if (!open && !typing && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); setOpen(true); }
    };
    const down = (e: PointerEvent) => { if (open && root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key); document.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [open]);
  const pick = (s: string) => { select(s); setOpen(false); setQuery(''); };
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    onEnter(e); if (forex && query.includes('/')) { setOpen(false); return; }
    const q = query.trim().toUpperCase().replace('/', ''); if (!q) return;
    const hit = pairs.find(p => p.replace('/', '') === q) ?? pairs.find(p => p.replace('/', '').startsWith(q)) ?? pairs.find(p => p.replace('/', '').includes(q));
    if (hit) pick(hit);
  };
  const width = mobile ? 'w-[calc(100vw-1rem)]' : 'w-72';
  return <div ref={root} className="relative shrink-0">
    <div className={`flex h-9 items-center overflow-hidden rounded-md transition-all duration-200 ease-out mobile:h-10 ${open ? `${mobile ? 'w-[calc(100vw-1rem)]' : 'w-60'} border border-t-accent bg-t-bg` : 'btn-accent w-[6.5rem] mobile:w-10'}`}>
      {open ? <>
        <PairsIcon className="ml-2.5 size-4 shrink-0 text-t-accent"/>
        <input ref={input} aria-label={forex ? 'Search forex pairs' : 'Search futures pairs'} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={enter} placeholder={forex ? 'Search pair, e.g. EUR/AUD' : 'Search pairs'} className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-t-text outline-none mobile:text-base"/>
        <button type="button" aria-label="Close pairs" onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center text-t-muted hover:text-t-text"><X className="size-4"/></button>
      </> : <button type="button" aria-label="Open pairs" aria-expanded={false} title="Pairs ( / or Ctrl+K )" onClick={() => setOpen(true)} className="pairs-btn flex h-full w-full items-center justify-center gap-1.5 px-2 text-sm font-semibold tracking-wide">
        <PairsIcon/>{!mobile && <>Pairs<ChevronDown className="size-3.5 opacity-70"/></>}
      </button>}
    </div>
    {shown && <div role="dialog" aria-label="Pairs" className={`${leaving ? 'ps-out' : 'ps-in'} absolute ${mobile ? 'right-0' : 'left-0'} top-full z-40 mt-1 flex max-h-[60vh] ${width} flex-col overflow-hidden rounded-md border border-t-border bg-t-panel shadow-2xl ${mobile ? 'h-[70vh] max-h-[70vh]' : 'h-[60vh]'}`}>
      <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase text-t-muted"><span>{forex ? 'Forex & Gold' : 'USDT Futures'}</span><span>{pairs.length} pairs</span></div>
      <MarketList pairs={pairs} quotes={quotes} specs={specs} query={query} active={active} status={status} select={pick}/>
    </div>}
  </div>;
}
