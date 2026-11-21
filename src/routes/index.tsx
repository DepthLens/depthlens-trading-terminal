import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, BarChart3, Layers, Timer } from "lucide-react";
import logo from "@/assets/depthlens-logo.png.asset.json";
import { CandleBackdrop } from "@/components/site/CandleBackdrop";
import { PriceTicker } from "@/components/site/PriceTicker";

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

const FEATURES = [
  { icon: Activity, title: "Live Heatmap", text: "Resting liquidity painted over price in real time." },
  { icon: BarChart3, title: "Volume Profile", text: "See where volume actually traded at each price." },
  { icon: Layers, title: "Multi-pair Tabs", text: "Watch up to ten pairs at once, each with its own timeframe." },
  { icon: Timer, title: "Custom Timeframes", text: "Any interval from 1 to 1440 minutes, built from live trades." },
];

function Landing() {
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
      <PriceTicker />
      <main className="relative z-10 flex flex-1 flex-col">
        <section className="relative flex min-h-[560px] items-center justify-center overflow-hidden px-6 py-20 text-center sm:min-h-[600px]">
          <CandleBackdrop />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--s-bg)_70%,transparent)_0%,transparent_70%)]" />
          <div className="relative max-w-3xl">
            <p className="s-rise s-gold mb-4 text-xs font-semibold uppercase tracking-[.25em]">Order flow terminal</p>
            <h1 className="s-rise text-4xl font-bold leading-tight sm:text-6xl" style={{ animationDelay: ".1s" }}>See the order flow behind every candle</h1>
            <p className="s-rise s-muted mx-auto mt-5 max-w-xl text-base sm:text-lg" style={{ animationDelay: ".25s" }}>A live order flow terminal for Binance USDT futures. Real-time charts, multi-pair tabs, and any timeframe you want — free, in your browser.</p>
            <div className="s-rise mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: ".4s" }}>
              <Link to="/terminal" className="s-btn s-btn-primary px-7 py-3 text-base">Open Terminal</Link>
              <Link to="/forex" className="s-btn s-btn-secondary px-7 py-3 text-base">Open Forex charts</Link>
            </div>
          </div>
        </section>
        <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="s-card s-rise p-6 transition-colors hover:border-[color-mix(in_oklab,var(--s-gold)_45%,var(--s-border))]" style={{ animationDelay: `${.5 + i * .08}s` }}>
              <f.icon className="s-gold size-6" />
              <h2 className="mt-3 text-base font-semibold">{f.title}</h2>
              <p className="s-muted mt-1 text-sm">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
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
