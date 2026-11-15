# PROTECT.md — permanent rules for every change

Read this file before any change. It applies to every future request.

## 1. Features that must never break
- Query-only `?demo=1` fixtures for Heatmap, Volume Profile and Footprint, always watermarked DEMO DATA and never saved into live caches.
- Shared CSS flow palette across four themes; Heatmap fixed #050b18 background, tick-precision axes, fitted depth band and crisp right-anchored 3–12px columns.
- Heatmap base row is tick-clamped niceStep(synced depthSpan/150), saved with calibration per source/symbol in IndexedDB even after history expires. Center fits 1.15 depthSpan; 20-row minimum and ±5% zoom cap. Persistent offscreen ring texture paints new columns; sampled color histogram every five seconds.
- VPVR 1px row gaps, 45% outside-area bars, bright yellow outlined POC, shaded VAH/VAL band and range/row label. Nice tick rows target 60 with 40% hysteresis; direct incremental trade deltas, no repeated live-map scans. Visible history beyond three days is labeled honestly.
- Footprint empty columns keep the cluster width with dashed outlines, a small candle and width-gated no-data text; 1px gaps, minimum 12% volume bars, bold imbalance text with dark shadow. Fit 110px only on enable/timeframe/explicit Fit, never unrelated render or manual zoom; settings show coverage minutes and source.
- Live price in the top bar with status dot and source selector (Auto, Binance, Bybit); an open but silent source shows amber "No trades from <source> yet" instead of red Offline.
- WebSocket connection manager (max 3 open sockets, failover, exponential backoff)
- Pair list with search (pinned BTC/ETH/BNB, sorted by 24h volume), prices follow the active source
- Chrome-style pair tabs (max 10, per-tab timeframe, persisted)
- Timeframes (1m–1d) and Custom timeframe
- Candle chart: live candle, OHLC legend, magnet crosshair, Zoom In, Zoom Out, Reload
- Live price line with axis tag
- Candle timer: default-on saved Tools switch, exchange-corrected UTC/custom close countdown below the live axis tag, same direction color, hidden outside visible price range, desktop/mobile.
- Whale Trades: existing-feed USDT detection, per-source/pair 60min Auto 99.9th percentile with 25K floor or fixed/custom; default 2s/5-tick same-side bursts, VWAP/count, 24h IndexedDB every 10s and real rate-limited backfill. Saved settings, native price/time circle primitive, feed navigation/flash, count, tooltip, hidden during Heatmap and query-only watermarked demo; no sockets.
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
- Control & Attack bars: Tools switch (default ON, saved); CONTROL strip above the chart (36px, 40px phone) and ATTACK strip below chart and panes (36px), collapsible, read the chart's loaded candles once per second with Price Pressure scoring, 2-update hold, sentences (tap on phone), gear for lookback/threshold/sentences; hidden in Heatmap view; no sockets.
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

12. Whale Trades: BTC/ETH/DOGE 1m/5m desktop 1366x768 and phone 390x844, Bybit and Binance when delivering; demo appearance, feed navigation/flash, settings restore, four-direction drag/zoom, circle price stability ≤1px, moving live price, Heatmap hiding and coexistence with all other tools, sockets ≤3, no console errors.

13. Control & Attack bars: BTC 1m and ETH 5m at 1366x768 and 390x844 show state words, meter and sentences with no overlap; live price moves; sockets ≤3.

Report the result as a short list.

Whale Trades last verified Nov 1 2026: sockets, 15 tool pairs, IndexedDB restore, 10-minute live run, Auto→Bybit and Binance silent message pass. Still unverified: live Binance trades (none delivered in the test browser).

## 4. Keep this list current
After every change, add any new feature to the list in section 1.

## 5. Chart overlay rules
- Every drawing on the candle chart (lines, zones, bars, labels, countdown) must be a native price line, a series primitive, or a marker.
- Anchor overlays to price and time values, never to pixel positions. Separate canvas layers are forbidden on the candle chart.
- The Heatmap view has its own axes and is exempt.
- Volume Profile levels use native series price lines and bars use a series primitive. Recalculate on pair/timeframe/range/settings changes and 200ms after pan/zoom stops, never while dragging.

## Floating tool windows (Part 1: Heatmap, DOM, Book debug, Whale feed)
- Rules live in browser-safe `window-manager.ts` (saved under `depthlens-windows`); `ToolWindows.tsx` is a layer above the chart that takes pointer events only on windows and minimized chips, and never touches chart internals.
- Tools menu: "Tool windows: Floating | Docked" and "Reset windows"; per-tool Dock/Float; Close turns the tool off (Whale feed: feed setting off; Book debug: off). Minimized windows stay mounted and only pause drawing. Phones (below 768px) never use windows.
- Smoke: at 1366x768 open DOM, Heatmap, Whale feed and Book debug together; drag, resize, minimize, restore, close, refresh (positions return); chart pans/zooms outside windows; live price moves; sockets ≤3; no console errors.

## Pressure page
- The toolbar "Pressure" button (desktop and phone) opens /pressure?symbol&tf&source in a NEW TAB; /popout/pressure and /popout/price-pressure redirect there.
- /pressure always shows, stacked: header, candles (~45%), Control & Attack strip, both Price Pressure panes — no section toggles. Own isolated chart, max 1 socket, same-origin BroadcastChannel "depthlens-sync" follow/lock.
- Theme tokens must be converted to rgb (canvas) with fallbacks before reaching lightweight-charts; it cannot parse oklch.
- Smoke: open /pressure?symbol=BTCUSDT&tf=1&source=bybit at 1000x700 and 390x844: "Loading candles..." then candles, strip text and both pane labels, live updates, 1 socket, no console errors.
- Tools menu "Tool windows": Pop-out window | Floating | Docked; tools without pop-out support use Floating.
- /pressure shows only header, Control & Attack strip and the two Price Pressure panes; the candle series stays hidden (pane stretch 0.02, no price line/last-value label).
- Default theme (legacy navy key): black/white chrome, bg #000000, panel #0D0D0D, border #2A2A2A; white primary/selected controls with black text, outlined ghost controls; color only where it carries meaning.
- Black & White theme (`data-theme="bw"`): chrome only — bg #000, panel #0E0E0E, border #3D3D3D, text white, accent white with black text. Candles, buy/sell, heatmap, footprint, whale and pair colors stay untouched. Switch: top-bar contrast button (returns to the previous theme) and the Profile dialog theme row; both persist. Active theme buttons need `btn-accent text-t-accent-fg-sm` or the Button's default `text-primary-foreground` wins and turns white-on-white.
- Theme smoke: unit suite once, computed colors at 1366x768/390x844, meaningful candles unchanged; /pressure retains hidden candles, strip and two live panes without overlap or console errors.
- Themes are three presets defined only in `src/lib/themes.ts` (White & Royal Blue default, Black & White, Navy & Pink), picked in the profile menu, saved in localStorage, applied to <html> before paint and synced to /pressure; colors carry meaning only for buy/sell, POC, heatmap and status.
- /pressure: candle pane 0 stays hidden (series invisible, no scale, ≤2px tall); only header, strip and two Price Pressure panes are visible.

- Flow Radar (Order Flow menu): own Binance REST klines per radar timeframe (default 1h), Flow Momentum/Trapped Sweep setups, native markers (arrow → ✓/✗/–), stop/target lines for open setups, toast on new setup, scoreboard; rules in flow-radar.ts with tests. No sockets.
