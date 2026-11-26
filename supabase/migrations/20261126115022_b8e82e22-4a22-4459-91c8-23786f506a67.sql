ALTER TABLE public.ob_recorder_state ADD COLUMN IF NOT EXISTS oldest_removed_day date, ADD COLUMN IF NOT EXISTS retention_warning text;

CREATE OR REPLACE FUNCTION public.ob_snapshots_bytes() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT sum(pg_column_size(s.*)) FROM public.ob_snapshots s),0)::bigint + pg_indexes_size('public.ob_snapshots')
$$;

CREATE OR REPLACE FUNCTION public.ob_recorder_cleanup_budget(p_budget bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d date; protect date := (now() AT TIME ZONE 'utc')::date - 2;
BEGIN
 DELETE FROM net._http_response r WHERE r.created < now() - interval '1 hour' OR NOT EXISTS (SELECT 1 FROM public.ob_recorder_requests q WHERE q.request_id = r.id);
 DELETE FROM cron.job_run_details WHERE end_time < now() - interval '1 day';
 UPDATE public.ob_recorder_state SET retention_warning = NULL WHERE id = 1;
 LOOP
  EXIT WHEN public.ob_snapshots_bytes() <= p_budget;
  SELECT min((ts AT TIME ZONE 'utc')::date) INTO d FROM public.ob_snapshots;
  IF d IS NULL OR d >= protect THEN
   UPDATE public.ob_recorder_state SET retention_warning = 'Over budget but only the last 2 full days remain; kept them', updated_at = now() WHERE id = 1;
   EXIT;
  END IF;
  DELETE FROM public.ob_snapshots WHERE ts >= (d::timestamp AT TIME ZONE 'utc') AND ts < ((d + 1)::timestamp AT TIME ZONE 'utc');
  UPDATE public.ob_recorder_state SET oldest_removed_day = d, updated_at = now() WHERE id = 1;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ob_recorder_cleanup() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ob_recorder_cleanup_budget(400000000);
$$;

CREATE OR REPLACE FUNCTION public.ob_retention_stats() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 WITH b AS (SELECT public.ob_snapshots_bytes() bytes, min(ts) first, max(ts) last FROM public.ob_snapshots WHERE auth.uid() IS NOT NULL)
 SELECT jsonb_build_object('first', b.first, 'last', b.last, 'bytes', b.bytes, 'budget', 400000000,
   'perDay', CASE WHEN b.last > b.first THEN b.bytes / greatest(extract(epoch FROM b.last - b.first)/86400.0, 1.0/24) ELSE NULL END,
   'oldestRemovedDay', s.oldest_removed_day, 'warning', s.retention_warning)
 FROM b, public.ob_recorder_state s WHERE s.id = 1;
$$;
REVOKE EXECUTE ON FUNCTION public.ob_recorder_cleanup_budget(bigint), public.ob_snapshots_bytes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ob_retention_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ob_retention_stats() TO authenticated;