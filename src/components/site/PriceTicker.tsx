import { useEffect, useState } from "react";

type Row = { s: string; p: number; c: number };
const SYMS = [["BTCUSDT", "BTC"], ["ETHUSDT", "ETH"], ["XAUUSDT", "XAU"]] as const;

/** Slow scrolling strip of public 24h ticker prices (REST, every 30s). */
export function PriceTicker() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let off = false;
    const load = async () => {
      const out: Row[] = [];
      await Promise.all(SYMS.map(async ([sym, label]) => {
        try { const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`); if (!r.ok) return; const j = await r.json(); out.push({ s: label, p: +j.lastPrice, c: +j.priceChangePercent }); } catch { /* ignore */ }
      }));
      if (!off) setRows(SYMS.map(([, l]) => out.find(o => o.s === l)).filter((x): x is Row => !!x));
    };
    void load(); const id = setInterval(load, 30000);
    return () => { off = true; clearInterval(id); };
  }, []);
  if (!rows.length) return <div className="h-10 border-y border-[var(--s-border)]" />;
  const items = [...rows, ...rows, ...rows, ...rows];
  return (
    <div className="relative z-10 h-10 overflow-hidden border-y border-[var(--s-border)] bg-[color-mix(in_oklab,var(--s-surface)_70%,transparent)]" data-testid="price-ticker">
      <div className="s-marquee flex h-full w-max items-center">
        {[...items, ...items].map((r, i) => (
          <span key={i} className="flex items-center gap-2 px-6 text-sm tabular-nums">
            <span className="font-semibold">{r.s}</span>
            <span>{r.p.toLocaleString(undefined, { maximumFractionDigits: r.p > 100 ? 2 : 4 })}</span>
            <span className={r.c >= 0 ? "s-up" : "s-down"}>{r.c >= 0 ? "▲" : "▼"} {Math.abs(r.c).toFixed(2)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
