import { createServerFn } from '@tanstack/react-start';
import { FOREX_PAIRS, FOREX_TFS, FX_DAY_CAP, FX_MIN_CAP, aggregateFx, bucketStart, extraPairDue, isBasePair, marketClosed, normalizePair, type FxBar } from './forex-data';

type TdValue = { datetime: string; open: string; high: string; low: string; close: string };
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** Reserves one Twelve Data call in the shared counter; false when the minute/day limit is reached. */
async function takeCall(db: Admin, purpose: string, pair: string) {
  const { data, error } = await db.rpc('fx_take_call', { _purpose: purpose, _pair: pair, _min_cap: FX_MIN_CAP, _day_cap: FX_DAY_CAP });
  return !error && data === true;
}

async function fetchHours(key: string, pair: string, afterSec: number | null, lastDone: number): Promise<{ rows: FxBar[]; error?: string }> {
  const start = afterSec == null ? '' : `&start_date=${encodeURIComponent(new Date((afterSec + 3600) * 1000).toISOString().slice(0, 19).replace('T', ' '))}`;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1h&timezone=UTC&order=ASC&outputsize=5000${start}&apikey=${key}`;
  try {
    const d = await (await fetch(url)).json() as { status?: string; message?: string; values?: TdValue[] };
    if (d.status === 'error') return { rows: [], error: d.message ?? 'error' };
    const rows = (d.values ?? []).map(v => ({ time: Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000, open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
      .filter(x => Number.isFinite(x.time) && x.time <= lastDone && (afterSec == null || x.time > afterSec) && Number.isFinite(x.close));
    return { rows };
  } catch (e) { return { rows: [], error: (e as Error).message }; }
}

async function upsert(db: Admin, pair: string, tf: string, bars: FxBar[]) {
  for (let i = 0; i < bars.length; i += 1000) {
    const { error } = await db.from('forex_candles').upsert(bars.slice(i, i + 1000).map(b => ({ pair, tf, ...b })), { onConflict: 'pair,tf,time' });
    if (error) throw error;
  }
}

/** Saves new 1h candles and rebuilds the 4h/1D/1W/1M buckets they touch from saved 1h candles. */
async function saveWithHigherTfs(db: Admin, pair: string, rows: FxBar[]) {
  if (!rows.length) return;
  await upsert(db, pair, '1h', rows);
  const from = bucketStart(rows[0]!.time, '1M');
  const hours: FxBar[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db.from('forex_candles').select('time,open,high,low,close').eq('pair', pair).eq('tf', '1h').gte('time', from).order('time').range(off, off + 999);
    if (error) throw error;
    hours.push(...(data ?? []).map(r => ({ ...r, time: Number(r.time) })));
    if (!data || data.length < 1000) break;
  }
  for (const tf of FOREX_TFS) if (tf !== '1h') await upsert(db, pair, tf, aggregateFx(hours, tf));
}

// Fetches only the newest completed 1h candles for the original 11 pairs. Runs at most once per 30 minutes
// globally (claimed through forex_sync_state) and every call goes through the shared minute/day counter.
export const syncForex = createServerFn({ method: 'POST' }).handler(async () => {
  const key = process.env['TWELVE_DATA_API_KEY'];
  if (!key) return { ran: false, reason: 'missing key' };
  const now = Math.floor(Date.now() / 1000);
  if (marketClosed(now)) return { ran: false, reason: 'market closed' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: claim } = await supabaseAdmin.from('forex_sync_state').update({ last_run: new Date().toISOString() }).eq('id', 1).lt('last_run', cutoff).select('id');
  if (!claim?.length) return { ran: false, reason: 'recently synced' };
  const lastDone = now - (now % 3600) - 3600;
  const latest: { pair: string; time: number }[] = [];
  for (const pair of FOREX_PAIRS) {
    const { data } = await supabaseAdmin.from('forex_candles').select('time').eq('pair', pair).eq('tf', '1h').order('time', { ascending: false }).limit(1);
    latest.push({ pair, time: Number(data?.[0]?.time ?? 0) });
  }
  const due = latest.filter(l => l.time < lastDone).sort((a, b) => a.time - b.time).slice(0, 7);
  let saved = 0, limited = false; const errors: string[] = [];
  for (const { pair, time } of due) {
    if (!(await takeCall(supabaseAdmin, 'hourly', pair))) { limited = true; break; }
    const { rows, error } = await fetchHours(key, pair, time, lastDone);
    if (error) { errors.push(`${pair}: ${error}`); continue; }
    if (rows.length) { const { error: e } = await supabaseAdmin.from('forex_candles').upsert(rows.map(r => ({ pair, tf: '1h', ...r })), { onConflict: 'pair,tf,time' }); if (e) errors.push(`${pair}: ${e.message}`); else saved += rows.length; }
  }
  return { ran: true, pairs: due.map(d => d.pair), saved, limited, errors };
});

export type OpenPairResult = { status: 'ready' | 'updated' | 'loaded' | 'busy' | 'paused' | 'invalid' | 'error'; pair: string; message?: string };

// Extra pairs: first open downloads up to 5000 1h candles in one call and builds 4h/1D/1W/1M; later opens fetch
// newer candles only when the last one is older than an hour (max one call per pair per hour). Browsers never
// reach Twelve Data; the key is read here only.
export const openForexPair = createServerFn({ method: 'POST' })
  .inputValidator((d: { pair: string }) => ({ pair: String(d?.pair ?? '').slice(0, 20) }))
  .handler(async ({ data }): Promise<OpenPairResult> => {
    const pair = normalizePair(data.pair);
    if (!pair) return { status: 'invalid', pair: data.pair, message: 'Type a pair like EUR/AUD' };
    if (isBasePair(pair)) return { status: 'ready', pair };
    const key = process.env['TWELVE_DATA_API_KEY'];
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    await db.from('forex_pair_sync').upsert({ pair }, { onConflict: 'pair', ignoreDuplicates: true });
    const { data: st } = await db.from('forex_pair_sync').select('last_fetch,history_loaded').eq('pair', pair).single();
    const now = Math.floor(Date.now() / 1000), lastDone = now - (now % 3600) - 3600;
    const lastFetch = st ? Date.parse(st.last_fetch) / 1000 : 0;
    if (!key) return { status: st?.history_loaded ? 'ready' : 'error', pair, message: 'Data source not configured' };

    if (!st?.history_loaded) {
      // Claim the download so two visitors opening the pair together cause one call; retry after 2 minutes if it failed.
      const { data: claim } = await db.from('forex_pair_sync').update({ last_fetch: new Date().toISOString() }).eq('pair', pair).eq('history_loaded', false).lt('last_fetch', new Date(Date.now() - 120_000).toISOString()).select('pair');
      if (!claim?.length) return { status: 'busy', pair };
      if (!(await takeCall(db, 'history', pair))) { await db.from('forex_pair_sync').update({ last_fetch: '1970-01-01T00:00:00Z' }).eq('pair', pair); return { status: 'paused', pair }; }
      const { rows, error } = await fetchHours(key, pair, null, lastDone);
      if (error || !rows.length) { await db.from('forex_pair_sync').delete().eq('pair', pair).eq('history_loaded', false); return { status: 'error', pair, message: error ? `Twelve Data: ${error}` : 'No candles for this pair' }; }
      try { await saveWithHigherTfs(db, pair, rows); } catch (e) { return { status: 'error', pair, message: (e as Error).message }; }
      await db.from('forex_pair_sync').update({ history_loaded: true, last_fetch: new Date().toISOString() }).eq('pair', pair);
      return { status: 'loaded', pair };
    }

    if (marketClosed(now)) return { status: 'ready', pair };
    const { data: lastRow } = await db.from('forex_candles').select('time').eq('pair', pair).eq('tf', '1h').order('time', { ascending: false }).limit(1);
    const lastCandle = Number(lastRow?.[0]?.time ?? 0);
    if (!extraPairDue(lastFetch, lastCandle, now)) return { status: 'ready', pair };
    const { data: claim } = await db.from('forex_pair_sync').update({ last_fetch: new Date().toISOString() }).eq('pair', pair).lt('last_fetch', new Date((now - 3600) * 1000).toISOString()).select('pair');
    if (!claim?.length) return { status: 'ready', pair };
    if (!(await takeCall(db, 'update', pair))) { await db.from('forex_pair_sync').update({ last_fetch: new Date(lastFetch * 1000).toISOString() }).eq('pair', pair); return { status: 'paused', pair }; }
    const { rows, error } = await fetchHours(key, pair, lastCandle, lastDone);
    if (error) return { status: 'error', pair, message: `Twelve Data: ${error}` };
    try { await saveWithHigherTfs(db, pair, rows); } catch (e) { return { status: 'error', pair, message: (e as Error).message }; }
    return { status: rows.length ? 'updated' : 'ready', pair };
  });
