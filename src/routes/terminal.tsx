import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import g1 from "@/assets/g1.jpg";
import g2 from "@/assets/g2.jpg";
import g3 from "@/assets/g3.jpg";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Terminal — DepthLens" },
      { name: "description", content: "Live Binance USDT futures candlestick chart with order flow tools." },
      { property: "og:title", content: "Terminal — DepthLens" },
      { property: "og:description", content: "Live Binance futures charts and order flow tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Terminal,
});

const TFS: { label: string; min: number }[] = [
  { label: "1m", min: 1 }, { label: "5m", min: 5 }, { label: "10", min: 10 }, { label: "15m", min: 15 },
  { label: "30", min: 30 }, { label: "1h", min: 60 }, { label: "4h", min: 240 }, { label: "1d", min: 1440 },
];
const TOOLS = ["Heatmap", "Footprint", "DOM", "CVD", "Volume Profile", "Whale Trades", "Liquidations"];
const THEMES = ["navy", "light", "midnight", "ocean"];
const GALLERY = [
  { src: g1, label: "Depth heatmap" },
  { src: g2, label: "Trading desk" },
  { src: g3, label: "Volume profile" },
];

function Terminal() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [minutes, setMinutes] = useState(1);
  const [theme, setTheme] = useState("navy");
  const [pairs, setPairs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [ticker, setTicker] = useState<{ price: number; change: number } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")
      .then((r) => r.json())
      .then((d) =>
        setPairs(
          d.symbols
            .filter((s: any) => s.quoteAsset === "USDT" && s.contractType === "PERPETUAL" && s.status === "TRADING")
            .map((s: any) => s.symbol)
            .sort(),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTicker(null);
    let ws: WebSocket | null = null;
    let closed = false;
    let t: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@ticker`);
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        setTicker({ price: +d.c, change: +d.P });
      };
      ws.onclose = () => { if (!closed) t = setTimeout(connect, 2000); };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => { closed = true; clearTimeout(t); ws?.close(); };
  }, [symbol]);

  const filtered = useMemo(
    () => pairs.filter((p) => p.includes(query.toUpperCase())).slice(0, 80),
    [pairs, query],
  );

  const applyCustom = () => {
    const n = parseInt(custom, 10);
    if (n >= 1 && n <= 1440) { setMinutes(n); setShowCustom(false); }
  };

  const isPreset = TFS.some((t) => t.min === minutes);
  const btn = "rounded-md px-2.5 py-1 text-xs font-medium transition-colors";
  const on = "bg-t-accent text-t-bg";
  const off = "text-t-muted hover:text-t-text hover:bg-t-border/50";

  return (
    <div data-theme={theme} className="flex h-screen flex-col bg-t-bg text-t-text">
      <header className="flex flex-wrap items-center gap-4 border-b border-t-border bg-t-panel px-4 py-2">
        <span className="text-lg font-bold tracking-tight text-t-accent">DepthLens</span>

        <div className="relative">
          <input
            value={open ? query : symbol}
            onFocus={() => { setOpen(true); setQuery(""); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pair"
            className="w-40 rounded-md border border-t-border bg-t-bg px-3 py-1.5 text-sm font-semibold outline-none focus:border-t-accent"
          />
          {open && (
            <ul className="absolute z-20 mt-1 max-h-72 w-40 overflow-auto rounded-md border border-t-border bg-t-panel shadow-lg">
              {filtered.map((p) => (
                <li key={p}>
                  <button
                    onMouseDown={() => { setSymbol(p); setOpen(false); }}
                    className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-t-border/60 ${p === symbol ? "text-t-accent" : ""}`}
                  >{p}</button>
                </li>
              ))}
              {!filtered.length && <li className="px-3 py-2 text-xs text-t-muted">No pairs</li>}
            </ul>
          )}
        </div>

        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-lg font-semibold">{ticker ? ticker.price.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"}</span>
          {ticker && (
            <span className={`text-sm font-medium ${ticker.change >= 0 ? "text-t-up" : "text-t-down"}`}>
              {ticker.change >= 0 ? "+" : ""}{ticker.change.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {TFS.map((t) => (
            <button key={t.label} onClick={() => setMinutes(t.min)} className={`${btn} ${minutes === t.min ? on : off}`}>{t.label}</button>
          ))}
          <div className="relative">
            <button onClick={() => setShowCustom((s) => !s)} className={`${btn} ${!isPreset ? on : off}`}>
              {!isPreset ? `${minutes}m` : "Custom"}
            </button>
            {showCustom && (
              <div className="absolute z-20 mt-1 flex gap-1 rounded-md border border-t-border bg-t-panel p-2 shadow-lg">
                <input
                  autoFocus type="number" min={1} max={1440} value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                  placeholder="min"
                  className="w-20 rounded border border-t-border bg-t-bg px-2 py-1 text-sm outline-none"
                />
                <button onClick={applyCustom} className={`${btn} ${on}`}>Go</button>
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {THEMES.map((t) => (
            <button key={t} onClick={() => setTheme(t)} className={`${btn} capitalize ${theme === t ? on : off}`}>{t}</button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-36 flex-col gap-1 border-r border-t-border bg-t-panel p-2">
          {TOOLS.map((t) => (
            <button key={t} className="rounded-md px-3 py-2 text-left text-xs font-medium text-t-muted hover:bg-t-border/50 hover:text-t-text">{t}</button>
          ))}
        </aside>

        <main className="min-w-0 flex-1 p-2">
          <PriceChart symbol={symbol} minutes={minutes} theme={theme} />
        </main>

        <aside className="hidden w-60 flex-col gap-2 overflow-auto border-l border-t-border bg-t-panel p-3 lg:flex">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-t-muted">Gallery</h2>
          {GALLERY.map((g) => (
            <button key={g.label} onClick={() => setZoom(g.src)} className="group overflow-hidden rounded-md border border-t-border text-left">
              <img src={g.src} alt={g.label} loading="lazy" width={992} height={672} className="aspect-[3/2] w-full object-cover transition-transform group-hover:scale-105" />
              <span className="block px-2 py-1 text-xs text-t-muted">{g.label}</span>
            </button>
          ))}
        </aside>
      </div>

      {zoom && (
        <div onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-t-bg/90 p-8">
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg border border-t-border" />
        </div>
      )}
    </div>
  );
}
