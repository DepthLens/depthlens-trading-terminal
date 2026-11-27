CREATE OR REPLACE FUNCTION public.ob_cvd(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
WITH r AS (
  SELECT s.ts, s.trade_levels FROM public.ob_snapshots s
  WHERE s.symbol='BTCUSDT' AND s.ts >= p_from - interval '5 seconds' AND s.ts < p_to
    AND s.trade_levels IS NOT NULL AND jsonb_array_length(s.trade_levels) > 0
), t AS (
  SELECT r.ts + make_interval(secs => (e->>4)::float8) AS at, (e->>0)::float8 AS price, (e->>1)::float8 AS buy, (e->>2)::float8 AS sell
  FROM r, jsonb_array_elements(r.trade_levels) e
), f AS (SELECT * FROM t WHERE at >= p_from AND at < p_to
), lim AS (SELECT max(at) AS mx, (p_to < now() - interval '60 seconds') AS closed FROM f
), g AS (SELECT f.* FROM f, lim WHERE lim.closed OR f.at < lim.mx
), b AS (
  SELECT (floor(extract(epoch FROM at) / 60) * 60000)::bigint AS m,
    sum(buy) bc, sum(sell) sc, sum(buy*price) bq, sum(sell*price) sq FROM g GROUP BY 1
)
SELECT jsonb_build_object(
  'first', (SELECT min(at) FROM f),
  'cutoff', CASE WHEN (SELECT closed FROM lim) THEN p_to ELSE (SELECT mx FROM lim) END,
  'minutes', coalesce((SELECT jsonb_agg(jsonb_build_array(m, round(bc::numeric,6), round(sc::numeric,6), round(bq::numeric,2), round(sq::numeric,2)) ORDER BY m) FROM b), '[]'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.ob_cvd(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ob_cvd(timestamptz, timestamptz) TO authenticated, service_role;