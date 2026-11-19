drop extension if exists pg_net;
create extension pg_net schema extensions;

create or replace function public.ob_recorder_status()
returns jsonb language sql stable security invoker set search_path = public as $$
  with h as (select ts, source, ts - lag(ts) over (order by ts) d from public.ob_snapshots where symbol = 'BTCUSDT' and ts > now() - interval '1 hour')
  select jsonb_build_object(
    'last', (select max(ts) from public.ob_snapshots where symbol = 'BTCUSDT'),
    'lastHour', (select count(*) from h),
    'gaps', (select count(*) from h where d > interval '15 seconds'),
    'maxGapSec', (select coalesce(extract(epoch from max(d)), 0) from h),
    'lastSource', (select source from h order by ts desc limit 1));
$$;