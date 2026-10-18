# Roadmap

## Done
- Low-delay frontend: trades apply synchronously through a ref bridge, price/candle/legend paint through animation frames, no price page state or candle pump; virtual market rows refresh independently once per second, with trade latency/age hover and immediate polling recovery. Binance and Bybit payloads tested.
- Controlled browser verification: 30-second rapid-trade test averaged 18.50 ms (synthetic event timestamps), 474 observed price changes (~15.8/s); all eight timeframes, custom 7m, BTC/ETH/BNB switches, single active trade socket, matched candles, search/scroll/zoom, and status hover passed with zero console/page errors.
- Terminal: pair search + list, tabs (max 10, per-tab timeframe, persisted), Tools dropdown (7 switches only, persisted), themes, OHLC legend, zoom/reload, custom timeframes
- Live price: one aggTrade stream per active pair, independent of timeframe; chart kline socket reloads per interval; last candle tracks live price
- Six terminal updates: five-second silent-stream fallback with one-second price polling, status dot and connection logs, dotted price line, orderflow after Custom, minute units, Profile/Logout, and scrollbar refinements.
- Verification: 16 tests passed; real BTCUSDT price changed seven times in ten seconds via polling; all eight timeframes, custom 45m, and BTC/ETH/BNB candle-price matching passed; menus and logout passed with zero console or page errors.
- DepthLens logo in terminal header, landing page, login/register; favicon from logo
- Landing page at "/" (hero, 4 feature cards, Not financial advice footer)
- /login and /register pages (design only, submit → /terminal)

## Open
- Real exchange trade latency/frequency verification: Binance and Bybit sockets opened but delivered zero trades during a 30-second sample in this environment; real average latency and busy-pair frequency remain unmeasurable. Polling was verified with real Binance prices.
- Order flow tools (Heatmap, Volume Profile, Footprint, DOM, CVD, Whale Trades, Liquidations) — coming soon
- Real authentication for /login and /register
