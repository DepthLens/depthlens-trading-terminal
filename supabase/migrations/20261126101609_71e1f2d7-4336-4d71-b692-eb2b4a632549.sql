ALTER TABLE public.ob_snapshots ADD COLUMN trade_levels jsonb NOT NULL DEFAULT '[]', ADD COLUMN high double precision, ADD COLUMN low double precision, ADD COLUMN close double precision, ADD COLUMN price_points jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.ob_recorder_state ADD COLUMN last_agg_trade_id bigint, ADD COLUMN recording_started_at timestamptz NOT NULL DEFAULT now();
DELETE FROM public.ob_snapshots;
DELETE FROM public.ob_recorder_requests;
UPDATE public.ob_recorder_state SET last_agg_trade_id=NULL, recording_started_at=now(), binance_blocked_until=NULL, last_error=NULL WHERE id=1;
CREATE UNIQUE INDEX ob_snapshots_symbol_ts_unique ON public.ob_snapshots(symbol,ts);

CREATE OR REPLACE FUNCTION public.ob_store(p_ts timestamptz,p_source text,p_bids jsonb,p_asks jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bb float8; ba float8; mid float8; raw float8; pw float8; m float8; st float8; b0 float8; vb real[]; va real[];
BEGIN
 IF p_source <> 'binance' THEN RETURN; END IF;
 SELECT max((e->>0)::float8) INTO bb FROM jsonb_array_elements(p_bids) e;
 SELECT min((e->>0)::float8) INTO ba FROM jsonb_array_elements(p_asks) e;
 IF bb IS NULL OR ba IS NULL THEN RETURN; END IF;
 mid:=(bb+ba)/2; raw:=mid*0.00015; pw:=power(10,floor(log(raw))); m:=raw/pw; st:=(CASE WHEN m>=5 THEN 5 WHEN m>=2 THEN 2 ELSE 1 END)*pw; b0:=floor(mid/st)*st-75*st;
 WITH rows AS (SELECT floor(((e->>0)::float8-b0)/st)::int i,(e->>0)::float8*(e->>1)::float8 v FROM jsonb_array_elements(p_bids) e), agg AS (SELECT i,sum(v) v FROM rows WHERE i BETWEEN 0 AND 149 GROUP BY i) SELECT array_agg(coalesce(agg.v,0)::real ORDER BY g) INTO vb FROM generate_series(0,149) g LEFT JOIN agg ON agg.i=g;
 WITH rows AS (SELECT floor(((e->>0)::float8-b0)/st)::int i,(e->>0)::float8*(e->>1)::float8 v FROM jsonb_array_elements(p_asks) e), agg AS (SELECT i,sum(v) v FROM rows WHERE i BETWEEN 0 AND 149 GROUP BY i) SELECT array_agg(coalesce(agg.v,0)::real ORDER BY g) INTO va FROM generate_series(0,149) g LEFT JOIN agg ON agg.i=g;
 INSERT INTO public.ob_snapshots(ts,symbol,source,mid,step,base,bids,asks) VALUES(p_ts,'BTCUSDT','binance',mid,st,b0,vb,va)
 ON CONFLICT(symbol,ts) DO UPDATE SET mid=excluded.mid,step=excluded.step,base=excluded.base,bids=excluded.bids,asks=excluded.asks;
END $$;

CREATE OR REPLACE FUNCTION public.ob_store_trades(p_trades jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cursor_id bigint; first_id bigint; final_id bigint; started timestamptz; r record;
BEGIN
 SELECT last_agg_trade_id,recording_started_at INTO cursor_id,started FROM public.ob_recorder_state WHERE id=1 FOR UPDATE;
 IF jsonb_typeof(p_trades)<>'array' OR jsonb_array_length(p_trades)=0 THEN RETURN; END IF;
 SELECT min((e->>'a')::bigint),max((e->>'a')::bigint) INTO first_id,final_id FROM jsonb_array_elements(p_trades) e WHERE cursor_id IS NULL OR (e->>'a')::bigint>=cursor_id;
 IF first_id IS NULL THEN RETURN; END IF;
 IF cursor_id IS NOT NULL AND first_id<>cursor_id THEN RAISE EXCEPTION 'Trade cursor gap: expected %, got %',cursor_id,first_id; END IF;
 IF (SELECT count(DISTINCT (e->>'a')::bigint) FROM jsonb_array_elements(p_trades) e WHERE (e->>'a')::bigint BETWEEN first_id AND final_id)<>final_id-first_id+1 THEN RAISE EXCEPTION 'Non-contiguous trade response'; END IF;
 FOR r IN
 WITH trades AS (
 SELECT DISTINCT ON ((e->>'a')::bigint) (e->>'a')::bigint a,(e->>'T')::bigint t,(e->>'p')::float8 p,(e->>'q')::float8 q,(e->>'m')::boolean sell, greatest(1,(e->>'l')::bigint-(e->>'f')::bigint+1) n FROM jsonb_array_elements(p_trades) e WHERE (e->>'a')::bigint BETWEEN first_id AND final_id AND (e->>'T')::bigint>=extract(epoch FROM started)*1000 ORDER BY (e->>'a')::bigint
 ), levels AS (SELECT floor(t/5000.0)::bigint slot,floor(t/1000.0)::bigint%5 sec,p,sum(CASE WHEN NOT sell THEN q ELSE 0 END) buy,sum(CASE WHEN sell THEN q ELSE 0 END) sell,sum(n) n FROM trades GROUP BY 1,2,3), paths AS (SELECT DISTINCT ON (floor(t/1000.0)) floor(t/5000.0)::bigint slot,floor(t/1000.0)::bigint%5 sec,p FROM trades ORDER BY floor(t/1000.0),a DESC), stats AS (SELECT floor(t/5000.0)::bigint slot,max(p) hi,min(p) lo,(array_agg(p ORDER BY a DESC))[1] last FROM trades GROUP BY 1)
 SELECT s.*, (SELECT jsonb_agg(jsonb_build_array(p,buy,sell,n,sec) ORDER BY sec,p) FROM levels l WHERE l.slot=s.slot) levels,(SELECT jsonb_agg(jsonb_build_array(sec,p) ORDER BY sec) FROM paths p WHERE p.slot=s.slot) points FROM stats s
 LOOP
 INSERT INTO public.ob_snapshots(ts,symbol,source,mid,step,base,bids,asks,trade_levels,high,low,close,price_points) VALUES(to_timestamp(r.slot*5),'BTCUSDT','binance',r.last,1,r.last,'{}','{}',r.levels,r.hi,r.lo,r.last,r.points)
 ON CONFLICT(symbol,ts) DO UPDATE SET trade_levels=public.ob_snapshots.trade_levels||excluded.trade_levels, high=greatest(public.ob_snapshots.high,excluded.high),low=least(public.ob_snapshots.low,excluded.low),close=excluded.close,price_points=public.ob_snapshots.price_points||excluded.price_points;
 END LOOP;
 UPDATE public.ob_recorder_state SET last_agg_trade_id=final_id+1,updated_at=now() WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION public.ob_store_trades(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_store_trades(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ob_recorder_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; j jsonb; rid bigint; next_id bigint; started timestamptz; blocked timestamptz; slot timestamptz;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('ob_recorder_tick')) THEN RETURN; END IF;
 FOR r IN SELECT q.request_id,q.ts,q.source,s.status_code,s.content,s.error_msg FROM public.ob_recorder_requests q JOIN net._http_response s ON s.id=q.request_id ORDER BY q.created_at,q.source LOOP
 BEGIN
 IF r.status_code=200 THEN
 j:=r.content::jsonb;
 IF r.source='binance' THEN PERFORM public.ob_store(r.ts,'binance',j->'bids',j->'asks');
 ELSIF r.source='binance-trades' THEN PERFORM public.ob_store_trades(j); END IF;
 ELSE
 UPDATE public.ob_recorder_state SET last_error=r.source||' '||coalesce(r.status_code::text,r.error_msg,'timeout'),binance_blocked_until=CASE WHEN r.status_code IN (418,429,451) THEN now()+interval '2 minutes' ELSE binance_blocked_until END,updated_at=now() WHERE id=1;
 END IF;
 EXCEPTION WHEN OTHERS THEN UPDATE public.ob_recorder_state SET last_error=left(sqlerrm,200),updated_at=now() WHERE id=1;
 END;
 DELETE FROM public.ob_recorder_requests WHERE request_id=r.request_id;
 END LOOP;
 DELETE FROM public.ob_recorder_requests WHERE created_at<now()-interval '1 minute';
 SELECT last_agg_trade_id,recording_started_at,binance_blocked_until INTO next_id,started,blocked FROM public.ob_recorder_state WHERE id=1;
 IF blocked>now() THEN RETURN; END IF;
 slot:=to_timestamp(floor(extract(epoch FROM now())/5)*5);
 IF NOT EXISTS(SELECT 1 FROM public.ob_recorder_requests WHERE source='binance') THEN PERFORM public.ob_fire(slot,'binance'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ob_recorder_requests WHERE source='binance-trades') THEN
 rid:=net.http_get('https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=1000'||CASE WHEN next_id IS NULL THEN '&startTime='||floor(extract(epoch FROM started)*1000)::bigint::text ELSE '&fromId='||next_id::text END,timeout_milliseconds:=4000);
 INSERT INTO public.ob_recorder_requests(request_id,ts,source) VALUES(rid,slot,'binance-trades');
 END IF;
END $$;

DROP FUNCTION public.ob_history(timestamptz,timestamptz,integer);
CREATE FUNCTION public.ob_history(p_from timestamptz,p_to timestamptz,p_every integer) RETURNS TABLE(ts timestamptz,source text,mid float8,step float8,base float8,bids real[],asks real[],trade_levels jsonb,high float8,low float8,close float8,price_points jsonb) LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT DISTINCT ON (floor(extract(epoch FROM s.ts)/greatest(p_every,1))) s.ts,s.source,s.mid,s.step,s.base,s.bids,s.asks,s.trade_levels,s.high,s.low,s.close,s.price_points FROM public.ob_snapshots s WHERE s.symbol='BTCUSDT' AND s.ts>=p_from AND s.ts<p_to ORDER BY floor(extract(epoch FROM s.ts)/greatest(p_every,1)),s.ts;
$$;
REVOKE ALL ON FUNCTION public.ob_history(timestamptz,timestamptz,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ob_history(timestamptz,timestamptz,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ob_recorder_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cutoff timestamptz; bytes bigint; rows bigint; keep_rows bigint;
BEGIN
 DELETE FROM public.ob_snapshots WHERE ts<now()-interval '7 days';
 SELECT pg_total_relation_size('public.ob_snapshots'),count(*) INTO bytes,rows FROM public.ob_snapshots;
 IF bytes>250000000 AND rows>0 THEN
 keep_rows:=greatest(720, floor(rows*230000000.0/bytes)::bigint);
 SELECT ts INTO cutoff FROM public.ob_snapshots ORDER BY ts DESC OFFSET keep_rows LIMIT 1;
 IF cutoff IS NOT NULL THEN DELETE FROM public.ob_snapshots WHERE ts<=cutoff; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.ob_recorder_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ob_recorder_cleanup() TO service_role;
SELECT cron.alter_job(2,command:='select public.ob_recorder_cleanup()');