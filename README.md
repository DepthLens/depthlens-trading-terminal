# DepthLens Trading Terminal

Create a /terminal page for a crypto order flow tool called DepthLens. light Dark Blue navy theme. and add multiple theme and add gallery photo

Top bar: a pair search box that lists all Binance USDT futures pairs from https://fapi.binance.com/fapi/v1/exchangeInfo (default BTCUSDT), the live price with 24h change, timeframe buttons (1m, 5m, 10, 15m, 30, 1h, 4h, 1d), and a Custom button where I type my own timeframe in minutes (like 7 or 45). Build custom timeframes from 1m candles.

Left toolbar with tool buttons: Heatmap, Footprint, DOM, CVD, Volume Profile, Whale Trades, Liquidations. They are buttons only for now, with no function yet.

Center: a candlestick chart using lightweight-charts. Load history from https://fapi.binance.com/fapi/v1/klines and update live from wss://fstream.binance.com/ws/<symbol>@kline_<interval>. Show the price scale on the right and volume bars below. Changing the pair or timeframe reloads the chart. Use the browser's built-in WebSocket and reconnect if it drops.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/362cb260-1a90-4402-959c-4b72292405a5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
