# First-page animation polish

## Scope
Change the landing page only, following the uploaded brief. Preserve its wording, existing sections and order, colours, links, pricing and terminal chooser. Do not change either terminal, login, saved settings, recording or data services.

The quoted sentence is not a TypeScript diagnostic: the mobile hook already imports React correctly. No mobile-hook change is needed. Implementation waits for explicit approval.

## Changes
1. **Opening sequence:** reveal the existing headline word by word over approximately 600 ms, followed by the subtitle and a gentle scale-in for Open Terminal. Add an occasional soft button pulse and a hover light sweep.
2. **Existing chart visual:** refine the current demo candles to drift right-to-left with new candles forming at the edge; add restrained scroll parallax. Keep the existing framed chart rather than adding a candlestick wallpaper, which was previously rejected. Preserve its demo label and existing colours.
3. **Price strip:** mount the existing public-price ticker immediately below the hero. Show BTCUSDT, ETHUSDT and gold using real available Binance prices, briefly flashing up/down on changes. Identify gold accurately as XAUUSDT rather than claiming spot XAUUSD prices; never substitute demo prices when a quote is unavailable. Keep a stable strip height during loading.
4. **Tool sections:** reveal each label/title first, its preview from alternating sides next, and bullets individually afterward. Add subtle mouse tilt and border glow to previews, and arrow movement to Open Tool links. Preserve all current tool links and the chooser.
5. **Page polish:** count existing statistics up to their unchanged values once visible, retaining units; add smooth anchor scrolling, a slightly darker/blurred header after scroll, a thin yellow top progress line, and one-time footer-link reveals. Use existing theme tokens.

## Performance and accessibility
- Use CSS opacity/transforms and lightweight browser observers; avoid new animation libraries and large-area blur.
- Preserve the existing one-active-preview limit. Pause ongoing chart, ticker and pulse animations off-screen and when the browser tab is hidden; pause ticker polling when not visible.
- Keep fixed element dimensions to prevent jumps. Disable mouse tilt on touch devices.
- Respect reduced motion, including changes to the setting while the page is open: show content immediately, retain static previews and real quotes, and disable movement, flashes and smooth scrolling.
- Each reveal/count-up runs once. Clean up observers, listeners, timers and animation frames.

## Technical approach
Keep changes within the landing route, its site components and landing-scoped CSS. Reuse PriceTicker, Hero3DVisual and MiniClip rather than connecting terminal engines or creating sockets. Shared footer animation must be opt-in for the landing page so other screens remain unchanged. Record any new structural rule in AGENTS.md and update PROTECT.md for approved features.

## Light validation
- Desktop and 390×844 phone: opening sequence, each tool reveal, stats, ticker, footer and no overlap.
- Verify real ticker responses and up/down change detection, with an honest unavailable state if the exchange cannot be reached.
- Check off-screen/hidden-tab pausing and reduced-motion static rendering.
- Exercise Open Terminal, tool chooser, anchor links and existing navigation.
- Run affected existing tests, inspect preview errors and check the required protection smoke where access is available; report unavailable signed-in checks rather than claiming they passed.