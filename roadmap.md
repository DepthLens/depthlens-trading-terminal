# Roadmap

## Live order book engine
- [ ] Shared-socket subscriptions, Bybit snapshot/delta book, Binance buffered snapshot/sequence resync.
- [ ] Active-pair/source and Heatmap/DOM gating; toggleable Book debug panel, no drawing.
- [ ] Unit tests and live BTCUSDT/small-pair checks, ten pair switches, socket/error checks.

## WebSocket leak fix
- [x] Central manager, combined active Binance stream, cleanup, 20-second idle/backoff and failover after three failures.
- [x] Source/state/socket-count/error/message-age tooltip and lifecycle logs.
- [x] Rapid five-pair/five-timeframe switching ten times plus two minutes: real sockets never exceeded three, controlled Binance stayed Live throughout, zero console errors. Real Binance was unavailable initially; Bybit recovered. A separate two-minute real Bybit observation stayed Live throughout, with at most three sockets and 113 observed price changes; displayed price and candle matched.

## Done
- Low-delay frontend: trades apply synchronously through a ref bridge, price/candle/legend paint through animation frames, no price page state or candle pump; virtual market rows refresh independently once per second, with trade latency/age hover and immediate polling recovery. Binance and Bybit payloads tested.
- Controlled browser verification: 30-second rapid-trade test averaged 18.50 ms (synthetic event timestamps), 474 observed price changes (~15.8/s); all eight timeframes, custom 7m, BTC/ETH/BNB switches, single active trade socket, matched candles, search/scroll/zoom, and status hover passed with zero console/page errors.
- Terminal: pair search + list, tabs (max 10, per-tab timeframe, persisted), Tools dropdown (7 switches only, persisted), themes, OHLC legend, zoom/reload, custom timeframes
- Live price: one combined active Binance aggTrade/kline session, replaced per pair/interval; last candle tracks live price, conditional Bybit and polling recover after three failures.
- Terminal updates: status dot and connection logs, dotted price line, orderflow after Custom, minute units, Profile/Logout, and scrollbar refinements.
- Verification: 16 tests passed; real BTCUSDT price changed seven times in ten seconds via polling; all eight timeframes, custom 45m, and BTC/ETH/BNB candle-price matching passed; menus and logout passed with zero console or page errors.
- DepthLens logo in terminal header, landing page, login/register; favicon from logo
- Landing page at "/" (hero, 4 feature cards, Not financial advice footer)
- /login and /register pages (design only, submit → /terminal)

## Open
- Binance primary availability verification: primary sockets did not deliver trades during this environment's stress run; automatic Bybit recovery and real trades passed. Immediate primary recovery is covered by tests and controlled Binance frames.
- Order flow tools (Heatmap, Volume Profile, Footprint, DOM, CVD, Whale Trades, Liquidations) — coming soon
- Real authentication for /login and /register
