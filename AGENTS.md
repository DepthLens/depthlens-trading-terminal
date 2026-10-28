<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Terminal settings live exclusively in browser localStorage through `terminal-state.ts`; this terminal does not require a backend.
- Keep chart aggregation in browser-safe `chart-data.ts` and WebSocket lifecycle in `market-stream.ts` so rules are testable and all sockets clean up on tab changes.
- The module-level connection manager is the sole WebSocket owner, serializes close handshakes and enforces exchange/purpose and global limits; this prevents leaks across effects and hot reload.
- live-price.ts owns the trade sessions (Binance aggTrade, Bybit publicTrade), clock-corrected latency stats and Auto source selection; klines only correct closed candles, so the live price comes from trades alone.
- Keep exchange price formatting and pinned quote-volume sorting in browser-safe `market-data.ts`; chart bars contain only OHLC so no volume indicator data is maintained.
- LiveQuote owns the active trade connection and a ref bridge to PriceChart; apply every trade before animation-frame painting and never put live price or OHLC in page state, to isolate high-frequency work.
- MarketList virtualizes fixed-height rows via market-list.ts and reads ticker refs once per second in its own component, so quote updates cannot rerender the terminal or chart.
- order-book.ts owns the single active liquidity book and sequence recovery; optional topics multiplex through the existing active exchange socket, never create a connection, and book diagnostics rerender only their own panel.
- Only correct historical chart candles that already exist in the rendered series; stream timestamps can precede or skip loaded history and must not cause chart exceptions.
- Heatmap state lives in browser-safe `heatmap-data.ts` (one-second typed-array columns, USDT notional, 60-minute cap); `Heatmap.tsx` only draws via offscreen ImageData and rAF, receives trades through the LiveQuote bridge (`heat`), and never opens sockets. Buffers live in module-level `heatmap-store.ts` keyed by source:symbol (only a source change clears them), persist to IndexedDB via `heatmap-persist.ts` every 10s, and backfill 60 minutes of price-only columns from 1m klines plus recent trades, rate-limited to one run per 5 minutes with a 60s pause on 429/418.
- Phone layout switches via useTerminalMobile (narrow or touch-landscape) + data-mobile/`mobile:` variant; desktop markup stays separate so it never changes.
- Candle-chart overlays use native price lines, series primitives or markers anchored to price/time; never separate canvases or stored render pixels. Heatmap has independent axes and is exempt.
- Volume Profile aggregation/cache/rate limiting live in browser-safe `volume-profile.ts`; histogram primitives convert price on each draw, native lines retain profile prices, and aggregation waits 200ms after viewport interaction stops. Live volume updates existing price bins without sockets or page state.
- The candle timer uses a series primitive with fixed price-axis views for the unchanged live tag and its countdown so they stay paired; its clock uses live-price exchange offsets and chart-data epoch bucketing, with browser-only saved Tools settings.
- checkOverlayStability scrolls/zooms and compares primitive render measurements and native-line screenshot pixels against series coordinates; run it in chart smoke tests.
- Footprint aggregation is browser-safe `footprint-data.ts`; module-level buffers, IndexedDB persistence and rate-limited backfill live in `footprint-store.ts`. Its cluster primitive owns glyphs, rows and dashed empty columns while native glyphs are hidden; narrow columns remain normal candles, scale-aware tick grouping uses hysteresis, and per-trade notional is retained alongside coin volume for accurate selectable units. Drawing derives coordinates every frame and diagnostic samples never feed rendering.
- The candle timer primitive always owns the live price axis tag (native last-value label off) so its direction color survives series style changes such as Footprint outlines.
- Shared browser-safe tool-layout rules own depth/profile grids and fit gates; tool-demo provides query-only isolated fixtures, never persisted, so synthetic values cannot contaminate live caches.
- Heatmap stores calibrated base row/depth with IndexedDB history and draws a persistent offscreen ring texture; profile updates subscribe to immediate trade deltas rather than scanning historical maps, preserving chart responsiveness.
- DOM ladder grouping/auto-size/wall rules live in browser-safe `dom-ladder.ts`; `DomLadder.tsx` only reads the existing order-book engine on a ≤10 fps canvas loop and never stores the ladder in React state or opens sockets.
