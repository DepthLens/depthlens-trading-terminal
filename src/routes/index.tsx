import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, BarChart3, Layers, Timer } from "lucide-react";
import logo from "@/assets/depthlens-logo.png.asset.json";

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
  { icon: Activity, title: "Live Heatmap", text: "Resting liquidity painted over price in real time.", soon: true },
  { icon: BarChart3, title: "Volume Profile", text: "See where volume actually traded at each price.", soon: true },
  { icon: Layers, title: "Multi-pair Tabs", text: "Watch up to ten pairs at once, each with its own timeframe.", soon: false },
  { icon: Timer, title: "Custom Timeframes", text: "Any interval from 1 to 1440 minutes, built from live trades.", soon: false },
];

function Landing() {
  return (
    <div data-theme="navy" className="flex min-h-dvh flex-col bg-t-bg text-t-text">
      <header className="flex items-center gap-3 border-b border-t-border bg-t-panel px-5 py-3">
        <img src={logo.url} alt="DepthLens logo" className="size-9 rounded-md" />
        <span className="text-lg font-bold tracking-wide text-t-accent">DepthLens</span>
        <nav className="ml-auto flex items-center gap-2">
          <Link to="/login" className="rounded-md px-4 py-2 text-sm font-medium text-t-text hover:bg-t-border/50">Login</Link>
          <Link to="/register" className="rounded-md bg-t-accent hover:bg-t-accent-hover active:bg-t-accent-press px-4 py-2 text-sm font-semibold text-t-accent-fg">Register</Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col items-center px-6 py-16 text-center">
        <img src={logo.url} alt="" className="mb-8 size-28 rounded-2xl shadow-2xl" />
        <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">See the order flow behind every candle</h1>
        <p className="mt-4 max-w-xl text-base text-t-muted">A live order flow terminal for Binance USDT futures. Real-time charts, multi-pair tabs, and any timeframe you want — free, in your browser.</p>
        <Link to="/terminal" className="mt-8 rounded-md bg-t-accent hover:bg-t-accent-hover active:bg-t-accent-press px-8 py-3 text-base font-semibold text-t-accent-fg">Open Terminal</Link>
        <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-2">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-xl border border-t-border bg-t-panel p-6 text-left">
              <div className="flex items-center justify-between">
                <f.icon className="size-6 text-t-accent" />
                {f.soon && <span className="rounded-full border border-t-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-t-muted">Coming soon</span>}
              </div>
              <h2 className="mt-3 text-base font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-t-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-t-border bg-t-panel px-5 py-4 text-center text-xs text-t-muted">Not financial advice. Trading futures involves substantial risk of loss.</footer>
    </div>
  );
}
