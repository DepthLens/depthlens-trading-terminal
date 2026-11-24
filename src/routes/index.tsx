import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ToolSection, type ToolInfo } from "@/components/site/ToolSection";
import { TerminalChooser } from "@/components/site/TerminalChooser";
import logo from "@/assets/depthlens-logo.png.asset.json";
import { CandleBackdrop } from "@/components/site/CandleBackdrop";
import { Hero3DVisual } from "@/components/site/Hero3DVisual";
import { TOOL_ICONS } from "@/components/site/ToolIcons";

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
  { kind: "heatmap", tool: "Heatmap", name: "Heatmap", title: "See where liquidity is resting", text: "Order book depth painted over time, so walls and pulled orders stand out.", bullets: ["Live order book from Binance or Bybit", "Up to 7 days of recorded BTCUSDT depth (Binance)", "60-minute saved buffer for every other pair", "Price line and trade bubbles over the depth"] },
  { kind: "footprint", tool: "Footprint", name: "Footprint", title: "Look inside every candle", text: "Buy and sell volume at each price level, built from real trades.", bullets: ["Bid × Ask, Delta or Volume modes", "Imbalances shown in bold", "Point of control outlined", "24 hours saved in your browser, with backfill"] },
  { kind: "dom", tool: "DOM", name: "DOM", title: "Read the ladder", text: "A live depth-of-market ladder with sizes at every price.", bullets: ["Bid and ask depth bars", "Large walls highlighted", "Auto price grouping", "Spread and last trade in the middle"] },
  { kind: "cvd", tool: "CVD", name: "CVD", title: "Who is really pushing price", text: "Cumulative volume delta under your chart, synced with every candle.", bullets: ["Exact taker buy/sell delta", "Line, candles or delta histogram", "Daily, weekly or visible-range reset", "Shared crosshair and time axis"] },
  { kind: "profile", tool: "Volume Profile", name: "Volume Profile", title: "Where volume actually traded", text: "A price histogram for the visible range with key levels marked.", bullets: ["Point of control line", "Value area high and low", "Tick-aligned rows", "Updates with live trades"] },
  { kind: "whales", tool: "Whale Trades", name: "Whale Trades", title: "Spot the big players", text: "Large trades circled on the chart, sized by their USDT value.", bullets: ["Auto or custom USDT threshold", "Bursts merged into one circle", "Live whale feed", "24 hours of saved history"] },
  { kind: "liquidations", tool: "Liquidations", name: "Liquidations", title: "Watch forced exits", text: "Long and short liquidations per candle, with bubbles on price.", bullets: ["Binance and Bybit liquidation feeds", "Long vs short histogram", "Merged bubbles at the price", "24 hours kept in your browser"] },
  { kind: "pressure", tool: "Price Pressure", name: "Price Pressure", title: "Control & Attack at a glance", text: "Plain-language strips tell you who is in control and who is attacking.", bullets: ["Buyers / sellers in control", "Buyers / sellers attacking", "Pressure panes per candle", "Opens in its own window"] },
  { kind: "radar", tool: "Flow Radar", name: "Flow Radar", title: "Setups found for you", text: "Flow Radar scans taker flow and marks setups right on the candles.", bullets: ["Setup A / B markers", "Short-timeframe patterns", "Higher-timeframe marks", "Outcome scoreboard"] },
];

const STATS: [string, string][] = [["9", "Order flow tools"], ["2", "Exchange feeds: Binance + Bybit"], ["7 days", "Recorded BTCUSDT depth"], ["0", "Installs — runs in your browser"]];

function Landing() {
  const [choose, setChoose] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const open = (t: string | null) => { setTool(t); setChoose(true); };
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
        <section className="relative overflow-hidden px-5 pb-10 pt-10 sm:px-6 md:pb-16 md:pt-16">
          <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden><CandleBackdrop bright speed={0.35} /></div>
          <div aria-hidden className="lp-hero-fade pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
            <div className="text-center lg:text-left [text-shadow:0_2px_12px_var(--s-bg)]">
              <p className="s-rise lp-badge mx-auto lg:mx-0"><span className="lp-live" aria-hidden />Crypto futures &amp; forex · order flow terminal</p>
              <h1 className="s-rise mt-5 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-6xl" style={{ animationDelay: ".1s" }}>See the order flow <span className="lp-gold-text">behind every candle</span></h1>
              <p className="s-rise s-muted mx-auto mt-5 max-w-xl text-[15px] sm:text-lg lg:mx-0" style={{ animationDelay: ".25s" }}>A live order flow terminal for Binance USDT futures. Real-time charts, multi-pair tabs, and any timeframe you want — free, in your browser.</p>
              <div className="s-rise mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start" style={{ animationDelay: ".4s" }}>
                <button type="button" onClick={() => open(null)} className="s-btn s-btn-primary px-7 py-3 text-base">Open Terminal</button>
                <a href="#tools" className="s-btn s-btn-secondary px-6 py-3 text-base">Explore the tools</a>
              </div>
            </div>
            <div className="s-rise relative" style={{ animationDelay: ".3s" }}>
              <div aria-hidden className="lp-orb pointer-events-none absolute inset-[12%] rounded-full" />
              <Hero3DVisual className="h-[260px] w-full sm:h-[360px] lg:h-[460px]" />
            </div>
          </div>
          <nav aria-label="Tools" className="s-rise relative mx-auto mt-8 grid max-w-6xl grid-cols-3 gap-2 sm:grid-cols-9 md:mt-12" style={{ animationDelay: ".5s" }}>
            {TOOL_SECTIONS.map(t => { const Icon = TOOL_ICONS[t.kind]; return (
              <a key={t.tool} href={`#tool-${t.kind}`} className="lp-chip" title={t.name}>
                {Icon && <Icon className="size-5" />}<span>{t.name}</span>
              </a>); })}
          </nav>
          <dl className="s-rise relative mx-auto mt-6 grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--s-border)] bg-[var(--s-border)] sm:grid-cols-4" style={{ animationDelay: ".6s" }}>
            {STATS.map(([v, l]) => <div key={l} className="bg-[color-mix(in_oklab,var(--s-surface)_92%,transparent)] flex flex-col-reverse px-4 py-4 text-center"><dt className="s-muted text-xs">{l}</dt><dd className="text-lg font-bold sm:text-xl">{v}</dd></div>)}
          </dl>
        </section>
        <div id="tools" className="scroll-mt-4 border-t border-[var(--s-border)] md:py-6">
          {TOOL_SECTIONS.map((t, i) => <ToolSection key={t.tool} info={t} index={i} flip={i % 2 === 1} onOpen={open} />)}
        </div>
        <section className="border-t border-[var(--s-border)] px-5 py-14 text-center sm:px-6 md:py-20">
          <h2 className="text-2xl font-bold sm:text-3xl">Every tool, one terminal</h2>
          <p className="s-muted mx-auto mt-3 max-w-lg">Open DepthLens and switch any tool on from the Order flow menu.</p>
          <button type="button" onClick={() => open(null)} className="s-btn s-btn-primary mt-7 px-7 py-3 text-base">Open Terminal</button>
        </section>
      </main>
      <TerminalChooser open={choose} tool={tool} onClose={() => setChoose(false)} />
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
