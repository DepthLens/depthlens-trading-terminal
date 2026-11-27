import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { PLANS, perDay, planLink } from '@/lib/plans';

const FEATURES = ['Futures & Forex terminals', 'Heatmap, Footprint, DOM, CVD', 'All order-flow tools', 'Desk support'];

/** The same three memberships as the Profile menu, revealed with the landing-page rise animation. */
export function PricingSection() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add('lp-in'); io.disconnect(); } }, { threshold: .15 }); io.observe(el); return () => io.disconnect(); }, []);
  return (
    <section ref={ref} id="pricing" aria-labelledby="pricing-title" className="scroll-mt-4 border-t border-[var(--s-border)] px-5 py-14 sm:px-6 md:py-20">
      <div className="lp-reveal mx-auto max-w-2xl text-center">
        <p className="s-gold font-mono text-xs font-semibold uppercase tracking-[.2em]">Memberships</p>
        <h2 id="pricing-title" className="mt-3 text-2xl font-bold sm:text-3xl">Pick your plan</h2>
        <p className="s-muted mt-3">Every plan unlocks all tools in both terminals.</p>
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => {
          const hot = p.id === '15d';
          return (
            <article key={p.id} className={`lp-reveal lp-plan ${hot ? 'lp-plan-hot' : ''}`} style={{ transitionDelay: `${0.12 * (i + 1)}s` }}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{p.name}</h3>
                {p.tag && <span className="lp-plan-tag">{p.tag}</span>}
              </div>
              <p className="s-muted mt-1 text-sm">{p.days} days</p>
              <p className="mt-5 flex items-end gap-1"><span className="text-4xl font-bold">${p.price}</span><span className="s-muted mb-1 text-sm">/ {p.days} days</span></p>
              <p className="s-muted mt-1 text-xs">${perDay(p).toFixed(2)} per day</p>
              <ul className="mt-6 space-y-2 text-sm">
                {FEATURES.map(f => <li key={f} className="flex items-center gap-2"><Check className="s-gold size-4 shrink-0" />{f}</li>)}
              </ul>
              <a href={planLink(p)} target="_blank" rel="noopener noreferrer" className={`s-btn mt-7 w-full py-3 ${hot ? 's-btn-primary' : 's-btn-secondary'}`}>Choose plan</a>
            </article>
          );
        })}
      </div>
      <p className="lp-reveal s-muted mx-auto mt-6 max-w-xl text-center text-xs">Choosing a plan opens WhatsApp with our desk to complete payment.</p>
    </section>
  );
}
