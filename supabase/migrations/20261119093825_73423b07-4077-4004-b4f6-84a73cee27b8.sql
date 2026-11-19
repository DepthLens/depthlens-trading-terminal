create or replace function public.ob_history(p_from timestamptz, p_to timestamptz, p_every int)
returns table(ts timestamptz, source text, mid double precision, step double precision, base double precision, bids real[], asks real[])
language sql stable security invoker set search_path = public as $$
  select distinct on (floor(extract(epoch from s.ts) / greatest(p_every, 1)))
    s.ts, s.source, s.mid, s.step, s.base, s.bids, s.asks
  from public.ob_snapshots s
  where s.symbol = 'BTCUSDT' and s.ts >= p_from and s.ts < p_to
  order by floor(extract(epoch from s.ts) / greatest(p_every, 1)), s.ts;
$$;
grant execute on function public.ob_history(timestamptz, timestamptz, int) to anon, authenticated;