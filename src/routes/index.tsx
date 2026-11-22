import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, Flame, Grid3x3, ListOrdered, TrendingUp, Fish, Zap, Gauge, Radar } from "lucide-react";
import { ToolSection, type ToolInfo } from "@/components/site/ToolSection";
import { TerminalChooser } from "@/components/site/TerminalChooser";
import logo from "@/assets/depthlens-logo.png.asset.json";
import { CandleBackdrop } from "@/components/site/CandleBackdrop";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DepthLens — See the order flow behind every candle" },
      { name: "description", content: "DepthLens is a crypto order flow terminal for Binance USDT futures: live charts, multi-pair tabs, and custom timeframes." },
      { property: "og:title", content: "DepthLens — See the order flow behind every candle" },
      { property: "og:description", content: "Live Binance futures charts and order flow tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const TOOL_SECTIONS: ToolInfo[] = [
  { kind: "heatmap", tool: "Heatmap", name: "Heatmap", icon: Flame, title: "See where liquidity is resting", text: "Order book depth painted over time, so walls and pulled orders stand out.", bullets: ["Live order book from Binance or Bybit", "Up to 60 minutes of saved history", "Bright bands mark big resting orders", "Price line drawn over the depth"] },
  { kind: "footprint", tool: "Footprint", name: "Footprint", icon: Grid3x3, title: "Look inside every candle", text: "Buy and sell volume at each price level, built from real trades.", bullets: ["Bid × Ask, Delta or Volume modes", "Imbalances shown in bold", "Point of control outlined", "Saved and backfilled history"] },
  { kind: "dom", tool: "DOM", name: "DOM", icon: ListOrdered, title: "Read the ladder", text: "A live depth-of-market ladder with sizes at every price.", bullets: ["Bid and ask depth bars", "Large walls highlighted", "Auto price grouping", "Smooth updates, no lag"] },
  { kind: "cvd", tool: "CVD", name: "CVD", icon: TrendingUp, title: "Who is really pushing price", text: "Cumulative volume delta under your chart, synced with every candle.", bullets: ["Exact taker buy/sell delta", "Per-candle delta bars", "Shared crosshair and time axis", "Spot divergences fast"] },
  { kind: "profile", tool: "Volume Profile", name: "Volume Profile", icon: BarChart3, title: "Where volume actually traded", text: "A price histogram for the visible range with key levels marked.", bullets: ["Point of control line", "Value area high and low", "Tick-aligned rows", "Updates with live trades"] },
  { kind: "whales", tool: "Whale Trades", name: "Whale Trades", icon: Fish, title: "Spot the big players", text: "Large trades circled on the chart, sized by how much they moved.", bullets: ["Auto or custom USDT threshold", "Bursts merged into one circle", "Live whale feed", "24 hours of saved history"] },
  { kind: "liquidations", tool: "Liquidations", name: "Liquidations", icon: Zap, title: "Watch forced exits", text: "Long and short liquidations per candle, with bubbles on price.", bullets: ["Binance and Bybit liquidation feeds", "Long vs short histogram", "Merged bubbles at the price", "24 hours kept in your browser"] },
  { kind: "pressure", tool: "Price Pressure", name: "Price Pressure", icon: Gauge, title: "Control & Attack at a glance", text: "Plain-language strips tell you who is in control and who is attacking.", bullets: ["Buyers / sellers in control", "Buyers / sellers attacking", "Pressure panes per candle", "Open in its own tab"] },
  { kind: "radar", tool: "Flow Radar", name: "Flow Radar", icon: Radar, title: "Setups found for you", text: "Flow Radar scans taker flow and marks setups right on the candles.", bullets: ["Setup A / B markers", "Short-timeframe patterns", "Higher-timeframe marks", "Outcome scoreboard"] },
];

function Landing() {
  const [choose, setChoose] = useState(false);
  return (
    <div className="dl-site flex min-h-dvh flex-col">
      <header className="relative z-20 flex items-center gap-3 border-b border-[var(--s-border)] bg-[color-mix(in_oklab,var(--s-bg)_75%,transparent)] px-4 py-3 backdrop-blur sm:px-6">
        <span className="s-logo rounded-lg"><img src={logo.url} alt="DepthLens logo" className="size-9 rounded-lg" /></span>
        <span className="text-lg font-bold tracking-wide">Depth<span className="s-gold">Lens</span></span>
        <nav className="ml-auto flex items-center gap-2">
          <Link to="/login" className="s-btn s-btn-secondary px-3 py-2 sm:px-4">Login</Link>
          <Link to="/register" className="s-btn s-btn-primary px-3 py-2 sm:px-4">Register</Link>
        </nav>
      </header>
      <main className="relative z-10 flex flex-1 flex-col">
        <section className="relative flex min-h-[calc(100dvh-61px)] items-center justify-center overflow-hidden px-5 py-10 text-center sm:min-h-[600px] sm:px-6 sm:py-20">
          <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden><CandleBackdrop /></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--s-bg)_88%,transparent)_0%,color-mix(in_oklab,var(--s-bg)_40%,transparent)_75%)]" />
          <div className="relative max-w-3xl">
            <p className="s-rise s-gold mb-4 text-xs font-semibold uppercase tracking-[.25em]">Order flow terminal</p>
            <h1 className="s-rise text-[34px] font-bold leading-tight sm:text-6xl" style={{ animationDelay: ".1s" }}>See the order flow behind every candle</h1>
            <p className="s-rise s-muted mx-auto mt-5 max-w-xl text-[15px] sm:text-lg" style={{ animationDelay: ".25s" }}>A live order flow terminal for Binance USDT futures. Real-time charts, multi-pair tabs, and any timeframe you want — free, in your browser.</p>
            <div className="s-rise mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: ".4s" }}>
              <button type="button" onClick={() => setChoose(true)} className="s-btn s-btn-primary px-7 py-3 text-base">Open Terminal</button>
            </div>
          </div>
        </section>
        <div className="border-t border-[var(--s-border)] py-6">
          {TOOL_SECTIONS.map((t, i) => <ToolSection key={t.tool} info={t} flip={i % 2 === 1} />)}
        </div>
      </main>
      <TerminalChooser open={choose} onClose={() => setChoose(false)} />
      <footer className="relative z-10 border-t border-[var(--s-border)] bg-[var(--s-surface)] px-6 py-6 text-xs">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <nav className="flex gap-5">
            <Link to="/terminal" className="s-muted hover:text-[var(--s-text)]">Terminal</Link>
            <Link to="/forex" className="s-muted hover:text-[var(--s-text)]">Forex</Link>
            <Link to="/login" className="s-muted hover:text-[var(--s-text)]">Login</Link>
            <Link to="/register" className="s-muted hover:text-[var(--s-text)]">Register</Link>
          </nav>
          <p className="s-muted text-center">Not financial advice. Trading futures involves substantial risk of loss.</p>
        </div>
      </footer>
    </div>
  );
}
