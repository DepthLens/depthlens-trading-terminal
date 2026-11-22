import { useEffect, useId, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { drawClip, pickActive, type ClipKind, type Pal } from '@/lib/landing-clips';

const vis = new Map<string, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(f => f());

function palette(el: HTMLElement): Pal {
  const probe = document.createElement('span'); el.appendChild(probe);
  const get = (v: string, fb: string) => { probe.style.color = fb; probe.style.color = `var(${v}, ${fb})`; return getComputedStyle(probe).color || fb; };
  const p = { up: get('--flow-up', '#22c55e'), down: get('--flow-down', '#ef4444'), poc: get('--flow-poc', '#facc15'), va: get('--flow-value-area', '#ff3d8b'), text: get('--s-text', '#e6edf3'), muted: get('--s-muted', '#8b98a9'), grid: get('--t-grid', 'rgba(255,255,255,.06)'), bg: get('--t-bg', '#0b0f14'), heat: get('--heat-bg', '#050b18'), gold: get('--s-gold', '#f5b83d') };
  probe.remove(); return p;
}
const lowPower = () => matchMedia('(prefers-reduced-motion: reduce)').matches || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;

export function MiniClip({ kind, label }: { kind: ClipKind; label: string }) {
  const id = useId(), box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false), [still, setStill] = useState(false);
  useEffect(() => { setStill(lowPower()); const el = box.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '400px 0px' }); io.observe(el); return () => io.disconnect(); }, []);
  useEffect(() => { if (!near) return; const el = box.current, c = cv.current; if (!el || !c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let pal = palette(el), w = 0, h = 0, raf = 0, last = 0, t = 0, running = false;
    const size = () => { const r = el.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.5); w = r.width; h = r.height; c.width = Math.round(w * d); c.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0); drawClip(kind, ctx, w, h, t, pal); };
    const frame = (now: number) => { raf = requestAnimationFrame(frame); if (now - last < 33) return; t += Math.min(.1, (now - (last || now)) / 1000); last = now; drawClip(kind, ctx, w, h, t, pal); };
    const sync = () => { const on = !still && pickActive(vis) === id; if (on && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); } else if (!on && running) { running = false; cancelAnimationFrame(raf); } };
    size(); listeners.add(sync);
    const io = new IntersectionObserver(([e]) => { vis.set(id, e?.isIntersecting ? e.intersectionRatio : 0); notify(); }, { threshold: [0, .2, .35, .5, .65, .8, 1] }); io.observe(el);
    const ro = new ResizeObserver(size); ro.observe(el);
    const mo = new MutationObserver(() => { pal = palette(el); drawClip(kind, ctx, w, h, t, pal); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); mo.disconnect(); listeners.delete(sync); vis.delete(id); notify(); };
  }, [near, still, kind, id]);
  return (
    <div className="lp-frame">
      <div className="lp-frame-bar"><i /><i /><i /><span>{label}</span></div>
      <div ref={box} className="relative aspect-[16/10] w-full" data-clip={kind}>
        {near && <canvas ref={cv} className="absolute inset-0 size-full" aria-label={`${label} demo animation`} role="img" />}
        {still && near && <button type="button" onClick={() => setStill(false)} className="lp-play" aria-label={`Play ${label} demo`}><Play className="size-5" /></button>}
      </div>
    </div>
  );
}
