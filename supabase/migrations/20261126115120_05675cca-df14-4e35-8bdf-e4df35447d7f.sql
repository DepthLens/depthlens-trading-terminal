GRANT SELECT ON public.ob_recorder_state TO authenticated;
CREATE POLICY "Signed-in users read recorder state" ON public.ob_recorder_state FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE OR REPLACE FUNCTION public.ob_retention_stats() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
 WITH b AS (SELECT coalesce(sum(pg_column_size(s.*)),0)::bigint + pg_indexes_size('public.ob_snapshots') bytes, min(ts) first, max(ts) last FROM public.ob_snapshots s)
 SELECT jsonb_build_object('first', b.first, 'last', b.last, 'bytes', b.bytes, 'budget', 400000000,
   'perDay', CASE WHEN b.last > b.first THEN b.bytes / greatest(extract(epoch FROM b.last - b.first)/86400.0, 1.0/24) ELSE NULL END,
   'oldestRemovedDay', (SELECT oldest_removed_day FROM public.ob_recorder_state WHERE id = 1),
   'warning', (SELECT retention_warning FROM public.ob_recorder_state WHERE id = 1))
 FROM b;
$$;