// Recorded BTCUSDT CVD: per-minute taker buy/sell totals summed on the server from recorded Binance trades
// (read-only ob_cvd). Fixed 6h UTC pages keep cache keys stable while panning; closed pages stay in a 36-page LRU,
// the open page refreshes every 20 s and failures are never cached. Live Binance trades are added only at/after
// the newest recorded second (the returned cutoff), so recorded and live never overlap.
import { deltaBar, type DeltaBar } from './cvd-data';
import type { TailTrade } from './footprint-recorded';

export const CVD_RECORDED_SYMBOL = 'BTCUSDT';
export const isRecordedCvd = (symbol: string) => symbol === CVD_RECORDED_SYMBOL;
export const CVD_PAGE_MS = 6 * 3600000, CVD_MAX_PAGES = 36;
const OPEN_REFRESH_MS = 20000;

/** [buy coin, sell coin, buy quote, sell quote] per minute start (ms). */
export type CvdMinute = [number, number, number, number];
export type CvdPage = { from: number; to: number; at: number; closed: boolean; first: number | null; cutoff: number | null; minutes: Map<number, CvdMinute> };
export type RawCvd = { first: string | null; cutoff: string | null; minutes: [number, number, number, number, number][] };

export function parseCvdPage(raw: RawCvd | null, from: number, to: number, now = Date.now()): CvdPage {
  const minutes = new Map<number, CvdMinute>();
  for (const r of raw?.minutes ?? []) minutes.set(Number(r[0]), [Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4])]);
  const time = (v: string | null | undefined) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
  return { from, to, at: now, closed: to < now - 60000, first: time(raw?.first), cutoff: time(raw?.cutoff), minutes };
}

const pages = new Map<number, CvdPage>();
const inflight = new Map<number, Promise<CvdPage>>();
let pageUser: string | null = null, lastError: { at: number; message: string } | null = null;
export const cvdRecordedError = (now = Date.now()) => lastError && now - lastError.at < 15000 ? lastError.message : null;
export function peekCvdPage(index: number) { const hit = pages.get(index); if (hit) { pages.delete(index); pages.set(index, hit); } return hit ?? null; }
export function putCvdPage(index: number, page: CvdPage) {
  pages.set(index, page);
  while (pages.size > CVD_MAX_PAGES) { const oldest = pages.keys().next().value; if (oldest === undefined) break; pages.delete(oldest); }
}
export const cvdPageCount = () => pages.size;
export function clearCvdPages() { pages.clear(); inflight.clear(); pageUser = null; lastError = null; }
export function cvdPagesFor(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.floor(from / CVD_PAGE_MS); i * CVD_PAGE_MS < to; i++) out.push(i);
  return out.slice(-CVD_MAX_PAGES); // never request more pages than the cache keeps
}
const needsLoad = (p: CvdPage | null, now = Date.now()) => !p || (!p.closed && now - p.at >= OPEN_REFRESH_MS);

function loadCvdPage(index: number): Promise<CvdPage> {
  const running = inflight.get(index); if (running) return running;
  const job = (async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError) throw new Error(authError.message);
    if (!auth.session) throw new Error('Sign in to read recorded trades');
    if (pageUser !== auth.session.user.id) { pages.clear(); pageUser = auth.session.user.id; }
    const from = index * CVD_PAGE_MS, to = from + CVD_PAGE_MS;
    const { data, error } = await supabase.rpc('ob_cvd' as never, { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() } as never);
    if (error) throw new Error((error as { message: string }).message);
    if (!data) throw new Error('Recorded CVD returned no response');
    const page = parseCvdPage(data as RawCvd, from, to);
    putCvdPage(index, page); lastError = null;
    return page;
  })().catch(e => { lastError = { at: Date.now(), message: e instanceof Error ? e.message : String(e) }; throw e; }).finally(() => inflight.delete(index));
  inflight.set(index, job);
  return job;
}
/** Load missing or stale pages (3 in parallel); resolves true when anything new arrived. */
export async function ensureCvdPages(indexes: number[]): Promise<boolean> {
  const todo = indexes.filter(i => needsLoad(peekCvdPage(i)) && !inflight.has(i));
  if (!todo.length || cvdRecordedError()) return false;
  let changed = false;
  for (let i = 0; i < todo.length; i += 3) {
    const results = await Promise.allSettled(todo.slice(i, i + 3).map(loadCvdPage));
    if (results.some(r => r.status === 'fulfilled')) changed = true;
    if (results.some(r => r.status === 'rejected')) break;
  }
  return changed;
}
/** Newest recorded second among loaded pages that have started. */
export function cvdLiveCutoff(list: Iterable<CvdPage> = pages.values(), now = Date.now()): number | null {
  let best: number | null = null;
  for (const p of list) if (p.cutoff !== null && p.from <= now && (best === null || p.cutoff > best)) best = p.cutoff;
  return best;
}

/** Recorded minutes from `from` plus live trades at/after the cutoff; the minute holding the cutoff gets both halves
 * (recorded part first, then live trade by trade, so its high/low path stays exact). Returns null if a page is missing. */
export function mergeRecordedCvd(a: { from: number; now: number; pages: (CvdPage | null)[]; cutoff: number | null; trades: readonly TailTrade[] }): DeltaBar[] | null {
  const out = new Map<number, DeltaBar>();
  for (const p of a.pages) {
    if (!p) return null;
    for (const [m, [bc, sc, bq, sq]] of p.minutes) if (m >= a.from) out.set(m, deltaBar(m, bq - sq, bc - sc));
  }
  if (a.cutoff !== null) {
    let i = a.trades.length;
    while (i > 0 && (a.trades[i - 1]?.time ?? 0) >= a.cutoff) i--;
    for (; i < a.trades.length; i++) {
      const t = a.trades[i]!; if (t.time > a.now + 60000) continue;
      const m = Math.floor(t.time / 60000) * 60000; if (m < a.from) continue;
      let b = out.get(m); if (!b) { b = deltaBar(m, 0, 0); out.set(m, b); }
      const s = t.sell ? -1 : 1;
      b.quote += s * t.size * t.price; b.coin += s * t.size;
      b.quoteHigh = Math.max(b.quoteHigh, b.quote); b.quoteLow = Math.min(b.quoteLow, b.quote);
      b.coinHigh = Math.max(b.coinHigh, b.coin); b.coinLow = Math.min(b.coinLow, b.coin); b.path = true;
    }
  }
  return [...out.values()].sort((x, y) => x.time - y.time);
}
/** Candles before the recording start keep Binance candle totals; candles from it on use recorded minutes only. */
export function joinCvdBars(older: DeltaBar[], recorded: DeltaBar[], recStart: number, minutes: number): DeltaBar[] {
  const span = minutes * 60000, first = Math.ceil(recStart / span) * span;
  return [...older.filter(b => b.time < first), ...recorded.filter(b => b.time >= first)];
}
