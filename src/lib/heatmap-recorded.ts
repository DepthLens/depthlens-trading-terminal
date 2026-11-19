// Recorded BTCUSDT order book history (Binance USD-M) saved by the backend recorder every 5 seconds.
// Only used by the Heatmap for windows longer than its 60-minute live buffer.
import { ROWS, type Column } from './heatmap-data';

export type RecordedSnapshot = { ts: string; source: string; mid: number; step: number; base: number; bids: number[]; asks: number[] };
export const RECORDED_SYMBOL = 'BTCUSDT';
export const LONG_WINDOWS = [240, 1440, 10080] as const; // 4h, 24h, 7d
const MAX_COLS = 2880;

// Seconds between columns so a window never needs more than MAX_COLS columns (min 5s, the recording rate).
export function recordedEvery(windowMin: number): number {
  return Math.max(5, Math.ceil((windowMin * 60) / MAX_COLS));
}

// Re-bin a 150-row snapshot (USDT notional per row) into the heatmap's own bucket grid.
export function snapshotToColumn(s: RecordedSnapshot, bucket: number): Column {
  const origin = Math.floor(s.mid / bucket) - ROWS / 2;
  const data = new Float32Array(ROWS);
  const n = Math.min(s.bids.length, s.asks.length);
  for (let i = 0; i < n; i++) {
    const v = (s.bids[i] ?? 0) + (s.asks[i] ?? 0);
    if (!(v > 0)) continue;
    const t = Math.floor((s.base + (i + 0.5) * s.step) / bucket) - origin;
    if (t >= 0 && t < ROWS) data[t] = (data[t] ?? 0) + v;
  }
  return { time: Date.parse(s.ts), origin, data, trades: new Map(), price: s.mid, gap: false };
}

// Thin columns to one per `everySec` slot (keeps the first in each slot).
export function thinColumns(cols: readonly Column[], everySec: number): Column[] {
  const out: Column[] = []; let last = -1;
  for (const c of cols) { const slot = Math.floor(c.time / 1000 / everySec); if (slot !== last) { out.push(c); last = slot; } }
  return out;
}

const cache = new Map<string, { at: number; rows: RecordedSnapshot[] }>();
// Fetch recorded snapshots older than `before`, thinned on the server. Cached for 60 seconds.
export async function loadRecorded(windowMin: number, before: number): Promise<RecordedSnapshot[]> {
  const every = recordedEvery(windowMin);
  const k = `${windowMin}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 60000) return hit.rows;
  const { supabase } = await import('@/integrations/supabase/client');
  const from = new Date(Date.now() - windowMin * 60000).toISOString(), to = new Date(before).toISOString();
  const rows: RecordedSnapshot[] = [];
  for (let off = 0; off < MAX_COLS + 1000; off += 1000) {
    const { data, error } = await supabase.rpc('ob_history', { p_from: from, p_to: to, p_every: every }).range(off, off + 999);
    if (error || !data) break;
    rows.push(...(data as RecordedSnapshot[]));
    if (data.length < 1000) break;
  }
  cache.set(k, { at: Date.now(), rows });
  return rows;
}

export type RecorderStatus = { last: string | null; lastHour: number; gaps: number; maxGapSec: number; lastSource: string | null };
export async function loadRecorderStatus(): Promise<RecorderStatus | null> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.rpc('ob_recorder_status');
  return error ? null : (data as RecorderStatus);
}
