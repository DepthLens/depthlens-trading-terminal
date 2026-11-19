create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.ob_snapshots (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  symbol text not null default 'BTCUSDT',
  source text not null,
  mid double precision not null,
  step double precision not null,
  base double precision not null,
  bids real[] not null,
  asks real[] not null,
  created_at timestamptz not null default now()
);
create index ob_snapshots_symbol_ts on public.ob_snapshots(symbol, ts);
grant select on public.ob_snapshots to anon, authenticated;
grant all on public.ob_snapshots to service_role;
alter table public.ob_snapshots enable row level security;
create policy "Recorded order book is public market data" on public.ob_snapshots for select to anon, authenticated using (true);

create table public.ob_recorder_requests (
  request_id bigint primary key,
  ts timestamptz not null,
  source text not null,
  created_at timestamptz not null default now()
);
grant all on public.ob_recorder_requests to service_role;
alter table public.ob_recorder_requests enable row level security;

create table public.ob_recorder_state (
  id int primary key default 1,
  binance_blocked_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
grant all on public.ob_recorder_state to service_role;
alter table public.ob_recorder_state enable row level security;
insert into public.ob_recorder_state(id) values (1);

-- Group a raw book into 150 rows (USDT notional per row) around the mid price.
create or replace function public.ob_store(p_ts timestamptz, p_source text, p_bids jsonb, p_asks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare bb float8; ba float8; mid float8; raw float8; pw float8; m float8; st float8; b0 float8; vb real[]; va real[];
begin
  select max((e->>0)::float8) into bb from jsonb_array_elements(p_bids) e;
  select min((e->>0)::float8) into ba from jsonb_array_elements(p_asks) e;
  if bb is null or ba is null then return; end if;
  mid := (bb + ba) / 2;
  raw := mid * 0.00015;
  pw := power(10, floor(log(raw)));
  m := raw / pw;
  st := (case when m >= 5 then 5 when m >= 2 then 2 else 1 end) * pw;
  b0 := floor(mid / st) * st - 75 * st;
  with rows as (
    select floor(((e->>0)::float8 - b0) / st)::int i, (e->>0)::float8 * (e->>1)::float8 v from jsonb_array_elements(p_bids) e
  ), agg as (select i, sum(v) v from rows where i between 0 and 149 group by i)
  select array_agg(coalesce(agg.v, 0)::real order by g) into vb from generate_series(0, 149) g left join agg on agg.i = g;
  with rows as (
    select floor(((e->>0)::float8 - b0) / st)::int i, (e->>0)::float8 * (e->>1)::float8 v from jsonb_array_elements(p_asks) e
  ), agg as (select i, sum(v) v from rows where i between 0 and 149 group by i)
  select array_agg(coalesce(agg.v, 0)::real order by g) into va from generate_series(0, 149) g left join agg on agg.i = g;
  insert into public.ob_snapshots(ts, symbol, source, mid, step, base, bids, asks) values (p_ts, 'BTCUSDT', p_source, mid, st, b0, vb, va);
end $$;

create or replace function public.ob_fire(p_ts timestamptz, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if p_source = 'binance' then
    rid := net.http_get('https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000', timeout_milliseconds := 4000);
  else
    rid := net.http_get('https://api.bybit.com/v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=500', timeout_milliseconds := 4000);
  end if;
  insert into public.ob_recorder_requests(request_id, ts, source) values (rid, p_ts, p_source);
end $$;

-- Runs every 5 seconds: store finished responses, fall back to Bybit when Binance refuses, fire the next request.
create or replace function public.ob_recorder_tick()
returns void language plpgsql security definer set search_path = public as $$
declare r record; j jsonb; blocked timestamptz;
begin
  for r in select q.request_id, q.ts, q.source, s.status_code, s.content, s.timed_out, s.error_msg
           from public.ob_recorder_requests q join net._http_response s on s.id = q.request_id loop
    begin
      if r.status_code = 200 then
        j := r.content::jsonb;
        if r.source = 'binance' then perform public.ob_store(r.ts, 'binance', j->'bids', j->'asks');
        elsif (j->>'retCode') = '0' then perform public.ob_store(r.ts, 'bybit', j->'result'->'b', j->'result'->'a');
        else update public.ob_recorder_state set last_error = 'bybit ' || coalesce(j->>'retMsg', '?'), updated_at = now() where id = 1;
        end if;
      elsif r.source = 'binance' then
        update public.ob_recorder_state set binance_blocked_until = now() + interval '2 minutes',
          last_error = 'binance ' || coalesce(r.status_code::text, r.error_msg, 'timeout'), updated_at = now() where id = 1;
        perform public.ob_fire(r.ts, 'bybit');
      else
        update public.ob_recorder_state set last_error = 'bybit ' || coalesce(r.status_code::text, r.error_msg, 'timeout'), updated_at = now() where id = 1;
      end if;
    exception when others then
      update public.ob_recorder_state set last_error = left(sqlerrm, 200), updated_at = now() where id = 1;
    end;
    delete from public.ob_recorder_requests where request_id = r.request_id;
  end loop;
  delete from public.ob_recorder_requests where created_at < now() - interval '1 minute';
  select binance_blocked_until into blocked from public.ob_recorder_state where id = 1;
  perform public.ob_fire(date_trunc('second', now()), case when blocked > now() then 'bybit' else 'binance' end);
end $$;

create or replace function public.ob_recorder_status()
returns jsonb language sql stable security definer set search_path = public as $$
  with h as (select ts, source, ts - lag(ts) over (order by ts) d from public.ob_snapshots where symbol = 'BTCUSDT' and ts > now() - interval '1 hour')
  select jsonb_build_object(
    'last', (select max(ts) from public.ob_snapshots where symbol = 'BTCUSDT'),
    'lastHour', (select count(*) from h),
    'gaps', (select count(*) from h where d > interval '15 seconds'),
    'maxGapSec', (select coalesce(extract(epoch from max(d)), 0) from h),
    'lastSource', (select source from h order by ts desc limit 1),
    'lastError', (select last_error from public.ob_recorder_state where id = 1));
$$;

revoke execute on function public.ob_store(timestamptz, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.ob_fire(timestamptz, text) from public, anon, authenticated;
revoke execute on function public.ob_recorder_tick() from public, anon, authenticated;
grant execute on function public.ob_recorder_status() to anon, authenticated;