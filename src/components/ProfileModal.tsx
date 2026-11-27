import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { X, UserRound, Check, LogOut, Mail, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { THEME_PRESETS } from '@/lib/themes';
import { PLANS, perDay, planLink, WHATSAPP } from '@/lib/plans';
import { daysLeft, effectiveStatus, fmtDate } from '@/lib/membership';
import { signOutApp, type Profile } from '@/lib/session';
import { supabase } from '@/integrations/supabase/client';

const FEATURES = ['Futures & Forex terminals', 'Heatmap, Footprint, DOM, CVD', 'All order-flow tools', 'Desk support'];

export function ProfileModal({ account, theme, setTheme, forex, onClose }: { account: Profile | null; theme: string; setTheme: (t: string) => void; forex: boolean; onClose: () => void }) {
  const [name, setName] = useState(account?.display_name ?? '');
  const [saved, setSaved] = useState(account?.display_name ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const save = async () => {
    if (!account) return;
    const v = name.trim().slice(0, 40);
    setStatus('saving');
    const { error } = await supabase.from('profiles').update({ display_name: v || null }).eq('id', account.id);
    if (error) { setStatus('error'); return; }
    setSaved(v); setStatus('saved');
  };
  const shown = saved || account?.email?.split('@')[0] || 'Trader';
  return <div role="dialog" aria-modal="true" aria-label="Profile" data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-t-bg/80 p-3" onClick={onClose}>
    <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-t-border bg-t-panel text-t-text shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-t-border px-5 py-3"><h2 className="text-base font-semibold">Account</h2><Button variant="ghost" size="icon" aria-label="Close profile" onClick={onClose}><X /></Button></div>
      <div className="space-y-6 p-5">
        <section className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-t-accent/50 bg-t-bg text-xl font-semibold text-t-accent">{shown.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0"><p className="truncate text-lg font-semibold">{shown}</p><p className="flex items-center gap-1.5 truncate text-sm text-t-muted"><Mail className="size-3.5" />{account?.email ?? 'Guest'}</p>
            {account?.is_admin && <Link to="/admin" className="mt-1 inline-flex items-center gap-1 text-xs text-t-accent underline"><ShieldCheck className="size-3.5" />Admin panel</Link>}</div>
        </section>
        <section className="space-y-2"><label htmlFor="dn" className="text-xs uppercase tracking-wider text-t-muted">Display name</label>
          <div className="flex gap-2"><input id="dn" value={name} maxLength={40} onChange={e => { setName(e.target.value); setStatus('idle'); }} onKeyDown={e => { if (e.key === 'Enter') void save(); }} placeholder="Your name" className="h-10 min-w-0 flex-1 rounded-md border border-t-border bg-t-bg px-3 text-sm outline-none focus:border-t-accent" />
            <Button onClick={() => void save()} disabled={status === 'saving' || name.trim() === saved} className="btn-accent h-10">{status === 'saving' ? 'Saving…' : 'Save'}</Button></div>
          {status === 'saved' && <p className="text-xs text-t-up">Name saved.</p>}{status === 'error' && <p className="text-xs text-t-down">Couldn't save your name. Try again.</p>}
        </section>
        <section className="space-y-3"><h3 className="text-xs uppercase tracking-wider text-t-muted">Subscription</h3>
          {account && (() => { const m = account.membership, st = effectiveStatus(m); return st === 'expired' && m.ends_at
            ? <p role="status" className="rounded-md border border-t-down/50 px-3 py-2 text-sm">Your membership expired on {fmtDate(m.ends_at)} · <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi DepthLens, my membership expired. Account: ${account.email}`)}`} target="_blank" rel="noreferrer" className="text-t-accent underline">Contact support</a></p>
            : <p className="rounded-md border border-t-border px-3 py-2 text-sm">My plan: {m.plan}{st === 'active' && m.plan !== 'Free' && m.ends_at ? ` · active until ${fmtDate(m.ends_at)} (${daysLeft(m)} days left)` : st === 'suspended' ? ' · suspended' : ''}</p>; })()}
          <div className="grid gap-3 sm:grid-cols-3">{PLANS.map(p => <div key={p.id} className={`relative flex flex-col rounded-lg border bg-t-bg p-4 ${p.tag === 'Most popular' ? 'border-t-accent' : 'border-t-border'}`}>
            {p.tag && <span className="absolute -top-2.5 left-4 rounded-full bg-t-accent px-2 py-0.5 text-[10px] font-semibold text-t-accent-fg">{p.tag}</span>}
            <p className="text-sm text-t-muted">{p.days} days</p><p className="mt-1 text-3xl font-bold">${p.price}</p><p className="text-xs text-t-muted">${perDay(p).toFixed(2)} / day</p>
            <ul className="my-3 space-y-1 text-xs">{FEATURES.map(f => <li key={f} className="flex gap-1.5"><Check className="size-3.5 shrink-0 text-t-accent" />{f}</li>)}</ul>
            <Button asChild className={`mt-auto ${p.tag === 'Most popular' ? 'btn-accent' : 'border border-t-border bg-t-panel text-t-text hover:bg-t-border/50'}`}><a href={planLink(p, account?.email)} target="_blank" rel="noreferrer">Choose plan</a></Button></div>)}</div>
          <p className="text-xs text-t-muted">Choosing a plan opens WhatsApp with our desk to complete payment.</p>
        </section>
        <section className="space-y-2"><h3 className="text-xs uppercase tracking-wider text-t-muted">Theme</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{THEME_PRESETS.map(p => <button key={p.id} type="button" aria-pressed={theme === p.id} onClick={() => setTheme(p.id)} className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs ${theme === p.id ? 'border-t-accent' : 'border-t-border hover:bg-t-border/40'}`}>
            <span aria-hidden className="inline-flex h-4 w-6 shrink-0 overflow-hidden rounded-sm border border-t-border"><span className="flex-1" style={{ background: p.swatch[0] }} /><span className="flex-1" style={{ background: p.swatch[1] }} /></span>{p.label}</button>)}</div>
        </section>
        <section className="flex flex-wrap gap-2 border-t border-t-border pt-4">
          <Button asChild variant="outline" className="border-t-border bg-t-bg text-t-text">{forex ? <Link to="/terminal"><ArrowLeftRight />Switch to Futures</Link> : <Link to="/forex"><ArrowLeftRight />Switch to Forex</Link>}</Button>
          <Button variant="outline" className="ml-auto border-t-border bg-t-bg text-t-text" onClick={() => void signOutApp()}><LogOut />Sign out</Button>
        </section>
      </div>
    </div>
  </div>;
}
