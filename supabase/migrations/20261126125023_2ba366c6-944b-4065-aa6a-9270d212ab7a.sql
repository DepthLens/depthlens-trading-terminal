CREATE OR REPLACE FUNCTION public.ob_trade_profile(p_from timestamptz, p_to timestamptz, p_bin float8)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
WITH r AS (
  SELECT s.ts, s.trade_levels FROM public.ob_snapshots s
  WHERE s.symbol='BTCUSDT' AND s.ts >= p_from - interval '5 seconds' AND s.ts < p_to
    AND s.trade_levels IS NOT NULL AND jsonb_array_length(s.trade_levels) > 0
), t AS (
  SELECT r.ts + make_interval(secs => (e->>4)::float8) AS at, (e->>0)::float8 AS price, (e->>1)::float8 AS buy, (e->>2)::float8 AS sell
  FROM r, jsonb_array_elements(r.trade_levels) e
), f AS (
  SELECT * FROM t WHERE at >= p_from AND at < p_to
), lim AS (
  SELECT max(at) AS mx, (p_to < now() - interval '60 seconds') AS closed FROM f
), g AS (
  -- An open range drops its newest second: it may be partially recorded, live trades cover it instead.
  SELECT f.* FROM f, lim WHERE lim.closed OR f.at < lim.mx
)
SELECT jsonb_build_object(
  'first', (SELECT min(at) FROM f),
  'cutoff', CASE WHEN (SELECT closed FROM lim) THEN p_to ELSE (SELECT mx FROM lim) END,
  'levels', coalesce((SELECT jsonb_agg(jsonb_build_array(x.b * greatest(p_bin,1e-9), round(x.bs::numeric, 6), round(x.ss::numeric, 6)))
     FROM (SELECT round(price / greatest(p_bin,1e-9)) AS b, sum(buy) AS bs, sum(sell) AS ss FROM g GROUP BY 1) x), '[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.ob_trade_profile(timestamptz,timestamptz,float8) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ob_trade_profile(timestamptz,timestamptz,float8) TO authenticated, service_role;