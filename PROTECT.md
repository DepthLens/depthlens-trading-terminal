# PROTECT.md — permanent rules for every change

Read this file before any change. It applies to every future request.

## 1. Features that must never break
- Live price in the top bar with status dot and source selector (Auto, Binance, Bybit)
- WebSocket connection manager (max 3 open sockets, failover, exponential backoff)
- Pair list with search (pinned BTC/ETH/BNB, sorted by 24h volume), prices follow the active source
- Chrome-style pair tabs (max 10, per-tab timeframe, persisted)
- Timeframes (1m–1d) and Custom timeframe
- Candle chart: live candle, OHLC legend, magnet crosshair, Zoom In, Zoom Out, Reload
- Live price line with axis tag
- Tools (orderflow) menu with switches
- Volume Profile candle overlay: active-source cached 1m history, live trade volume, tick-aligned histogram, POC/VAH/VAL, hover details, saved settings and mobile sheet; hidden during Heatmap, no extra sockets.
- Order book engine and Book debug panel
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

Report the result as a short list.

## 4. Keep this list current
After every change, add any new feature to the list in section 1.
