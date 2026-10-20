// UTC epoch buckets are identical to chart-data.ts, including custom intervals.
export function candleCountdown(now: number, minutes: number, offset = 0) {
  const interval = minutes * 60000, corrected = now + offset;
  const closeAt = (Math.floor(corrected / interval) + 1) * interval;
  const seconds = Math.max(1, Math.ceil((closeAt - corrected) / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { closeAt, seconds, text: h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}` };
}