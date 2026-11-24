import { useEffect, type ReactElement } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
type Ico = (p: { className?: string }) => ReactElement;
const svg = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const CandlesIcon: Ico = ({ className }) => (<svg {...svg} className={className}><path d="M4 3v14M10 2v16M16 4v12" /><rect x="2.5" y="7" width="3" height="6" rx=".5" /><rect x="8.5" y="5" width="3" height="5" rx=".5" /><rect x="14.5" y="7" width="3" height="5" rx=".5" /></svg>);
const FxIcon: Ico = ({ className }) => (<svg {...svg} className={className}><path d="M3.5 8a6.5 6.5 0 0 1 11.6-3.4" /><path d="M15.5 2v3h-3" /><path d="M16.5 12a6.5 6.5 0 0 1-11.6 3.4" /><path d="M4.5 18v-3h3" /></svg>);
export const CHOICE_KEY = 'depthlens-terminal-choice';
export function TerminalChooser({ open, onClose, tool }: { open: boolean; onClose: () => void; tool?: string | null }) {
  const nav = useNavigate();
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  const last = typeof localStorage !== 'undefined' ? localStorage.getItem(CHOICE_KEY) : null;
  const go = (c: 'futures' | 'forex') => { try { localStorage.setItem(CHOICE_KEY, c); } catch { /* ignore */ } onClose(); void nav({ to: c === 'futures' ? '/terminal' : '/forex', ...(tool ? { search: { tool } as never } : {}) }); };
  const opt = (c: 'futures' | 'forex', Icon: Ico, title: string, text: string) => (
    <button type="button" onClick={() => go(c)} className={`s-card flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-[var(--s-gold)] ${last === c ? 'border-[var(--s-gold)]' : ''}`}>
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--s-gold)_30%,transparent)] bg-[color-mix(in_oklab,var(--s-gold)_12%,transparent)]"><Icon className="s-gold size-5" /></span><span className="min-w-0"><span className="block font-semibold leading-tight">{title}</span><span className="s-muted text-sm">{text}</span></span>
    </button>);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_oklab,var(--s-bg)_70%,transparent)] p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Which terminal?" className="s-card relative w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="s-muted absolute right-3 top-3 hover:text-[var(--s-text)]"><X className="size-5" /></button>
        <h2 className="text-xl font-bold">Which terminal?</h2>
        <div className="mt-4 grid gap-3">{opt('futures', CandlesIcon, 'Crypto Futures', 'Live Binance/Bybit order flow tools.')}{opt('forex', FxIcon, 'Forex', 'Spot forex candle charts.')}</div>
      </div>
    </div>);
}
