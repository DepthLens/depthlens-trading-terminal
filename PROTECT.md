# PROTECT.md — permanent rules for every change

Read this file before any change. It applies to every future request.

## 1. Features that must never break
- Query-only `?demo=1` fixtures for Heatmap, Volume Profile and Footprint, always watermarked DEMO DATA and never saved into live caches.
- Shared CSS flow palette across four themes; Heatmap fixed #050b18 background, tick-precision axes, fitted depth band and crisp right-anchored 3–12px columns.
- Heatmap base row is tick-clamped niceStep(synced depthSpan/150), saved with calibration per source/symbol in IndexedDB even after history expires. Center fits 1.15 depthSpan; 20-row minimum and ±5% zoom cap. Persistent offscreen ring texture paints new columns; sampled color histogram every five seconds.
- VPVR 1px row gaps, 45% outside-area bars, bright yellow outlined POC, shaded VAH/VAL band and range/row label. Nice tick rows target 60 with 40% hysteresis; direct incremental trade deltas, no repeated live-map scans. Visible history beyond three days is labeled honestly.
- Footprint empty columns keep the cluster width with dashed outlines, a small candle and width-gated no-data text; 1px gaps, minimum 12% volume bars, bold imbalance text with dark shadow. Fit 110px only on enable/timeframe/explicit Fit, never unrelated render or manual zoom; settings show coverage minutes and source.
- Live price in the top bar with status dot and source selector (Auto, Binance, Bybit)
- WebSocket connection manager (max 3 open sockets, failover, exponential backoff)
- Pair list with search (pinned BTC/ETH/BNB, sorted by 24h volume), prices follow the active source
- Chrome-style pair tabs (max 10, per-tab timeframe, persisted)
- Timeframes (1m–1d) and Custom timeframe
- Candle chart: live candle, OHLC legend, magnet crosshair, Zoom In, Zoom Out, Reload
- Live price line with axis tag
- Candle timer: default-on saved Tools switch, exchange-corrected UTC/custom close countdown below the live axis tag, same direction color, hidden outside visible price range, desktop/mobile.
- Tools (orderflow) menu with switches
- CVD: saved free Tools switch and settings; native resizable pane below candles (22% desktop, 25% mobile, minimum 90px), hidden with Heatmap, shared time scale/crosshair and equal fixed-minimum right axes. Exact own-timeframe Binance taker deltas, six cached 1500-candle pages maximum (Custom from 1m), absolute live kline updates; real Bybit trades plus recent 1000 with execution-ID deduplication and honest since label. Daily UTC/Weekly/Visible start (200ms idle)/Continuous, Line/Candles/Delta histogram, USDT/coin, reset marks and zero line; no extra sockets.
- Volume Profile candle overlay: active-source cached 1m history, live trade volume, tick-aligned histogram, POC/VAH/VAL, hover details, saved settings and mobile sheet; hidden during Heatmap, no extra sockets.
- Footprint cluster overlay: real trades only (active source, no extra sockets), 1m bid/ask buckets on a fixed tick grid kept 24h in IndexedDB, rate-limited real-trade backfill, saved settings and mobile sheet, hidden during Heatmap, included in checkOverlayStability. Narrow candle on left, bold 11px white centered bid x ask, proportional volume bars, same-row whole-cell imbalance (300%, adjustable 150–500%), light POC outline, totals and Bid x Ask/Delta/Volume modes. Auto fixed-grid tick-multiple rows remain at least 14px at the vertical scale with 40% hysteresis, real size shown in settings; cells clipped to high/low. Enable and Fit footprint set 110px spacing and latest candles; below 70px draw normal candles with delta tint, no bars/text; detailed candles with no data use a small candle inside a dashed column. Default saved USDT volume unit or coin, "Footprint data since HH:MM", and coin-volume debug comparison within 5% for a fully covered candle.
- Live price axis tag and candle timer are green when the candle is up and red when down.
- Order book engine and Book debug panel
- DOM ladder: Tools switch (saved), resizable right panel 220–420px (default 280) beside chart or Heatmap, 60% bottom sheet on mobile; canvas ladder ≤10 fps, bids group down/asks up on a fixed tick-multiple grid (Auto ~0.3%/side with 40% hysteresis, x1–x100), 15/25/40 rows per side with empty rows, middle last-trade row with arrow and spread, outlined best rows, header with source/status/best bid/ask/mid/imbalance, sync overlay, walls (2–10× median), flash, cumulative, USDT/coin, hover/tap details, Re-center after scroll; uses the existing engine only, no sockets.
- Heatmap view (cells, trade bubbles, controls, zoom/pan, tooltip)
- Heatmap history: module-level buffer per source+pair that never resets (only a source change clears it), IndexedDB restore after refresh with a dim gap stripe, 60-minute price/trade backfill, "Price and trades only" label
- Mobile layout (below 768px and phone landscape): Pairs bottom sheet, compact one-row top bar with settings menu, scrollable tabs and timeframe row, Tools icon with Book debug inside, tap-to-expand OHLC legend, floating chart buttons, single status indicator, heatmap controls sheet, safe areas
- Front page, login and register pages
- DepthLens logo and favicon

## 2. Rules
- Before any change, read PROTECT.md.
- Change only what the request asks. Do not rename, remove or restyle anything else.
- Do not touch the WebSocket manager, order book engine or chart setup unless the request is about them.
- If a request conflicts with a rule, stop and tell the user.

## 3. Smoke test after every change
1. The page loads with no console errors.
2. The BTCUSDT price moves.
3. Switch 3 pairs and 3 timeframes.
4. Tools opens.
5. Heatmap turns on and off.
6. Desktop and a 390x844 phone view are not broken.
7. Run checkOverlayStability() after scrolling/zooming; log PASS or FAIL for every overlay with at most 1px error. This includes "Footprint within high/low" (no cell outside its candle) and "Volume Profile bar height" (no bar taller than one row).
8. With Footprint on and zoomed in, small rows with numbers appear and Footprint debug logs PASS for a fully covered candle.
10. Turn DOM on: best bid/ask match Book debug, ladder updates, sockets ≤3, chart/live price/tools unchanged; turn it off.
9. Check demo at 1366x768 and 390x844 in navy/light/midnight/ocean: many thin Heatmap rows/bright band, clear VP outside-area and POC, readable Footprint plus consistent empty columns. Confirm watermark is absent without query.
11. Turn CVD on at desktop/phone, verify Binance BTC 1m/5m/1h and ETH 15m then Bybit, all anchors/modes/units, pane resizing and moving live price; run checkPaneAlignment() after scroll/zoom (candle x and right axes within 1px), with Volume Profile/Footprint/DOM/timer and Heatmap hiding; sockets ≤3 and no console errors.

Report the result as a short list.

## 4. Keep this list current
After every change, add any new feature to the list in section 1.

## 5. Chart overlay rules
- Every drawing on the candle chart (lines, zones, bars, labels, countdown) must be a native price line, a series primitive, or a marker.
- Anchor overlays to price and time values, never to pixel positions. Separate canvas layers are forbidden on the candle chart.
- The Heatmap view has its own axes and is exempt.
- Volume Profile levels use native series price lines and bars use a series primitive. Recalculate on pair/timeframe/range/settings changes and 200ms after pan/zoom stops, never while dragging.
