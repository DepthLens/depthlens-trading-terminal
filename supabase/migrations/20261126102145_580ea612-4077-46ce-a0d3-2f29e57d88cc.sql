CREATE OR REPLACE FUNCTION public.ob_recorder_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cutoff timestamptz; bytes bigint; rows bigint; keep_rows bigint;
BEGIN
 DELETE FROM public.ob_snapshots WHERE ts<now()-interval '7 days';
 -- Retained payload plus 30% index/row headroom; physical relation size includes reusable deleted pages.
 SELECT ceil(coalesce(sum(pg_column_size(s)),0)*1.3),count(*) INTO bytes,rows FROM public.ob_snapshots s;
 IF bytes>250000000 AND rows>0 THEN
 keep_rows:=greatest(720,floor(rows*230000000.0/bytes)::bigint);
 SELECT ts INTO cutoff FROM public.ob_snapshots ORDER BY ts DESC OFFSET keep_rows LIMIT 1;
 IF cutoff IS NOT NULL THEN DELETE FROM public.ob_snapshots WHERE ts<=cutoff; END IF;
 END IF;
END $$;