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
- PriceChart owns the active symbol's combined kline/aggTrade connection; market quotes use one shared miniTicker array stream to avoid inactive-tab subscriptions.
