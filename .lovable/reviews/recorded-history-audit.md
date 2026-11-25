# Recorded history audit

## Rule
Signed-in users selecting Binance BTCUSDT must see saved book history without waiting for live trades; live book columns take priority, errors remain visible, and recorded data stays unchanged.

## Places checked
- **Futures desktop and mobile Heatmap:** read `TerminalView.tsx` and `Heatmap.tsx`. Both use the same Heatmap; added selected-source handoff, startup reads, visible failure, range/count, and historical-price fallback before trades arrive. Isolated component browser checks passed at 1366×768, 390×844 and 360×780; these are not signed-in terminal checks.
- **Legacy floating Heatmap branch:** read `TerminalView.tsx`; currently unreachable because only Price Pressure can float. Kept the branch's source handoff consistent without enabling it.
- **Forex reuse:** read `TerminalView.tsx`; spot pairs use ForexChart and unavailable tools rather than Heatmap; gold uses the same crypto Heatmap but is not BTCUSDT. Recorded history stays excluded.
- **Short 15m/1h merge and long 4h/24h/7d merge:** read `Heatmap.tsx` and `heatmap-recorded.ts`; short gaps retain live price/trades and genuine live books, long windows keep live columns on the right. Fixed swallowed history errors, failure caching and stale range identity. Regression tests cover short startup fills and preservation of live columns.
- **Admin recorder status:** read `Heatmap.tsx` and `loadRecorderStatus`; now waits for session restoration and displays failures instead of returning silent null. Poll cleanup guards prevent updates after unmount.
- **History restoration/background browser work:** read `heatmap-store.ts`; IndexedDB restoration and price/trade backfill are separate from recorded RPC reads. Left these, sockets and persistence unchanged.
- **Authentication gate:** read `_authenticated/route.tsx`; signed-in checks occur before the terminal mounts. Left login and gate unchanged. The earlier claim that the gate definitely makes anonymous history requests was not proven; waiting for session hydration is defensive, not a permission change.
- **Database `ob_history` and `ob_recorder_status`:** read deployed definitions through a read-only query. Both are invoker, read-only functions with authenticated EXECUTE; snapshot SELECT is granted and RLS permits signed-in reads only. No INSERT/UPDATE/DELETE policies exist. Left all functions, permissions, recorder jobs and stored rows unchanged.
- **Landing, login and Pressure:** route metadata and history-call searches were read. No recorded-history reader exists there, so no changes were made. Demo fixtures remain query-only and excluded from recorded reads.
- **Reported mobile-hook error:** read `use-mobile.tsx`; React is already imported. No hook change was needed; the latest preview reports build OK.

## Findings
Hypothesis 2 was confirmed: errors were swallowed and cached as empty successes. Hypothesis 3 was confirmed as startup timing: recorded availability depended on the book source and a synced book sample. Hypothesis 4's merge still existed and is retained. Hypothesis 1 was not a missing authenticated grant: deployed read privileges and the earlier signed-in RPC checks succeeded; anonymous denial is expected.

## Verification and limitation
216 tests passed. Isolated signed-out failure visibility, startup long-window controls and login redirects were checked in the browser with no page errors. Live signed-in 15m/1h/4h/reload, actual live-price/chart smoke, and a fresh authenticated write attempt remain unverified: the assistant session service cannot mint tokens for this user-managed Supabase project. No account, credentials, settings, demo rows or recorded data were created or changed.