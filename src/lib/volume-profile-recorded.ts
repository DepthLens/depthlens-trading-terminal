// Recorded-trade Volume Profile for Binance BTCUSDT. Reads aggregated trade_levels (read-only RPC ob_trade_profile)
// in fixed one-hour pages (closed pages cached, LRU) plus exact edge fragments, and stitches live Binance trades
// strictly after the recorded cutoff so nothing is counted twice and no second is skipped.
import { RECORDED_SYMBOL } from './heatmap-recorded';

export type Level = [price: number, buy: number, sell: number];
export type TradeProfile = { levels: Level[]; first: number | null; cutoff: number; to: number };
export type TailTrade = { time: number; price: number; size: number; buy: number };

const HOUR = 3600000;
export const RECORDED_PROFILE_LIMIT_MS = 14 * 86400000;
export const isRecordedProfile = (symbol: string) => symbol === RECORDED_SYMBOL;

// Price bin for the server sum: the largest tick multiple at most a quarter of a profile row (exact ticks for fine rows).
export function profileBin(step: number, tick: number): number {
  let bin = tick;
  for (const m of [1, 5, 10, 50, 100, 500]) if (tick * m <= step / 4 + 1e-9) bin = tick * m;
  return Number(bin.toPrecision(12));
}

// Split [from,to) into whole UTC hour pages plus leading/trailing fragments.
export function profilePages(from: number, to: number): { from: number; to: number; page: boolean }[] {
  const out: { from: number; to: number; page: boolean }[] = [];
  if (!(to > from)) return out;
  const firstHour = Math.ceil(from / HOUR) * HOUR, lastHour = Math.floor(to / HOUR) * HOUR;
  if (firstHour >= lastHour) return [{ from, to, page: false }];
  if (from < firstHour) out.push({ from, to: firstHour, page: false });
  for (let t = firstHour; t < lastHour; t += HOUR) out.push({ from: t, to: t + HOUR, page: true });
  if (to > lastHour) out.push({ from: lastHour, to, page: false });
  return out;
}

type Part = { levels: Level[]; first: number | null; cutoff: number };
const cache = new Map<string, { at: number; closed: boolean; part: Part }>();
const inflight = new Map<string, Promise<Part>>();
let cacheUser: string | null = null;

async function fetchPart(from: number, to: number, bin: number, userId: string): Promise<Part> {
  const closed = to < Date.now() - 60000;
  const key = `${bin}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && (hit.closed || Date.now() - hit.at < 5000)) { cache.delete(key); cache.set(key, hit); return hit.part; }
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.rpc('ob_trade_profile' as never, { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_bin: bin } as never);
    if (error) throw new Error((error as { message: string }).message);
    const body = data as { first: string | null; cutoff: string | null; levels: Level[] } | null;
    if (!body) throw new Error('Recorded trades returned no response');
    const part: Part = { levels: Array.isArray(body.levels) ? body.levels : [], first: body.first ? Date.parse(body.first) : null, cutoff: body.cutoff ? Date.parse(body.cutoff) : closed ? to : from };
    if (cacheUser === userId) {
      cache.set(key, { at: Date.now(), closed, part });
      while (cache.size > 600) { const k = cache.keys().next().value; if (k === undefined) break; cache.delete(k); }
    }
    return part;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// Loads the recorded trade levels for [from,to). Requests run 24 at a time (one UTC day in a single round); failures are never cached.
export async function loadTradeProfile(from: number, to: number, bin: number): Promise<TradeProfile> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data: auth, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!auth.session) throw new Error('Sign in to read recorded trades');
  if (cacheUser !== auth.session.user.id) { cache.clear(); cacheUser = auth.session.user.id; }
  const start = Math.max(from, Date.now() - RECORDED_PROFILE_LIMIT_MS);
  const parts = profilePages(start, to), results: Part[] = new Array(parts.length);
  let next = 0;
  const worker = async () => { while (next < parts.length) { const i = next++; const p = parts[i]; if (p) results[i] = await fetchPart(p.from, p.to, bin, auth.session.user.id); } };
  await Promise.all(Array.from({ length: Math.min(24, parts.length) }, worker));
  const levels: Level[] = []; let first: number | null = null;
  for (const r of results) { if (!r) continue; for (const l of r.levels) levels.push(l); if (r.first !== null && (first === null || r.first < first)) first = r.first; }
  const last = results.at(-1);
  return { levels, first, cutoff: last ? last.cutoff : to, to };
}

// Live Binance BTCUSDT trades (exact exchange time), kept 15 minutes, used only after the recorded cutoff.
const tail: TailTrade[] = [];
const listeners = new Set<(t: TailTrade) => void>();
export function addTailTrade(t: TailTrade) {
  tail.push(t);
  const cut = Date.now() - 15 * 60000;
  if (tail.length > 50000 || (tail[0] && tail[0].time < cut)) { let i = 0; while (i < tail.length && (tail[i]?.time ?? 0) < cut) i++; tail.splice(0, Math.max(i, tail.length - 50000)); }
  for (const l of listeners) l(t);
}
export const subscribeTail = (l: (t: TailTrade) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const tailAfter = (cutoff: number, to: number) => tail.filter(t => t.time >= cutoff && t.time < to);
export const tailStart = () => tail[0]?.time ?? null;
export function clearTail() { tail.length = 0; }

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
// Honest coverage note for the period.
export function coverageNote(p: Pick<TradeProfile, 'levels' | 'first'>, from: number, hasLive = false): string {
  if (!p.levels.length && !hasLive) return 'No recorded trades for this period';
  if (p.first === null) return hasLive ? 'Partial: live trades only' : 'No recorded trades for this period';
  return p.first > from + 60000 ? `Partial: recorded from ${utc(p.first)}` : '';
}

// Point of control (bin centre with most volume) and price extremes of a set of levels.
export function levelStats(levels: readonly Level[]): { poc: number | null; low: number; high: number } {
  const sums = new Map<number, number>(); let low = Infinity, high = -Infinity;
  for (const [p, b, s] of levels) { sums.set(p, (sums.get(p) ?? 0) + b + s); if (p < low) low = p; if (p > high) high = p; }
  let poc: number | null = null, best = -1;
  for (const [p, v] of sums) if (v > best) { best = v; poc = p; }
  return { poc, low, high };
}
// A previous day's POC stays naked until any later traded price range covers it.
export function nakedPocs(days: { day: number; levels: Level[] }[], laterRanges: { low: number; high: number }[][], bin: number) {
  const out: { day: number; price: number }[] = [];
  days.forEach((d, i) => {
    const { poc } = levelStats(d.levels);
    if (poc === null) return;
    const touched = (laterRanges[i] ?? []).some(r => r.low - bin / 2 <= poc && r.high + bin / 2 >= poc);
    if (!touched) out.push({ day: d.day, price: poc });
  });
  return out;
}
