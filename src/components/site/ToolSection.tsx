import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { MiniClip } from './MiniClip';
import type { ClipKind } from '@/lib/landing-clips';
export type ToolInfo = { kind: ClipKind; tool: string; name: string; title: string; text: string; bullets: string[] };
/** Mobile order: label+title → preview → text → bullets → link. Desktop: preview and text side by side, alternating. */
export function ToolSection({ info, index, flip, onOpen }: { info: ToolInfo; index: number; flip: boolean; onOpen: (tool: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add('lp-in'); io.disconnect(); } }, { threshold: .15 }); io.observe(el); return () => io.disconnect(); }, []);
  const textCol = flip ? 'md:col-start-1' : 'md:col-start-2', clipCol = flip ? 'md:col-start-2' : 'md:col-start-1';
  return (
    <section ref={ref} data-tool-section={info.tool} className="mx-auto grid w-full max-w-6xl gap-y-5 px-5 py-10 sm:px-6 md:grid-cols-2 md:gap-x-14 md:py-16">
      <div className={`lp-reveal min-w-0 md:row-start-1 md:self-end ${textCol}`}>
        <p className="s-gold font-mono text-xs font-semibold uppercase tracking-[.2em]">{String(index + 1).padStart(2, '0')} — {info.name}</p>
        <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{info.title}</h2>
      </div>
      <div className={`min-w-0 md:row-span-2 md:row-start-1 md:self-center ${clipCol} ${flip ? 'md:justify-self-end' : ''} w-full`}>
        <MiniClip kind={info.kind} label={info.name} />
      </div>
      <div className={`lp-reveal min-w-0 md:row-start-2 md:self-start ${textCol}`}>
        <p className="s-muted">{info.text}</p>
        <ul className="mt-4 space-y-2 text-sm">{info.bullets.map(b => <li key={b} className="flex gap-2"><span className="s-gold">•</span>{b}</li>)}</ul>
        <button type="button" onClick={() => onOpen(info.tool)} className="lp-link mt-5">Open {info.name} <ArrowRight className="size-4" /></button>
      </div>
    </section>);
}
