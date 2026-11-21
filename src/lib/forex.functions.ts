import { createServerFn } from '@tanstack/react-start';
import { FOREX_PAIRS, marketClosed } from './forex-data';

// Fetches only the newest completed 1h candles from Twelve Data into the shared table. Runs at most once per
// 30 minutes globally (claimed through forex_sync_state) and up to 7 pairs per run, so the free limit
// (8 calls/min, 800/day) is never reached. The API key stays on the server.
export const syncForex = createServerFn({ method: 'POST' }).handler(async () => {
  const key = process.env['TWELVE_DATA_API_KEY'];
  if (!key) return { ran: false, reason: 'missing key' };
  const now = Math.floor(Date.now() / 1000);
  if (marketClosed(now)) return { ran: false, reason: 'market closed' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: claim } = await supabaseAdmin.from('forex_sync_state').update({ last_run: new Date().toISOString() }).eq('id', 1).lt('last_run', cutoff).select('id');
  if (!claim?.length) return { ran: false, reason: 'recently synced' };
  const lastDone = now - (now % 3600) - 3600; // start of the latest completed hour
  const latest: { pair: string; time: number }[] = [];
  for (const pair of FOREX_PAIRS) {
    const { data } = await supabaseAdmin.from('forex_candles').select('time').eq('pair', pair).eq('tf', '1h').order('time', { ascending: false }).limit(1);
    latest.push({ pair, time: Number(data?.[0]?.time ?? 0) });
  }
  const due = latest.filter(l => l.time < lastDone).sort((a, b) => a.time - b.time).slice(0, 7);
  let saved = 0; const errors: string[] = [];
  for (const { pair, time } of due) {
    const start = new Date((time + 3600) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1h&timezone=UTC&order=ASC&outputsize=5000&start_date=${encodeURIComponent(start)}&apikey=${key}`;
    try {
      const r = await fetch(url); const d = await r.json() as { status?: string; message?: string; values?: { datetime: string; open: string; high: string; low: string; close: string }[] };
      if (d.status === 'error') { errors.push(`${pair}: ${d.message ?? 'error'}`); continue; }
      const rows = (d.values ?? []).map(v => ({ pair, tf: '1h', time: Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000, open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
        .filter(x => Number.isFinite(x.time) && x.time > time && x.time <= lastDone && Number.isFinite(x.close));
      if (rows.length) { const { error } = await supabaseAdmin.from('forex_candles').upsert(rows, { onConflict: 'pair,tf,time' }); if (error) errors.push(`${pair}: ${error.message}`); else saved += rows.length; }
    } catch (e) { errors.push(`${pair}: ${(e as Error).message}`); }
  }
  return { ran: true, pairs: due.map(d => d.pair), saved, errors };
});
