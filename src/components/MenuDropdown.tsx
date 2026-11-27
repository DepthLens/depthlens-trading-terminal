import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Toolbar menu that drops down under its button with the Pairs animation (ps-in / reverse ps-out). */
export function MenuDropdown({ open, onClose, button, children, label, mobile, theme, width = 'w-[22rem]' }: { open: boolean; onClose: () => void; button: ReactNode; children: ReactNode; label: string; mobile: boolean; theme: string; width?: string }) {
  const [shown, setShown] = useState(open), [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  // Phones: the menu spans the screen width just under the button row, wherever the button sits.
  const [top, setTop] = useState(0);
  useEffect(() => { if (open && mobile && root.current) setTop(root.current.getBoundingClientRect().bottom + 4); }, [open, mobile]);
  useEffect(() => { if (open) { setShown(true); setLeaving(false); return; } if (!shown) return; setLeaving(true); const t = setTimeout(() => { setShown(false); setLeaving(false); }, 200); return () => clearTimeout(t); }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    const down = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) closeRef.current(); };
    window.addEventListener('keydown', key); document.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [open]);
  return <div ref={root} className="relative shrink-0">
    {button}
    {shown && <section role="dialog" aria-label={label} data-theme={theme} data-mobile={mobile || undefined} style={mobile ? { top } : undefined} className={`${leaving ? 'ps-out' : 'ps-in'} ${mobile ? 'fixed inset-x-2 max-h-[70dvh]' : `absolute left-0 top-full mt-1 ${width} max-h-[75vh]`} z-50 flex flex-col overflow-hidden rounded-md border border-t-border bg-t-panel text-t-text shadow-2xl`}>
      {children}
    </section>}
  </div>;
}
