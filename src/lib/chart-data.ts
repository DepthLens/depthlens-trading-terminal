export type Bar = { time: number; open: number; high: number; low: number; close: number };
export const NATIVE: Record<number, string> = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 240: '4h', 1440: '1d' };
export function aggregate(bars: Bar[], minutes: number): Bar[] {
  const ms = minutes * 60000;
  const out: Bar[] = [];
  for (const b of bars) {
    const time = Math.floor(b.time / ms) * ms;
    const last = out.at(-1);
    if (last && last.time === time) { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; }
    else out.push({ ...b, time });
  }
  return out;
}
export function applyTrade(bar: Bar | undefined, time: number, price: number, minutes: number): Bar {
  const bucket = Math.floor(time / (minutes * 60000)) * minutes * 60000;
  if (!bar || bucket > bar.time) return { time: bucket, open: price, high: price, low: price, close: price };
  if (bucket < bar.time) return bar;
  return { ...bar, high: Math.max(bar.high, price), low: Math.min(bar.low, price), close: price };
}
// A delayed trade must not let the kline feed replace the displayed live price.
export function applyLivePrice(bar: Bar, time: number, price: number, minutes: number): Bar {
  return applyTrade(bar, Math.max(bar.time, time), price, minutes);
}
