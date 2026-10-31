# Roadmap

## Whale Trades
- [ ] Existing-feed detection, per-source/pair thresholds, burst merging and 24h IndexedDB history with rate-limited real backfill.
- [ ] Price/time-anchored primitive, feed navigation, saved settings, badge and isolated demo fixtures.
- [ ] Rule tests and desktop/phone live/demo matrix; protection smoke checks and measured alignment/socket/price results.

## CVD
- [x] Browser-safe exact Binance delta/cache and Bybit real-trade history, anchors, modes and units.
- [x] Native synchronized resizable pane, saved settings, legend and alignment diagnostics.
- [x] 116 automated tests pass; real Binance BTC 5m/1h and ETH 15m 1m-sum errors below 0.000000000001%; 16 desktop/phone/source cases, 144 alignment measurements at 0px error, equal 84–86px axes, all settings, Bybit price movement, Heatmap hiding, DOM toggles and overlay errors ≤0.91px verified without errors in final matrix.
- [ ] Full live Binance check blocked: sockets opened but delivered zero trades in all eight Binance samples. Full protection demo matrix/covered Footprint debug and reliably repeated resize-persistence checks remain unverified; do not claim all ten acceptance checks passed.

## Three-tool redesign
- [x] Shared theme palette and query-only watermarked demo fixture.
- [x] Heatmap depth-derived persisted rows, fitted band, crisp incremental drawing and sampled normalization.
- [x] VPVR styling, stable nice tick rows and incremental live updates.
- [x] Consistent no-data Footprint columns, cell legibility, restricted fit and coverage settings.
- [ ] New rule tests, overlay probes, protection updates, eight demo layouts and three live markets for three minutes each.

## Footprint
- [x] Rebuild professional cluster drawing, fixed-grid scale-aware rows, automatic 110px fit, and saved USDT/coin units.
- [x] Live Bybit BTC 1m/5m and ETH 5m each collected for three minutes with rows, bars, imbalance and moving prices; four-direction drags, 70px fallback, fit, saved units, three pairs/timeframes, Heatmap on/off and 390x844 phone pass with no console errors. Footprint/timer/profile/native lines stability <=1px; fully collected BTC 1m debug matches kline volume exactly. All 84 automated tests pass; two sockets observed. Binance live availability remains outside this environment's verified coverage.
- [x] Footprint store, backfill, primitive, settings, imbalance, LOD, persistence, direction-colored axis tag

## Stable chart overlays and candle timer
- [x] Replace Volume Profile canvas with a price-anchored series primitive and native POC/VAH/VAL price lines; defer recalculation until 200ms after interaction ends.
- [x] Add exchange-clock candle timer primitive, default-on saved Tools switch, and boundary tests.
- [x] Add permanent overlay rules and programmatic stability smoke check; BTC/ETH four-direction drags keep POC unchanged while held, zoom/resize checks pass, POC/VAH/VAL/histogram/timer errors <=1px. Verify 1m/5m/1h/custom 7m, actual 1m rollover, saved OFF/ON, 3 pairs, Heatmap on/off, desktop and fresh 390x844 live phone with zero console errors. All 69 tests pass; live verification used Bybit.

## Volume Profile
- [x] Cached active-source 1m volume data, tick-aligned histogram and live trade additions without sockets.
- [x] Candle overlay, POC/VAH/VAL, hover details, saved desktop/mobile settings and Heatmap hiding.
- [x] Verified BTC/ETH/DOGE at 1m/5m/15m, all settings and persistence, zoom/pan/tooltip, moving BTC price, Heatmap on/off, desktop and 390x844 phone. Bybit run had no console errors; Auto run encountered one Binance remote-close error. All 62 tests pass.

## Heatmap view
- [x] Buffer: 1s book snapshots, USDT notional buckets, 60 min typed-array history, Bybit orderbook.1000→200 fallback, "Collecting data… X min".
- [x] Drawing: offscreen ImageData, 1s updates + rAF, navy→blue→cyan→white→yellow→orange sqrt scale at 98th percentile, legend, trade bubbles, price/bid/ask lines + axis tag; columns right-anchored, scrolling left.
- [x] Controls: intensity, 5/15/30/60m window, x1/x2/x5/x10 grouping, min bubble, bubbles toggle, Center, wheel zoom + drag pan, hover tooltip, hidden-tab gap marking.
- [x] Verified: BTCUSDT cells/bubbles/legend/tag render, tooltip shows price·time·size, zoom/pan/intensity/grouping/window all work, ETH/SOL/BNB switches reset and remount, off→candle chart→on, 46 tests pass, zero console errors, ≤3 sockets.

## Heatmap history
- [x] Module-level store keyed by source:symbol; window/grouping/intensity/bubble/timeframe changes, tool toggles and tab switches never clear it; only a source change clears.
- [x] IndexedDB persistence every 10s; restore on load if under 60 minutes old, close time marked as a dim gap stripe.
- [x] Backfill on open: 1m klines for the price line, recent aggTrades for bubbles (Binance max 10 requests, Bybit one), once per pair+source per 5 minutes, 429/418 pauses 60s; "Price and trades only. Order book colors start at HH:MM" label; no invented book colors.
- [x] Verified: settings changed 5x each with history intact, refresh restored history with the label, off/on kept history, 52 tests pass, zero console errors.

## Live order book engine
- [x] Shared-socket subscriptions, Bybit snapshot/delta book, Binance buffered snapshot/sequence resync.
- [x] Active-pair/source and Heatmap/DOM gating; toggleable Book debug panel, no drawing.
- [x] 35 tests pass. Real Bybit and Binance BTCUSDT/DOGEUSDT books Synced with bid below ask and approximately 9–10 updates/s; ten pair changes reset and synchronize, at most three sockets, zero console errors; disabling tools clears the book without closing the trade connection.

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
- Remaining order flow tools (Whale Trades, Liquidations) — coming soon
- Real authentication for /login and /register

## Mobile layout
- [x] All 10 mobile items done and tested at 360/390/412, landscape and 1366

- [x] DOM order book ladder (panel, settings, tests, PROTECT entry)
