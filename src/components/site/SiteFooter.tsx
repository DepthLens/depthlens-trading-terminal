import { Link } from "@tanstack/react-router";
import { Mail, Headset } from "lucide-react";

export const CONTACT_EMAIL = "depthlens.coy@gmail.com";
export const WHATSAPP_DISPLAY = "+92 319 5066209";
export const WHATSAPP_URL = "https://wa.me/923195066209";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
  </svg>
);

const TOOL_LINKS: [string, string][] = [["Heatmap", "Heatmap"], ["Footprint", "Footprint"], ["DOM Ladder", "DOM"], ["CVD", "CVD"], ["Volume Profile", "Volume Profile"], ["Flow Radar", "Flow Radar"]];

const linkCls = "s-muted text-sm transition-colors hover:text-[var(--s-gold)]";

export function SiteFooter({ logoUrl, onOpenTool }: { logoUrl: string; onOpenTool: (tool: string | null) => void }) {
  return (
    <footer className="relative z-10 border-t border-[var(--s-border)] bg-[var(--s-surface)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.15fr_1.45fr_0.85fr_0.75fr_0.7fr] lg:gap-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="s-logo rounded-lg"><img src={logoUrl} alt="DepthLens logo" className="size-9 rounded-lg" /></span>
            <span className="text-lg font-bold tracking-wide">Depth<span className="s-gold">Lens</span></span>
          </div>
          <p className="s-muted mt-4 max-w-xs text-sm leading-relaxed">Institutional-grade order flow and depth analytics for crypto futures and forex — live in your browser.</p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--s-border)] px-3 py-1.5 text-xs">
            <span className="lp-live" aria-hidden />All systems operational · Real-time feeds active
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--s-gold)]">Contact &amp; support</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="group flex items-center gap-3 rounded-lg border border-[var(--s-border)] px-3 py-2.5 transition-colors hover:border-[var(--s-gold)]">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--s-gold)_12%,transparent)] text-[var(--s-gold)]"><Mail className="size-4" /></span>
                <span className="min-w-0"><span className="s-muted block text-[11px] uppercase tracking-wider">Email</span><span className="block truncate text-sm group-hover:text-[var(--s-gold)]">{CONTACT_EMAIL}</span></span>
              </a>
            </li>
            <li>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-lg border border-[var(--s-border)] px-3 py-2.5 transition-colors hover:border-[var(--s-up)]">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--s-up)_14%,transparent)] text-[var(--s-up)]"><WhatsAppIcon className="size-4" /></span>
                <span className="min-w-0"><span className="s-muted block text-[11px] uppercase tracking-wider">WhatsApp</span><span className="block text-sm group-hover:text-[var(--s-up)]">{WHATSAPP_DISPLAY}</span></span>
              </a>
            </li>
          </ul>
          <p className="s-muted mt-4 inline-flex items-center gap-2 text-xs"><Headset className="size-3.5 text-[var(--s-gold)]" />Desk support · Available 24/7</p>
        </div>

        <nav aria-label="Terminals">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--s-gold)]">Terminals</h3>
          <ul className="mt-4 space-y-2.5">
            <li><Link to="/terminal" className={linkCls}>Crypto Futures Terminal</Link></li>
            <li><Link to="/forex" className={linkCls}>Forex Terminal</Link></li>
            <li><Link to="/pressure" className={linkCls}>Price Pressure</Link></li>
          </ul>
        </nav>

        <nav aria-label="Account">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--s-gold)]">Account</h3>
          <ul className="mt-4 space-y-2.5">
            <li><Link to="/login" className={linkCls}>Client login</Link></li>
            <li><Link to="/register" className={linkCls}>Register account</Link></li>
            <li><Link to="/login" className={linkCls}>Forgot password</Link></li>
          </ul>
        </nav>

        <nav aria-label="Tools">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--s-gold)]">Tools</h3>
          <ul className="mt-4 space-y-2.5">
            {TOOL_LINKS.map(([label, tool]) => (
              <li key={tool}><button type="button" onClick={() => onOpenTool(tool)} className={linkCls}>{label}</button></li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-[var(--s-border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <p className="s-muted max-w-3xl text-[11px] leading-relaxed"><span className="font-semibold text-[var(--s-text)]">Risk notice:</span> Trading cryptocurrency futures and leveraged derivatives involves substantial risk of loss and is not suitable for all investors. DepthLens provides analytical tools for informational purposes only and does not offer financial advice.</p>
          <p className="s-muted shrink-0 text-xs">© {new Date().getFullYear()} DepthLens Technologies. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
