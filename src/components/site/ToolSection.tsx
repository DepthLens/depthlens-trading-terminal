import { useEffect, useRef, type ComponentType } from 'react';
import { ArrowRight } from 'lucide-react';
import { MiniClip } from './MiniClip';
import type { ClipKind } from '@/lib/landing-clips';
export type ToolInfo = { kind: ClipKind; tool: string; name: string; icon: ComponentType<{ className?: string }>; title: string; text: string; bullets: string[] };
export function ToolSection({ info, flip }: { info: ToolInfo; flip: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add('lp-in'); io.disconnect(); } }, { threshold: .15 }); io.observe(el); return () => io.disconnect(); }, []);
  const Icon = info.icon;
  return (
    <section data-tool-section={info.tool} className="mx-auto grid w-full max-w-6xl items-center gap-8 px-6 py-14 md:grid-cols-2 md:gap-12">
      <div className={`flex flex-col gap-4 ${flip ? 'md:order-2 md:items-end' : ''}`}>
        <span className="s-card s-gold inline-flex w-fit items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"><Icon className="size-4" />{info.name}</span>
        <MiniClip kind={info.kind} label={info.name} />
      </div>
      <div ref={ref} className={`lp-reveal min-w-0 ${flip ? 'md:order-1' : ''}`}>
        <h2 className="text-2xl font-bold sm:text-3xl">{info.title}</h2>
        <p className="s-muted mt-3">{info.text}</p>
        <p className="s-gold mt-5 text-xs font-semibold uppercase tracking-wider">What you get in DepthLens</p>
        <ul className="mt-2 space-y-2 text-sm">{info.bullets.map(b => <li key={b} className="flex gap-2"><span className="s-gold">•</span>{b}</li>)}</ul>
        <a href={`/terminal?tool=${encodeURIComponent(info.tool)}`} className="s-btn s-btn-secondary mt-6 inline-flex items-center gap-2 px-5 py-2.5">Try it in the terminal <ArrowRight className="size-4" /></a>
      </div>
    </section>);
}
