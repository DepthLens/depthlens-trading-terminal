import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CandlestickChart, Globe, X } from 'lucide-react';
export const CHOICE_KEY = 'depthlens-terminal-choice';
export function TerminalChooser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  const last = typeof localStorage !== 'undefined' ? localStorage.getItem(CHOICE_KEY) : null;
  const go = (c: 'futures' | 'forex') => { try { localStorage.setItem(CHOICE_KEY, c); } catch { /* ignore */ } onClose(); void nav({ to: c === 'futures' ? '/terminal' : '/forex' }); };
  const opt = (c: 'futures' | 'forex', Icon: typeof Globe, title: string, text: string) => (
    <button type="button" onClick={() => go(c)} className={`s-card flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-[var(--s-gold)] ${last === c ? 'border-[var(--s-gold)]' : ''}`}>
      <Icon className="s-gold mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">{title}</span><span className="s-muted text-sm">{text}</span></span>
    </button>);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_oklab,var(--s-bg)_70%,transparent)] p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Which terminal?" className="s-card relative w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="s-muted absolute right-3 top-3 hover:text-[var(--s-text)]"><X className="size-5" /></button>
        <h2 className="text-xl font-bold">Which terminal?</h2>
        <div className="mt-4 grid gap-3">{opt('futures', CandlestickChart, 'Crypto Futures', 'Live Binance/Bybit order flow tools.')}{opt('forex', Globe, 'Forex', 'Spot forex candle charts.')}</div>
      </div>
    </div>);
}
