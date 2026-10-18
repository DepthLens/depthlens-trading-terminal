# Roadmap

## Done
- Terminal: pair search + list, tabs (max 10, per-tab timeframe, persisted), Tools dropdown (7 switches only, persisted), themes, OHLC legend, zoom/reload, custom timeframes
- Live price: one aggTrade stream per active pair, independent of timeframe; chart kline socket reloads per interval; last candle tracks live price
- DepthLens logo in terminal header, landing page, login/register; favicon from logo
- Landing page at "/" (hero, 4 feature cards, Not financial advice footer)
- /login and /register pages (design only, submit → /terminal)

## Open
- Verify live trade streaming on a real network (sandbox blocks Binance WebSockets; REST works)
- Order flow tools (Heatmap, Volume Profile, Footprint, DOM, CVD, Whale Trades, Liquidations) — coming soon
- Real authentication for /login and /register
